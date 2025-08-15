// backend/src/index.js
"use strict";

// Polyfill fetch for older Node only (Render uses modern Node, but this is safe)
if (typeof fetch === "undefined") {
  global.fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
}

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");

// Local modules
const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { spec } = require("./docs/openapi");
const { startDailyDigestJob } = require("./jobs/dailyDigest.job");

// Routers
const authRoutes     = require("./routes/auth.routes");
const notesRoutes    = require("./routes/notes.routes");
const journalsRoutes = require("./routes/journals.routes");
const calendarRoutes = require("./routes/calendar.routes");
const articlesRoutes = require("./routes/articles.routes");
const digestsRoutes  = require("./routes/digests.routes");
const aiRoutes       = require("./routes/ai.routes");

const app = express();

/* ──────────────────────────────────────────────────────────────────────────
   CORS (Vercel frontend -> Render API)
   - Set CORS_ORIGIN env as comma-separated list (no spaces), e.g.:
     CORS_ORIGIN=https://your-app.vercel.app,http://localhost:5173
   - We also allow *.vercel.app by default.
   - If you truly want open CORS: CORS_ORIGIN=*
   ────────────────────────────────────────────────────────────────────────── */
const rawOrigins = (process.env.CORS_ORIGIN || "").trim();
const allowAll = rawOrigins === "*" || rawOrigins === "*,*";

const defaultAllowed = [
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
];

const configuredList = allowAll
  ? []
  : rawOrigins
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true; // server-to-server / curl
  if (allowAll) return true;

  // Exact matches
  if (configuredList.includes(origin)) return true;
  if (defaultAllowed.includes(origin)) return true;

  // Wildcards
  if (/^https:\/\/[^/]+\.vercel\.app$/.test(origin)) return true;

  return false;
}

// Add Vary: Origin and set ACAO early so even error responses carry it
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Origin", allowAll ? "*" : origin);
    if (!allowAll) {
      // Only send credentials when we reflect the origin
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  }
  next();
});

// cors() to handle the rest (headers & preflight)
app.use(
  cors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: !allowAll, // must be false if origin="*"
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  })
);

// Make sure OPTIONS short-circuits quickly for all paths
app.options("*", (req, res) => {
  // When allowAll we already set ACAO:* above; else reflect the origin
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res.sendStatus(204);
});

/* ──────────────────────────────────────────────────────────────────────────
   Core middleware
   ────────────────────────────────────────────────────────────────────────── */
app.set("trust proxy", 1); // Render behind proxy
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

/* ──────────────────────────────────────────────────────────────────────────
   Public health & docs
   ────────────────────────────────────────────────────────────────────────── */
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, env: process.env.NODE_ENV || "development" })
);
app.get("/api/openapi.json", (_req, res) => res.json(spec));
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(spec, { explorer: true, customSiteTitle: "myjournal API Docs" })
);

/* ──────────────────────────────────────────────────────────────────────────
   DB + jobs
   ────────────────────────────────────────────────────────────────────────── */
connectDB();

// Only run the cron in development or when explicitly enabled
if (process.env.ENABLE_JOBS === "true" || process.env.NODE_ENV !== "production") {
  startDailyDigestJob(app);
}

/* ──────────────────────────────────────────────────────────────────────────
   Feature routers
   ────────────────────────────────────────────────────────────────────────── */
app.use("/api/auth", authRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/journals", journalsRoutes);
app.use("/api/articles", articlesRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/digests", digestsRoutes);
app.use("/api/ai", aiRoutes);

/* ──────────────────────────────────────────────────────────────────────────
   404 + errors
   ────────────────────────────────────────────────────────────────────────── */
app.use(notFound);
app.use(errorHandler);

/* ──────────────────────────────────────────────────────────────────────────
   Listen
   ────────────────────────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
