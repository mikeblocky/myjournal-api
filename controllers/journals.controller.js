const Journal = require("../models/Journal");

// ----- private (owner) -----
async function create(req, res, next){
  try{
    const { title="", body="", tags=[], date, visibility="private", coverUrl="", authorDisplay="" } = req.body || {};
    const j = await Journal.create({
      createdBy: req.userId, title, body, tags, date, visibility, coverUrl, authorDisplay
    });
    res.status(201).json({ item: j.toPublic() });
  }catch(e){ next(e); }
}

async function list(req, res, next){
  try{
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || "20", 10)));
    const q = (req.query.q || "").trim();
    const filter = { createdBy: req.userId };
    if (q) filter.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const [items, total] = await Promise.all([
      Journal.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit),
      Journal.countDocuments(filter)
    ]);
    res.json({ items: items.map(i=>i.toPublic()), page, total });
  }catch(e){ next(e); }
}

async function getOne(req, res, next){
  try{
    const j = await Journal.findOne({ _id: req.params.id, createdBy: req.userId });
    if (!j) return res.status(404).json({ error: "Not found" });
    res.json({ item: j.toPublic() });
  }catch(e){ next(e); }
}

async function update(req, res, next){
  try{
    const j = await Journal.findOne({ _id: req.params.id, createdBy: req.userId });
    if (!j) return res.status(404).json({ error: "Not found" });

    const { title, body, tags, date, coverUrl, authorDisplay } = req.body || {};
    if (typeof title === "string") j.title = title;
    if (typeof body === "string") j.body = body;
    if (Array.isArray(tags)) j.tags = tags.filter(Boolean).slice(0,20);
    if (typeof date === "string") j.date = date.slice(0,10);
    if (typeof coverUrl === "string") j.coverUrl = coverUrl;
    if (typeof authorDisplay === "string") j.authorDisplay = authorDisplay;

    await j.save();
    res.json({ item: j.toPublic() });
  }catch(e){ next(e); }
}

async function remove(req, res, next){
  try{
    const r = await Journal.deleteOne({ _id: req.params.id, createdBy: req.userId });
    if (r.deletedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  }catch(e){ next(e); }
}

async function publish(req, res, next){
  try{
    const j = await Journal.findOne({ _id: req.params.id, createdBy: req.userId });
    if (!j) return res.status(404).json({ error: "Not found" });
    j.visibility = "public";
    if (!j.publishedAt) j.publishedAt = new Date();
    // slug/date handled by pre-validate
    await j.save();
    res.json({ item: j.toPublic() });
  }catch(e){ next(e); }
}

async function unpublish(req, res, next){
  try{
    const j = await Journal.findOne({ _id: req.params.id, createdBy: req.userId });
    if (!j) return res.status(404).json({ error: "Not found" });
    j.visibility = "private";
    j.publishedAt = null;
    await j.save();
    res.json({ item: j.toPublic() });
  }catch(e){ next(e); }
}

// ----- public (no auth) -----
function escRegex(s=""){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

async function listPublic(req, res, next){
  try{
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || "20", 10)));
    const q = (req.query.q || "").trim();
    const tag = (req.query.tag || "").trim();

    const filter = { visibility: "public" };
    if (q) filter.title = { $regex: escRegex(q), $options: "i" };
    if (tag) filter.tags = tag;

    const [items, total] = await Promise.all([
      Journal.find(filter).sort({ publishedAt: -1, createdAt: -1 }).skip((page-1)*limit).limit(limit),
      Journal.countDocuments(filter)
    ]);

    res.json({ items: items.map(i=>i.toPublic()), page, total });
  }catch(e){ next(e); }
}

async function getPublic(req, res, next){
  try{
    const j = await Journal.findOne({ slug: req.params.slug, visibility: "public" });
    if (!j) return res.status(404).json({ error: "Not found" });
    res.json({ item: j.toPublic() });
  }catch(e){ next(e); }
}

module.exports = {
  create, list, getOne, update, remove, publish, unpublish,
  listPublic, getPublic
};
