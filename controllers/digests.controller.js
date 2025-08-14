const { generateDigest, getByDate } = require("../services/digest.service");

// POST /api/digests/generate?date=YYYY-MM-DD&limit=12&refresh=true&length=detailed
async function generate(req, res, next){
  try{
    const date = (req.query.date || req.body?.date || new Date().toISOString().slice(0,10)).slice(0,10);
    const limit = Math.max(4, Math.min(30, parseInt(req.query.limit || req.body?.limit || "12", 10)));
    const refresh = String(req.query.refresh ?? req.body?.refresh ?? "false") === "true";
    const length = /^(tldr|detailed)$/.test(req.query.length || req.body?.length) ? (req.query.length || req.body?.length) : "detailed";

    const item = await generateDigest({ userId: req.userId, date, limit, refresh, length });
    res.status(201).json({ item });
  }catch(e){ next(e); }
}

// GET /api/digests/:date
async function getOne(req, res, next){
  try{
    const date = String(req.params.date || "").slice(0,10);
    if (!date) return res.json({ item: null }); // quiet default
    const item = await getByDate({ userId: req.userId, date });
    // ✅ return 200 with null instead of a 404
    return res.json({ item: item || null });
  }catch(e){ next(e); }
}

module.exports = { generate, getOne };
