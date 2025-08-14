const router = require("express").Router();
const { authRequired } = require("../middleware/auth");
const Article = require("../models/Article");
const ai = require("../services/ai.service");

router.use(authRequired);

router.post("/summarize", async (req, res) => {
  try {
    const { text, articleId, mode = "detailed" } = req.body || {};
    let input = (text || "").trim();

    if (!input && articleId) {
      const a = await Article.findOne({ _id: articleId, createdBy: req.userId }).lean();
      if (!a) return res.status(404).json({ error: "Article not found" });
      input = (a.contentHTML && a.contentHTML.trim()) ||
              [a.title || "", a.excerpt || ""].filter(Boolean).join(". ");
    }

    if (!input) return res.status(400).json({ error: "No text to summarize" });

    const summary = await ai.summarize(input, { mode });
    return res.json({ summary: summary || "" });
  } catch (e) {
    console.error("ai.summarize error:", e);
    return res.status(500).json({ error: "AI summarize failed" });
  }
});

module.exports = router;
