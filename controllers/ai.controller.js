// backend/src/controllers/ai.controller.js
const { z } = require("zod");
const Article = require("../models/Article");
const { summarize } = require("../services/ai.service");
const { fetchAndParse } = require("../services/reader.service");

// helpers
function stripHtml(s = "") { return String(s).replace(/<[^>]+>/g, " "); }
function compress(s = "")  { return String(s).replace(/\s+/g, " ").trim(); }
function removeAll(text = "", phrase = "") {
  if (!phrase) return text;
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(esc, "gi"), " ");
}

const bodySchema = z.object({
  text: z.string().min(1).optional(),
  articleId: z.string().optional(),
  mode: z.enum(["tldr","detailed","outline"]).default("tldr"),
}).refine(v => v.text || v.articleId, { message: "Provide text or articleId" });

async function summarizeCtrl(req, res, next) {
  try {
    const { text, articleId, mode } = bodySchema.parse(req.body);

    // if free text provided, just do it
    if (text && !articleId) {
      const out = await summarize(text, { mode });
      return res.json({ summary: out, mode });
    }

    // else load article for this user
    const a = await Article.findOne({ _id: articleId, createdBy: req.userId });
    if (!a) return res.status(404).json({ error: "Article not found" });

    const title = compress(a.title || "");
    let src  = compress(stripHtml(a.contentHTML || a.excerpt || a.title || ""));

    // remove headline everywhere so the model can’t just repeat it
    if (title) src = compress(removeAll(src, title));

    // if content is too short, try a fresh parse and update the doc
    if (src.length < 280 && a.url) {
      try {
        const parsed = await fetchAndParse(a.url);
        await Article.findByIdAndUpdate(a._id, { $set: parsed }, { new: true });
        let fresh = compress(stripHtml(parsed.contentHTML || parsed.excerpt || a.title || ""));
        if (title) fresh = compress(removeAll(fresh, title));
        if (fresh.length > src.length) src = fresh;
      } catch { /* best effort */ }
    }

    const out = await summarize(src, { mode });
    res.json({ summary: out, mode });
  } catch (e) {
    next(e);
  }
}

module.exports = { summarizeCtrl };
