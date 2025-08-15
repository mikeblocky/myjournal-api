// backend/src/index.js
"use strict";

// Polyfill fetch for older Node only (Render uses modern Node, but this is safe)
if (typeof fetch === "undefined") {
  global.fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
}

require("dotenv").config();

// Check required environment variables
function checkRequiredEnvVars() {
  const required = [
    { name: 'JWT_SECRET', description: 'Secret key for JWT token signing' },
    { name: 'MONGODB_URI', description: 'MongoDB connection string' }
  ];
  
  const missing = [];
  for (const { name, description } of required) {
    if (!process.env[name]) {
      missing.push({ name, description });
    }
  }
  
  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach(({ name, description }) => {
      console.error(`   ${name}: ${description}`);
    });
    console.error("\nPlease set these environment variables and restart the server.");
    process.exit(1);
  }
  
  console.log("✅ All required environment variables are set");
}

// Check environment variables before starting
checkRequiredEnvVars();

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

// CORS Configuration
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:4173", 
  "http://localhost:3000",
  "http://localhost:8080",
  "http://localhost:8000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:3000",
  "https://myjournal-ht7p.vercel.app",
  "https://myjournal.vercel.app"
];

// Add any additional origins from environment variable
if (process.env.CORS_ORIGIN) {
  const additionalOrigins = process.env.CORS_ORIGIN.split(',').map(origin => origin.trim());
  allowedOrigins.push(...additionalOrigins);
}

console.log("CORS Configuration - Allowed Origins:", allowedOrigins);

// Simple CORS middleware configuration
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 204
}));



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

// Test CORS endpoint
app.get("/api/test-cors", (req, res) => {
  const origin = req.headers.origin;
  console.log(`Test CORS endpoint - Origin: ${origin}`);
  res.json({ 
    message: "CORS test successful", 
    origin: origin,
    timestamp: new Date().toISOString(),
    allowedOrigins: allowedOrigins
  });
});


app.get("/api/openapi.json", (_req, res) => res.json(spec));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec, {
  explorer: true,
  customSiteTitle: "myjournal API Docs",
}));

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
