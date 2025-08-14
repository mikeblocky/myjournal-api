const Digest = require("../models/Digest");
const Article = require("../models/Article");
const { summarize, topicIdeas } = require("./ai.service");
const { fetchNewsItems } = require("./news.service");
const { fetchAndParse } = require("./reader.service");

const DIGEST_DEBUG = process.env.DIGEST_DEBUG === "true";

function ymd(d=new Date()){ return new Date(d).toISOString().slice(0,10); }
function hoursSince(d){ return (Date.now() - new Date(d||Date.now()).getTime()) / 36e5; }
function uniq(arr){ return Array.from(new Set(arr)); }
function log(...a){ if (DIGEST_DEBUG) console.log("[DIGEST]", ...a); }

// diversify + score
function rankArticles(arts){
  return arts.map(a => ({
    ...a.toObject?.() || a,
    host: (()=>{ try{ return new URL(a.url).host.replace(/^www\./,""); } catch { return a.source || ""; } })(),
  })).map(a => {
    const rec = Math.max(0, 48 - hoursSince(a.updatedAt || a.createdAt || Date.now()));
    const len = Math.min(1, (a.readingMins || 1) / 10);
    return { ...a, score: rec * 1.4 + len * 0.8 };
  }).sort((x,y)=> y.score - x.score);
}

async function refreshIntoArticles(userId, limit=12){
  const picks = await fetchNewsItems(limit);
  const out = [];
  for (const r of picks) {
    let parsed = null;
    try { parsed = await fetchAndParse(r.url); } catch {}
    const update = {
      ...(parsed || {}),
      url: r.url,
      source: r.source || "",
      lastSeenAt: new Date(),
    };
    const doc = await Article.findOneAndUpdate(
      { createdBy: userId, url: r.url },
      { $setOnInsert: { createdBy: userId, ...update }, $currentDate: { lastSeenAt: true } },
      { upsert: true, new: true }
    );
    out.push(doc);
  }
  log("refreshIntoArticles imported:", out.length);
  return out;
}

/**
 * Generate or regenerate a daily digest
 * opts: { userId, date(YYYY-MM-DD), limit, refresh, length("tldr"|"detailed") }
 */
async function generateDigest({ userId, date=ymd(), limit=12, refresh=false, length="detailed" }){
  if (refresh) await refreshIntoArticles(userId, Math.max(10, limit));

  // 1) try last 36h
  let since = new Date(Date.now() - 36*3600*1000);
  let candidates = await Article.find({ createdBy: userId, lastSeenAt: { $gte: since } })
    .sort({ lastSeenAt: -1, createdAt: -1 })
    .limit(limit * 4);

  // 2) widen to last 7 days if empty
  if (!candidates.length) {
    log("no candidates in 36h → widening to 7d");
    since = new Date(Date.now() - 24*7*3600*1000);
    candidates = await Article.find({ createdBy: userId, lastSeenAt: { $gte: since } })
      .sort({ lastSeenAt: -1, createdAt: -1 })
      .limit(limit * 4);
  }

  // 3) still empty → force refresh then fallback to newest
  if (!candidates.length) {
    log("still no candidates → force refresh + take newest");
    await refreshIntoArticles(userId, Math.max(limit*2, 14));
    candidates = await Article.find({ createdBy: userId })
      .sort({ lastSeenAt: -1, createdAt: -1 })
      .limit(limit * 4);
  }

  // 4) still nothing → return explicit empty digest
  if (!candidates.length){
    log("feeds returned nothing — creating empty digest");
    const doc = await Digest.findOneAndUpdate(
      { createdBy: userId, date },
      { $set: {
        tldr: "(No articles fetched from your feeds right now.)",
        topics: [],
        sources: [],
        items: [],
        stats: { totalItems:0, longReads:0, newCount:0 },
        generatedAt: new Date()
      }},
      { upsert: true, new: true }
    );
    return doc.toPublic();
  }

  // rank + diversify per source
  const ranked = rankArticles(candidates);
  const maxPerSource = 4;
  const perHost = new Map();
  const picked = [];
  for (const a of ranked){
    const host = a.host || a.source || "other";
    const count = perHost.get(host) || 0;
    if (count >= maxPerSource) continue;
    perHost.set(host, count + 1);
    picked.push(a);
    if (picked.length >= limit) break;
  }

  // sections
  const top = picked.slice(0, Math.min(5, picked.length)).map(x => ({ ...x, category:"top" }));
  const rest = picked.slice(top.length);
  const longReads = rest.filter(x => (x.readingMins || 0) >= 8).slice(0, 4).map(x => ({ ...x, category:"long" }));
  const emerging = rest.filter(x => (x.readingMins || 0) < 8).slice(0, 6 - longReads.length).map(x => ({ ...x, category:"emerging" }));

  const finalItems = [...top, ...emerging, ...longReads].map((a, i)=>({
    articleId: a._id,
    url: a.url,
    title: a.title || "",
    source: a.source || a.host || "",
    readingMins: a.readingMins || 1,
    category: a.category,
    rank: i + 1,
    summary: ""
  }));

  const headlines = finalItems.map(i => i.title).filter(Boolean);
  const tlMode = length === "detailed" ? "detailed" : "tldr";
  const topics = await topicIdeas(headlines);
  const mergedText = uniq(headlines).join("\n");
  const tldr = await summarize(mergedText, { mode: tlMode });

  // short per-item summaries
  for (let i=0;i<finalItems.length;i++){
    const a = candidates.find(x => String(x._id) === String(finalItems[i].articleId)) || {};
    const textSrc = (a.contentHTML || a.excerpt || a.title || "").replace(/<[^>]+>/g," ");
    finalItems[i].summary = await summarize(textSrc, { mode: "tldr" });
  }

  const sources = uniq(finalItems.map(i => (i.source||"").replace(/^www\./,"")).filter(Boolean)).sort();
  const stats = {
    totalItems: finalItems.length,
    longReads: finalItems.filter(i => i.category === "long").length,
    newCount: finalItems.filter(i => hoursSince((candidates.find(a=>String(a._id)===String(i.articleId))||{}).lastSeenAt) < 12).length,
  };

  const doc = await Digest.findOneAndUpdate(
    { createdBy: userId, date },
    { $set: { tldr, topics, items: finalItems, sources, stats, generatedAt: new Date() } },
    { upsert: true, new: true }
  );
  return doc.toPublic();
}

async function getByDate({ userId, date }){
  const doc = await Digest.findOne({ createdBy: userId, date });
  return doc ? doc.toPublic() : null;
}

module.exports = { generateDigest, getByDate };
