if (typeof fetch === "undefined") {
  global.fetch = (...args) => import("node-fetch").then(({default: f}) => f(...args));
}

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const connectDB = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorHandler");

// routes
const authRoutes = require("./routes/auth.routes");
const notesRoutes = require("./routes/notes.routes");
const journalsRoutes = require("./routes/journals.routes");
const calendarRoutes = require("./routes/calendar.routes");
const articlesRoutes = require("./routes/articles.routes");
const digestsRoutes = require("./routes/digests.routes");
const aiRoutes = require("./routes/ai.routes");
const swaggerUi = require("swagger-ui-express");
const { spec } = require("./docs/openapi");
const { startDailyDigestJob } = require("./jobs/dailyDigest.job");

const app = express();

// middleware
app.use(cors({
  origin: (process.env.CORS_ORIGIN || "http://localhost:5173").split(","),
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

// db + jobs
connectDB();
startDailyDigestJob(app);

// health first
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, env: process.env.NODE_ENV || "development" })
);

// public auth
app.use("/api/auth", authRoutes);

// protected feature routers
app.use("/api/notes", notesRoutes);
app.use("/api/journals", journalsRoutes);
app.use("/api/articles", articlesRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/digests", require("./routes/digests.routes"));
app.use("/api/ai", aiRoutes);     
app.get("/api/openapi.json", (_req, res) => res.json(spec));
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(spec, {
    explorer: true,
    customSiteTitle: "myjournal API Docs",
  })
);

// 404 + errors
app.use(notFound);
app.use(errorHandler);

// listen
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
