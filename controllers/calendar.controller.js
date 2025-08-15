const CalendarEvent = require("../models/CalendarEvent");
const CalendarDaily = require("../models/CalendarDaily");
const Note = require("../models/Note");
const NoteDaily = require("../models/NoteDaily");
const { summarize } = require("../services/ai.service");
const { ymd } = require("../utils/date");

function escRegex(s=""){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
// Fix date handling to use local timezone instead of UTC
function clampYmd(s=""){ 
  if (typeof s === "string") {
    return s.slice(0,10);
  }
  return ymd(s);
}

function minutes(hhmm=""){
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return 24*60 + 1; // after all timed things
  return parseInt(m[1],10)*60 + parseInt(m[2],10);
}

/* ---- CRUD ---- */

async function list(req, res, next){
  try{
    const start = clampYmd(req.query.start || "");
    const end   = clampYmd(req.query.end   || "");
    const q     = (req.query.q || "").trim();

    if (!start || !end) return res.status(400).json({ error: "start and end are required (YYYY-MM-DD)" });

    const filter = { createdBy: req.userId, date: { $gte: start, $lte: end } };
    if (q) filter.title = { $regex: escRegex(q), $options: "i" };

    const items = await CalendarEvent.find(filter);
    // sort: date asc, allDay first, then start time
    items.sort((a,b)=>{
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return minutes(a.startTime) - minutes(b.startTime);
    });

    res.json({ items: items.map(e => e.toPublic()) });
  }catch(e){ next(e); }
}

async function create(req, res, next){
  try{
    const { title, date, startTime="", endTime="", allDay, location="", description="", color="", tags=[] } = req.body || {};
    if (!title) return res.status(400).json({ error: "title is required" });

    const ev = await CalendarEvent.create({
      createdBy: req.userId,
      title, date: clampYmd(date), startTime, endTime,
      allDay: typeof allDay === "boolean" ? allDay : !startTime,
      location, description, color, tags
    });
    res.status(201).json({ item: ev.toPublic() });
  }catch(e){ next(e); }
}

async function getOne(req, res, next){
  try{
    const ev = await CalendarEvent.findOne({ _id: req.params.id, createdBy: req.userId });
    if (!ev) return res.status(404).json({ error: "Not found" });
    res.json({ item: ev.toPublic() });
  }catch(e){ next(e); }
}

async function update(req, res, next){
  try{
    const ev = await CalendarEvent.findOne({ _id: req.params.id, createdBy: req.userId });
    if (!ev) return res.status(404).json({ error: "Not found" });

    const { title, date, startTime, endTime, allDay, location, description, color, tags } = req.body || {};
    if (typeof title === "string") ev.title = title;
    if (typeof date === "string") ev.date = clampYmd(date);
    if (typeof startTime === "string") ev.startTime = startTime;
    if (typeof endTime   === "string") ev.endTime   = endTime;
    if (typeof allDay === "boolean") ev.allDay = allDay;
    if (typeof location === "string") ev.location = location;
    if (typeof description === "string") ev.description = description;
    if (typeof color === "string") ev.color = color;
    if (Array.isArray(tags)) ev.tags = tags.filter(Boolean).slice(0,20);

    await ev.save();
    res.json({ item: ev.toPublic() });
  }catch(e){ next(e); }
}

async function remove(req, res, next){
  try{
    const r = await CalendarEvent.deleteOne({ _id: req.params.id, createdBy: req.userId });
    if (r.deletedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  }catch(e){ next(e); }
}

/* ---- AI Day Plan ---- */

function linesToBullets(text=""){
  return String(text)
    .split(/\r?\n/)
    .map(s => s.replace(/^\s*[-•\d\.\)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

async function getDaily(req, res, next){
  try{
    const date = clampYmd(req.params.date || "");
    if (!date) return res.json({ item: null });
    const d = await CalendarDaily.findOne({ createdBy: req.userId, date });
    res.json({ item: d ? d.toPublic() : null });
  }catch(e){ next(e); }
}

async function generateDaily(req, res, next){
  try{
    const date = clampYmd(req.params.date || "");
    if (!date) return res.status(400).json({ error: "date required (YYYY-MM-DD)" });

    // Debug: Log the date processing
    console.log('Calendar Debug - generateDaily:', {
      originalDate: req.params.date,
      clampedDate: date,
      currentTime: new Date().toISOString(),
      currentLocal: new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' })
    });

    // Gather events
    const events = await CalendarEvent.find({ createdBy: req.userId, date }).sort({ allDay: -1, startTime: 1 });
    // Gather notes (prefer NoteDaily bullets, else build from Note items)
    let notesBullets = [];
    const nd = await NoteDaily.findOne({ createdBy: req.userId, date });
    if (nd?.bullets?.length) {
      notesBullets = nd.bullets.slice(0,8);
    } else {
      const notes = await Note.find({ createdBy: req.userId, date });
      if (notes.length) {
        const joined = notes.map(n => {
          const t = (n.title || "").replace(/\s+/g," ").trim();
          const b = (n.body  || "").replace(/\s+/g," ").trim();
          return `- ${t}${t && b ? ": " : ""}${b}`;
        }).join("\n");
        const outline = await summarize(
          [
            "Turn these notes into concrete action items for today.",
            "Output 3–8 short bullets. No sub-bullets.",
            "",
            joined
          ].join("\n"),
          { mode: "outline" }
        );
        notesBullets = linesToBullets(outline || "");
      }
    }

    // If nothing at all → empty daily
    if ((!events || events.length === 0) && notesBullets.length === 0){
      const doc = await CalendarDaily.findOneAndUpdate(
        { createdBy: req.userId, date },
        { $set: { summary: "", agenda: [], generatedAt: new Date() } },
        { upsert: true, new: true }
      );
      return res.status(201).json({ item: doc.toPublic(), nothingToDo: true });
    }

    // Build a compact agenda source for AI
    const scheduleLines = events.map(ev => {
      const span = ev.allDay ? "All-day" : (ev.startTime || "") + (ev.endTime ? `–${ev.endTime}` : "");
      const where = ev.location ? ` @ ${ev.location}` : "";
      return `• ${span} — ${ev.title}${where}${ev.description ? `: ${ev.description}` : ""}`;
    }).join("\n");

    const notesLines = notesBullets.length ? notesBullets.map(b => `- ${b}`).join("\n") : "";

    const prompt = [
      "You are a personal day planner.",
      "Given a schedule and task list, produce a concise agenda for today:",
      "• 5–8 bullets, chronological where possible",
      "• Use times when available (e.g., '09:00 Stand-up')",
      "• Be specific and neutral. No fluff.",
      "",
      "SCHEDULE:",
      scheduleLines || "(none)",
      "",
      "TASKS:",
      notesLines || "(none)"
    ].join("\n");

    const plan = await summarize(prompt, { mode: "outline" }) || "";
    const agenda = linesToBullets(plan);

    const doc = await CalendarDaily.findOneAndUpdate(
      { createdBy: req.userId, date },
      { $set: { summary: plan, agenda, generatedAt: new Date() } },
      { upsert: true, new: true }
    );

    res.status(201).json({ item: doc.toPublic(), nothingToDo: agenda.length === 0 });
  }catch(e){ next(e); }
}

module.exports = {
  list, create, getOne, update, remove,
  getDaily, generateDaily
};
