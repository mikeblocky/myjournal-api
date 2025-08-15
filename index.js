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

const rawOrigins = (process.env.CORS_ORIGIN || "*").trim();
const allowAll = rawOrigins === "*" || rawOrigins === "*,*";

const defaultAllowed = [
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
  // Explicitly allow your Vercel frontend
  "https://myjournal-ht7p.vercel.app",
];

const configuredList = allowAll
  ? []
  : rawOrigins
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

// Debug logging for CORS configuration
console.log("CORS Configuration:");
console.log("- CORS_ORIGIN env var:", process.env.CORS_ORIGIN);
console.log("- Raw origins:", rawOrigins);
console.log("- Allow all:", allowAll);
console.log("- Default allowed:", defaultAllowed);
console.log("- Configured list:", configuredList);

function isAllowedOrigin(origin) {
  // Handle missing or invalid origin
  if (!origin || typeof origin !== 'string') return false;
  
  // Temporarily allow all origins for debugging
  return true;
  
  // Original logic (commented out for debugging)
  /*
  if (allowAll) return true;

  // Exact matches
  if (configuredList.includes(origin)) return true;
  if (defaultAllowed.includes(origin)) return true;

  // Wildcards
  if (/^https:\/\/[^/]+\.vercel\.app$/.test(origin)) return true;

  // Debug logging
  console.log(`CORS check - Origin: ${origin}, Allowed: ${configuredList.includes(origin) || defaultAllowed.includes(origin) || /^https:\/\/[^/]+\.vercel\.app$/.test(origin)}`);

  return false;
  */
}

// Add Vary: Origin and set ACAO early so even error responses carry it
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Always set Vary: Origin for proper caching
  res.setHeader("Vary", "Origin");
  
  // Temporarily allow all origins for debugging
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  
  // Debug logging for all requests
  console.log(`Request - Method: ${req.method}, Path: ${req.path}, Origin: ${origin}, Allowed: true`);
  
  next();
});

// cors() to handle the rest (headers & preflight)
app.use(
  cors({
    origin: true, // Allow all origins temporarily
    credentials: true, // Allow credentials
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    optionsSuccessStatus: 204,
    preflightContinue: false,
  })
);

// Make sure OPTIONS short-circuits quickly for all paths
app.options("*", (req, res) => {
  const origin = req.headers.origin;
  
  // Set CORS headers for preflight requests - temporarily allow all
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400"); // Cache preflight for 24 hours
  
  // Debug logging
  console.log(`OPTIONS preflight - Origin: ${origin}, Allowed: true`);
  
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

// Test CORS endpoint
app.get("/api/test-cors", (req, res) => {
  const origin = req.headers.origin;
  console.log(`Test CORS endpoint - Origin: ${origin}`);
  res.json({ 
    message: "CORS test successful", 
    origin: origin,
    timestamp: new Date().toISOString()
  });
});

// Test CORS with POST (similar to AI summarize)
app.post("/api/test-cors-post", (req, res) => {
  const origin = req.headers.origin;
  console.log(`Test CORS POST endpoint - Origin: ${origin}, Body:`, req.body);
  res.json({ 
    message: "CORS POST test successful", 
    origin: origin,
    body: req.body,
    timestamp: new Date().toISOString()
  });
});

// Test CORS with AI-like endpoint (no auth required)
app.post("/api/test-ai-cors", (req, res) => {
  const origin = req.headers.origin;
  console.log(`Test AI CORS endpoint - Origin: ${origin}, Body:`, req.body);
  res.json({ 
    message: "AI CORS test successful", 
    origin: origin,
    body: req.body,
    timestamp: new Date().toISOString()
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

// CORS error handler
app.use((err, req, res, next) => {
  if (err.message === 'CORS') {
    const origin = req.headers.origin;
    console.error(`CORS Error - Origin: ${origin}, Path: ${req.path}`);
    return res.status(403).json({
      error: 'CORS policy violation',
      origin: origin,
      message: 'Origin not allowed by CORS policy'
    });
  }
  next(err);
});

app.use(notFound);
app.use(errorHandler);

/* ──────────────────────────────────────────────────────────────────────────
   Listen
   ────────────────────────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
