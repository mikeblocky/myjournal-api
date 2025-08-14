// backend/src/controllers/digests.controller.js
const Digest = require("../models/Digest");
const Article = require("../models/Article");
const { fetchNewsItems } = require("../services/news.service");
const { fetchAndParse } = require("../services/reader.service");
const ai = require("../services/ai.service");

// helpers
function safeHost(u) { try { return new URL(u).host.replace(/^www\./, ""); } catch { return ""; } }
function today() { return new Date().toISOString().slice(0, 10); }
function uniq(arr) { return Array.from(new Set(arr)); }
function pubDigest(d) {
  if (!d) return null;
  return {
    id: d._id,
    date: d.date,
    tldr: d.tldr || "",
    topics: d.topics || [],
    sources: d.sources || [],
    stats: d.stats || { totalItems: 0, longReads: 0, newCount: 0 },
    items: (d.items || []).map(it => ({
      articleId: it.articleId || null,
      url: it.url,
      title: it.title,
      summary: it.summary || "",
      source: it.source || "",
      readingMins: it.readingMins || 0,
      category: it.category || "top",
      rank: it.rank || 0
    })),
    generatedAt: d.generatedAt
  };
}

exports.getByDate = async (req, res, next) => {
  try {
    const date = (req.params.date || today()).slice(0, 10);
    const d = await Digest.findOne({ createdBy: req.userId, date }).lean();
    return res.json({ item: pubDigest(d) });
  } catch (e) {
    next(e);
  }
};

exports.generate = async (req, res, next) => {
  try {
    const date = String(req.query.date || today()).slice(0, 10);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || "12", 10)));
    const length = req.query.length === "tldr" ? "tldr" : "detailed"; // AI mode for item summaries
    const doRefresh = req.query.refresh === "true" || req.query.refresh === "1";
    const topics = String(req.query.topics || "")
      .split(",").map(s => s.trim()).filter(Boolean);

    // 1) (optional) refresh pool — upsert only NEW articles; do NOT touch lastSeenAt here
    if (doRefresh) {
      const picks = await fetchNewsItems({ limit: limit * 2, topics });

      for (const p of picks) {
        const url = (p.url || "").trim();
        if (!url) continue;

        const filter = { createdBy: req.userId, url };
        const exists = await Article.findOne(filter).select("_id").lean();
        if (exists) {
          // small metadata-only update; DO NOT write lastSeenAt in this path
          const set = {};
          if (p.source) set.source = p.source;
          if (Object.keys(set).length) await Article.updateOne(filter, { $set: set });
          continue;
        }

        const parsed = await fetchAndParse(url);
        if (!parsed) continue;

        await Article.updateOne(
          filter,
          {
            $setOnInsert: {
              createdBy: req.userId,
              url,
              host: parsed.host || p.host || safeHost(url),
              source: p.source || ""
            },
            $set: {
              title: parsed.title || "",
              byline: parsed.byline || "",
              excerpt: parsed.excerpt || "",
              contentHTML: parsed.contentHTML || "",
              imageUrl: parsed.imageUrl || "",
              readingMins: parsed.readingMins || 0
            }
            // NOTE: no $currentDate and no $set:lastSeenAt here (avoid conflicts)
          },
          { upsert: true }
        );
      }
    }

    // 2) Pick candidates from saved articles (fresh first)
    const candidates = await Article.find({ createdBy: req.userId })
      .sort({ lastSeenAt: -1, updatedAt: -1 })
      .limit(limit * 3)
      .lean();

    const take = candidates.slice(0, limit);

    // 3) Summarize each selected article (prefer full content, fallback to title+excerpt)
    const items = [];
    for (let i = 0; i < take.length; i++) {
      const a = take[i];
      const base = a.contentHTML || `${a.title || ""}. ${a.excerpt || ""}`;
      let summary = "";
      try {
        summary = await ai.summarize(base, { mode: length });
      } catch {
        summary = (a.excerpt || "").trim();
      }

      items.push({
        articleId: a._id,
        url: a.url,
        title: a.title || "",
        summary: summary || (a.excerpt || ""),
        source: a.host || a.source || "",
        readingMins: a.readingMins || 0,
        category: i < 5 ? "top" : (a.readingMins >= 10 ? "long" : "emerging"),
        rank: i
      });
    }

    // 4) Overall TL;DR + topics
    const titles = take.map(a => a.title).filter(Boolean);
    const stitched = take.map(a => `${a.title}. ${a.excerpt || ""}`).join(" ");
    const tldr =
      (await ai.summarize(stitched || titles.join(". "), { mode: "tldr" }).catch(() => "")) || "";
    const topicChips = (await ai.topicIdeas(titles).catch(() => [])).slice(0, 6);

    // 5) Save digest (atomic upsert) — DO NOT place createdBy/date inside $set
    const filter = { createdBy: req.userId, date };
    const setDoc = {
      tldr,
      topics: topicChips,
      sources: uniq(take.map(a => a.host || a.source || "").filter(Boolean)),
      stats: {
        totalItems: items.length,
        longReads: items.filter(x => x.readingMins >= 10).length,
        newCount: doRefresh ? items.length : 0
      },
      items,
      generatedAt: new Date()
    };

    const saved = await Digest.findOneAndUpdate(
      filter,
      { $set: setDoc, $setOnInsert: { createdBy: req.userId, date } },
      { upsert: true, new: true }
    ).lean();

    return res.status(201).json({ item: pubDigest(saved) });
  } catch (e) {
    console.error("digest.generate failed:", e);
    return res.status(500).json({ error: "Failed to generate digest" });
  }
};
