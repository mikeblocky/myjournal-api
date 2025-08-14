// backend/src/controllers/articles.controller.js
const Article = require("../models/Article");
const { fetchNewsItems } = require("../services/news.service");
const { fetchAndParse } = require("../services/reader.service");

function safeHost(u) { try { return new URL(u).host.replace(/^www\./, ""); } catch { return ""; } }
function urlKey(u) { try { const x = new URL(u); return (x.origin + x.pathname).toLowerCase(); } catch { return (u || "").toLowerCase(); } }
function pickDefined(obj = {}) {
  const out = {};
  for (const k of Object.keys(obj)) if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  return out;
}
function pub(a) {
  return {
    id: a._id,
    title: a.title || "",
    url: a.url,
    host: a.host || safeHost(a.url),
    byline: a.byline || "",
    readingMins: a.readingMins || 0,
    excerpt: a.excerpt || "",
    contentHTML: a.contentHTML || "",
    imageUrl: a.imageUrl || "",
    tags: a.tags || [],
    source: a.source || "",
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    lastSeenAt: a.lastSeenAt,
  };
}

/* ---------- LIST ---------- */
exports.list = async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || "30", 10)));
    const q     = (req.query.q || "").trim();
    const tag   = (req.query.tag || "").trim();

    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = { createdBy: req.userId };
    if (q)   filter.title = { $regex: esc(q), $options: "i" };
    if (tag) filter.tags = tag;

    const [items, total] = await Promise.all([
      Article.find(filter).sort({ lastSeenAt: -1, updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Article.countDocuments(filter),
    ]);

    res.json({ items: items.map(pub), page, total });
  } catch (e) { next(e); }
};

/* ---------- GET ONE ---------- */
exports.getOne = async (req, res, next) => {
  try {
    const a = await Article.findOne({ _id: req.params.id, createdBy: req.userId }).lean();
    if (!a) return res.status(404).json({ error: "Not found" });
    res.json({ item: pub(a) });
  } catch (e) { next(e); }
};

/* ---------- IMPORT BY URL ---------- */
exports.importByUrl = async (req, res, next) => {
  try {
    const { url, tags = [] } = req.body || {};
    if (!url) return res.status(400).json({ error: "url is required" });

    const parsed = await fetchAndParse(url);
    if (!parsed) return res.status(400).json({ error: "Could not parse article" });

    const filter = { createdBy: req.userId, url };
    const set = pickDefined({ ...parsed, tags: Array.isArray(tags) ? tags.filter(Boolean).slice(0, 20) : [] });

    const a = await Article.findOneAndUpdate(
      filter,
      {
        $setOnInsert: { createdBy: req.userId, url, host: safeHost(url), source: "manual" },
        $set: set,
        $currentDate: { lastSeenAt: true } // <-- only use currentDate for lastSeenAt
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ item: pub(a) });
  } catch (e) { next(e); }
};

/* ---------- UPDATE ---------- */
exports.update = async (req, res, next) => {
  try {
    const id = req.params.id;
    const a = await Article.findOne({ _id: id, createdBy: req.userId });
    if (!a) return res.status(404).json({ error: "Not found" });

    const { title, tags, reparse } = req.body || {};
    const set = {};
    if (typeof title === "string") set.title = title;
    if (Array.isArray(tags)) set.tags = tags.filter(Boolean).slice(0, 20);

    if (reparse) {
      const parsed = await fetchAndParse(a.url);
      if (parsed) Object.assign(set, pickDefined(parsed), { host: a.host || safeHost(a.url) });
    }

    const out = await Article.findOneAndUpdate(
      { _id: id, createdBy: req.userId },
      { $set: set, $currentDate: { lastSeenAt: true } },
      { new: true }
    );

    res.json({ item: pub(out) });
  } catch (e) { next(e); }
};

/* ---------- DELETE ---------- */
exports.remove = async (req, res, next) => {
  try {
    const r = await Article.deleteOne({ _id: req.params.id, createdBy: req.userId });
    if (r.deletedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

/* ---------- REFRESH (atomic upsert, multi-source + topics) ---------- */
exports.refresh = async (req, res, next) => {
  try {
    const limit  = Math.max(1, Math.min(100, parseInt(req.query.limit || "48", 10)));
    const force  = (req.query.force === "true" || req.query.force === "1");
    const topics = String(req.query.topics || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

    const picks = await fetchNewsItems({ limit: limit * 2, topics });

    // de-dupe by normalized URL key
    const seenKey = new Set();
    const uniq = [];
    for (const p of picks) {
      const u = (p.url || "").trim();
      const k = urlKey(u);
      if (u && !seenKey.has(k)) { seenKey.add(k); uniq.push(p); }
    }

    let imported = 0, updated = 0, seen = 0;
    const out = [];
    const outIds = new Set();

    for (const p of uniq) {
      const url = p.url;
      const filter = { createdBy: req.userId, url };

      try {
        // Check existence first to avoid parsing unless needed
        const existing = await Article.findOne(filter).select("_id source").lean();

        if (!existing) {
          const parsed = await fetchAndParse(url);
          if (!parsed) continue;

          const set = pickDefined({ ...parsed });
          const a = await Article.findOneAndUpdate(
            filter,
            {
              $setOnInsert: {
                createdBy: req.userId,
                url,
                host: safeHost(url),
                source: p.source || ""
              },
              $set: set,
              $currentDate: { lastSeenAt: true } // only here
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );

          imported++;
          if (a && !outIds.has(String(a._id))) { out.push(pub(a)); outIds.add(String(a._id)); }
        } else {
          const set = {};
          if (!existing.source && p.source) set.source = p.source;

          if (force) {
            const parsed = await fetchAndParse(url);
            if (parsed) Object.assign(set, pickDefined(parsed));
            const a = await Article.findOneAndUpdate(
              filter,
              { $set: set, $currentDate: { lastSeenAt: true } },
              { new: true }
            );
            updated++;
            if (a && !outIds.has(String(a._id))) { out.push(pub(a)); outIds.add(String(a._id)); }
          } else {
            const a = await Article.findOneAndUpdate(
              filter,
              { $set: set, $currentDate: { lastSeenAt: true } },
              { new: true }
            );
            seen++;
            if (a && !outIds.has(String(a._id))) { out.push(pub(a)); outIds.add(String(a._id)); }
          }
        }

        if (out.length >= limit) break;
      } catch (e) {
        // swallow duplicate key races gracefully
        if (e && (e.code === 11000 || String(e.message).includes("E11000"))) {
          const a = await Article.findOne(filter);
          if (a && !outIds.has(String(a._id))) { out.push(pub(a)); outIds.add(String(a._id)); }
          continue;
        }
        console.error("refresh item failed:", url, e);
      }
    }

    res.status(201).json({ items: out, imported, updated, seen, topics: topics.length ? topics : null });
  } catch (e) { next(e); }
};
