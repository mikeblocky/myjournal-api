const Note = require("../models/Note");
const NoteDaily = require("../models/NoteDaily");
const { summarize } = require("../services/ai.service");

function escRegex(s=""){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function ymd(d=new Date()){ return new Date(d).toISOString().slice(0,10); }

async function list(req, res, next){
  try{
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || "50", 10)));
    const date = (req.query.date || "").slice(0,10);
    const q = (req.query.q || "").trim();

    const filter = { createdBy: req.userId };
    if (date) filter.date = date;
    if (q) filter.title = { $regex: escRegex(q), $options: "i" };

    const [items, total] = await Promise.all([
      Note.find(filter).sort({ pinned:-1, updatedAt:-1 }).skip((page-1)*limit).limit(limit),
      Note.countDocuments(filter)
    ]);

    res.json({ items: items.map(n=>n.toPublic()), page, total });
  }catch(e){ next(e); }
}

async function create(req, res, next){
  try{
    const { title="", body="", date=ymd(), tags=[], done=false, pinned=false } = req.body || {};
    const note = await Note.create({ createdBy: req.userId, title, body, date: date.slice(0,10), tags, done, pinned });
    res.status(201).json({ item: note.toPublic() });
  }catch(e){ next(e); }
}

async function getOne(req, res, next){
  try{
    const n = await Note.findOne({ _id: req.params.id, createdBy: req.userId });
    if (!n) return res.status(404).json({ error: "Not found" });
    res.json({ item: n.toPublic() });
  }catch(e){ next(e); }
}

async function update(req, res, next){
  try{
    const n = await Note.findOne({ _id: req.params.id, createdBy: req.userId });
    if (!n) return res.status(404).json({ error: "Not found" });

    const { title, body, date, tags, done, pinned } = req.body || {};
    if (typeof title === "string") n.title = title;
    if (typeof body === "string") n.body = body;
    if (typeof date === "string") n.date = date.slice(0,10);
    if (Array.isArray(tags)) n.tags = tags.filter(Boolean).slice(0,20);
    if (typeof done === "boolean") n.done = done;
    if (typeof pinned === "boolean") n.pinned = pinned;

    await n.save();
    res.json({ item: n.toPublic() });
  }catch(e){ next(e); }
}

async function remove(req, res, next){
  try{
    const r = await Note.deleteOne({ _id: req.params.id, createdBy: req.userId });
    if (r.deletedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  }catch(e){ next(e); }
}

/* ---- Daily summary (AI) ---- */

async function getDaily(req, res, next){
  try{
    const date = String(req.params.date || "").slice(0,10);
    if (!date) return res.json({ item: null });
    const d = await NoteDaily.findOne({ createdBy: req.userId, date });
    res.json({ item: d ? d.toPublic() : null });
  }catch(e){ next(e); }
}

function linesToBullets(text=""){
  return String(text)
    .split(/\r?\n/)
    .map(s => s.replace(/^\s*[-•\d\.\)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

async function generateDaily(req, res, next){
  try{
    const date = String(req.params.date || "").slice(0,10);
    if (!date) return res.status(400).json({ error: "date required (YYYY-MM-DD)" });

    const notes = await Note.find({ createdBy: req.userId, date }).sort({ pinned:-1, updatedAt:-1 });

    // If no notes today → store empty daily (so UI can show “nothing to do today”)
    if (!notes.length){
      const doc = await NoteDaily.findOneAndUpdate(
        { createdBy: req.userId, date },
        { $set: { summary: "", bullets: [], generatedAt: new Date() } },
        { upsert: true, new: true }
      );
      return res.status(201).json({ item: doc.toPublic(), nothingToDo: true });
    }

    // Build a compact input
    const joined = notes.map(n => {
      const t = (n.title || "").replace(/\s+/g," ").trim();
      const b = (n.body  || "").replace(/\s+/g," ").trim();
      return `- ${t}${t && b ? ": " : ""}${b}`;
    }).join("\n");

    // Ask AI for actionables; if nothing actionable, we’ll detect minimal output
    const aiText = [
      "Turn these personal notes into an actionable checklist.",
      "Write 3–8 short bullets in imperative mood (e.g., 'Email editor', 'Draft outline', 'Schedule interview').",
      "No sub-bullets. No fluff. Keep it specific.",
      "",
      joined
    ].join("\n");

    const summary = await summarize(aiText, { mode: "outline" }) || "";
    const bullets = linesToBullets(summary);

    const nothingToDo = bullets.length === 0;

    const doc = await NoteDaily.findOneAndUpdate(
      { createdBy: req.userId, date },
      { $set: { summary: nothingToDo ? "" : summary, bullets: nothingToDo ? [] : bullets, generatedAt: new Date() } },
      { upsert: true, new: true }
    );

    res.status(201).json({ item: doc.toPublic(), nothingToDo });
  }catch(e){ next(e); }
}

module.exports = {
  list, create, getOne, update, remove,
  getDaily, generateDaily
};
