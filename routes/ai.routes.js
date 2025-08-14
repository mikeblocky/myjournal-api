const router = require("express").Router();
const { authRequired } = require("../middleware/auth");
const ai = require("../services/ai.service");
const Article = require("../models/Article");

router.get("/whoami", (_req, res) => {
  res.json({
    provider: (process.env.AI_PROVIDER || "openai").toLowerCase(),
    base: process.env.AI_API_BASE || "openai:chat",
    model: process.env.AI_MODEL || process.env.GEMINI_MODEL || null
  });
});

router.post("/summarize", authRequired, async (req, res) => {
  try {
    const { text, mode = "tldr", articleId } = req.body || {};

    let input = text;
    if (!input && articleId) {
      const a = await Article.findOne({ _id: articleId, createdBy: req.userId }).lean();
      if (!a) return res.status(404).json({ error: "Article not found" });
      input = a.contentHTML || `${a.title || ""}. ${a.excerpt || ""}`;
    }
    if (!input) return res.status(400).json({ error: "text or articleId required" });

    const summary = await ai.summarize(input, { mode });
    return res.json({ summary });
  } catch (e) {
    console.error("ai.summarize failed:", e);
    return res.status(500).json({ error: "AI failed" });
  }
});

module.exports = router;
