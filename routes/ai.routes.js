const router = require("express").Router();
const { authRequired } = require("../middleware/auth");
const ai = require("../services/ai.service");

// whoami (no auth) — safe to expose
router.get("/whoami", (_req, res) => {
  res.json({
    provider: (process.env.AI_PROVIDER || "openai").toLowerCase(),
    model: process.env.AI_MODEL || process.env.GEMINI_MODEL || null,
    base: process.env.AI_API_BASE || "openai:chat",
  });
});

// summarize (auth)
router.post("/summarize", authRequired, async (req, res) => {
  const { text, mode } = req.body || {};
  if (!text) return res.status(400).json({ error: "text is required" });
  try {
    const out = await ai.summarize(text, { mode: mode || "tldr" });
    res.json({ summary: out });
  } catch (e) {
    res.status(500).json({ error: "AI failed" });
  }
});

module.exports = router;
