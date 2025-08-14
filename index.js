// Polyfill fetch on older Node (Render uses Node 18+/22 so this won't run)
if (typeof fetch === "undefined") {
  global.fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
}

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");

const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { spec } = require("./docs/openapi");
const { startDailyDigestJob } = require("./jobs/dailyDigest.job");

// routes
const authRoutes = require("./routes/auth.routes");
const notesRoutes = require("./routes/notes.routes");
const journalsRoutes = require("./routes/journals.routes");
const calendarRoutes = require("./routes/calendar.routes");
const articlesRoutes = require("./routes/articles.routes");
const digestsRoutes = require("./routes/digests.routes");
const aiRoutes = require("./routes/ai.routes");

const app = express();

/* ---------- CORS (works for Vercel + Render) ---------- */
const raw = process.env.CORS_ORIGIN || "*";
const allowAll = raw === "*" || raw === "*,*";
const whitelist = allowAll ? [] : raw.split(",").map(s => s.trim()).filter(Boolean);

const corsOptions = {
  origin: allowAll
    ? "*" // returns Access-Control-Allow-Origin: *
    : function (origin, cb) {
        if (!origin) return cb(null, true); // curl / server-to-server
        const ok = whitelist.includes(origin) || /\.vercel\.app$/.test(origin);
        cb(ok ? null : new Error("Not allowed by CORS"), ok);
      },
  credentials: !allowAll, // must be false when origin is "*"
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // preflight

app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

/* ---------- Public health & docs ---------- */
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, env: process.env.NODE_ENV || "development" })
);

// OpenAPI/Swagger
app.get("/api/openapi.json", (_req, res) => res.json(spec));
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(spec, { explorer: true, customSiteTitle: "myjournal API Docs" })
);

/* ---------- DB + jobs ---------- */
connectDB();
// Only run the cron when enabled (and feel free to run in dev)
if (process.env.ENABLE_JOBS === "true" || process.env.NODE_ENV !== "production") {
  startDailyDigestJob(app);
}

/* ---------- Feature routers ---------- */
app.use("/api/auth", authRoutes);        // public
app.use("/api/notes", notesRoutes);      // auth inside each router
app.use("/api/journals", journalsRoutes);
app.use("/api/articles", articlesRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/digests", digestsRoutes);
app.use("/api/ai", aiRoutes);

/* ---------- 404 + errors ---------- */
app.use(notFound);
app.use(errorHandler);

/* ---------- listen ---------- */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
