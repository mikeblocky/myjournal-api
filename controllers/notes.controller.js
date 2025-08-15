const Note = require("../models/Note");
const NoteDaily = require("../models/NoteDaily");
const CalendarEvent = require("../models/CalendarEvent");
const { summarize } = require("../services/ai.service");
const { ymd } = require("../utils/date");

function escRegex(s=""){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

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

/* ---- Calendar Sync ---- */

async function syncToCalendar(req, res, next){
  try{
    const { noteId, startTime="09:00", endTime="10:00", allDay=false, location="", color="" } = req.body || {};
    if (!noteId) return res.status(400).json({ error: "noteId is required" });

    const note = await Note.findOne({ _id: noteId, createdBy: req.userId });
    if (!note) return res.status(404).json({ error: "Note not found" });

    // Create calendar event from note
    const event = await CalendarEvent.create({
      createdBy: req.userId,
      title: note.title || "Note",
      date: note.date,
      startTime: allDay ? "" : startTime,
      endTime: allDay ? "" : endTime,
      allDay: allDay,
      location: location || "",
      description: note.body || "",
      color: color || "",
      tags: note.tags || []
    });

    res.status(201).json({ 
      item: event.toPublic(),
      message: "Note synced to calendar successfully"
    });
  }catch(e){ next(e); }
}

// Sync multiple notes for a specific date
async function syncDateToCalendar(req, res, next){
  try{
    const date = String(req.params.date || "").slice(0,10);
    if (!date) return res.status(400).json({ error: "date required (YYYY-MM-DD)" });

    const { startTime="09:00", endTime="10:00", allDay=false, location="", color="" } = req.body || {};

    const notes = await Note.find({ createdBy: req.userId, date }).sort({ pinned: -1, updatedAt: -1 });
    if (!notes.length) return res.status(400).json({ error: "No notes found for this date" });

    const events = [];
    let timeOffset = 0;

    for (const note of notes) {
      if (!note.title && !note.body) continue; // Skip empty notes

      let eventStartTime = "";
      let eventEndTime = "";

      if (!allDay) {
        // Calculate time slots for multiple notes
        const startHour = parseInt(startTime.split(':')[0]);
        const startMinute = parseInt(startTime.split(':')[1]);
        const startMinutes = startHour * 60 + startMinute + timeOffset;
        
        const endMinutes = startMinutes + 30; // 30-minute slots
        
        eventStartTime = `${Math.floor(startMinutes / 60).toString().padStart(2, '0')}:${(startMinutes % 60).toString().padStart(2, '0')}`;
        eventEndTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;
        
        timeOffset += 30; // Next event 30 minutes later
      }

      const event = await CalendarEvent.create({
        createdBy: req.userId,
        title: note.title || "Note",
        date: note.date,
        startTime: eventStartTime,
        endTime: eventEndTime,
        allDay: allDay,
        location: location || "",
        description: note.body || "",
        color: color || "",
        tags: note.tags || []
      });

      events.push(event.toPublic());
    }

    res.status(201).json({ 
      items: events,
      message: `Synced ${events.length} notes to calendar for ${date}`
    });
  }catch(e){ next(e); }
}

module.exports = {
  list, create, getOne, update, remove,
  getDaily, generateDaily,
  syncToCalendar, syncDateToCalendar
};
