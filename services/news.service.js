// Pulls from NewsAPI (if NEWSAPI_KEY), GNews (if GNEWS_API_KEY), else a large RSS set.
// Also supports topics filter: "world,business,tech,science" (default shown below).

const Parser = require("rss-parser");
const parser = new Parser({
  headers: { "User-Agent": "myjournal/1.0 (+https://example.com)" },
  timeout: 15000
});

const DEFAULT_TOPICS = (process.env.FEEDS_TOPICS || "world,business,tech,science").split(",").map(s=>s.trim().toLowerCase());

// WORLD / GENERAL
const RSS_WORLD = [
  { source: "BBC",           url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "Reuters",       url: "https://feeds.reuters.com/reuters/worldNews" },
  { source: "The Guardian",  url: "https://www.theguardian.com/world/rss" },
  { source: "AP",            url: "https://apnews.com/hub/ap-top-news?utm_source=apnews&utm_medium=rss" },
  { source: "CNN",           url: "http://rss.cnn.com/rss/edition_world.rss" },
  { source: "NYTimes",       url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { source: "Al Jazeera",    url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { source: "DW",            url: "https://rss.dw.com/xml/rss-en-all" },
  { source: "WashingtonPost",url: "https://feeds.washingtonpost.com/rss/world" },
  { source: "NPR",           url: "https://feeds.npr.org/1004/rss.xml" }
];

// BUSINESS / ECON
const RSS_BUSINESS = [
  { source: "Reuters Biz",   url: "https://feeds.reuters.com/reuters/businessNews" },
  { source: "CNBC",          url: "https://www.cnbc.com/id/10001147/device/rss/rss.html" },
  { source: "WSJ World",     url: "https://feeds.a.dj.com/rss/RSSWorldNews.xml" }, // often paywalled but useful for titles
  { source: "FT",            url: "https://www.ft.com/?format=rss" },              // mixed; still useful
  { source: "BBC Biz",       url: "https://feeds.bbci.co.uk/news/business/rss.xml" }
];

// TECH
const RSS_TECH = [
  { source: "The Verge",     url: "https://www.theverge.com/rss/index.xml" },
  { source: "TechCrunch",    url: "https://techcrunch.com/feed/" },
  { source: "Ars Technica",  url: "https://feeds.arstechnica.com/arstechnica/index" },
  { source: "WIRED",         url: "https://www.wired.com/feed/rss" },
  { source: "Hacker News",   url: "https://news.ycombinator.com/rss" }
];

// SCIENCE / HEALTH-ish (news-y)
const RSS_SCIENCE = [
  { source: "BBC Science",   url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
  { source: "New Scientist", url: "https://www.newscientist.com/section/news/feed/" },
  { source: "NPR Science",   url: "https://feeds.npr.org/1007/rss.xml" }
];

// Optionally let env add custom feeds (comma-separated URLs)
function extraFeeds(){
  const raw = (process.env.FEEDS_EXTRA || "").split(",").map(s=>s.trim()).filter(Boolean);
  return raw.map(url => ({ source: "Custom", url }));
}

function pickFeedsByTopics(topics){
  const want = new Set((topics && topics.length ? topics : DEFAULT_TOPICS).map(s=>s.toLowerCase()));
  let out = [];
  if (want.has("world")   || want.has("general")) out = out.concat(RSS_WORLD);
  if (want.has("business")|| want.has("economy") || want.has("finance")) out = out.concat(RSS_BUSINESS);
  if (want.has("tech")    || want.has("technology")) out = out.concat(RSS_TECH);
  if (want.has("science")) out = out.concat(RSS_SCIENCE);
  out = out.concat(extraFeeds());
  return out;
}

function dedupe(list, limit=60){
  const seen = new Set();
  const out = [];
  for (const it of list){
    try{
      const u = new URL(it.url);
      const key = (u.origin + u.pathname).toLowerCase(); // ignore querystrings
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
      if (out.length >= limit) break;
    }catch{/* bad url */}
  }
  return out.slice(0, limit);
}

async function parseRss(url, source){
  try{
    const feed = await parser.parseURL(url);
    const items = (feed.items || []).map(x => ({ url: x.link || x.id || "", source }));
    return items.filter(i => i.url);
  }catch{
    return [];
  }
}

async function fromRss({ limit=40, topics=[] }){
  const feeds = pickFeedsByTopics(topics);
  // Pull up to ~10 per feed then dedupe and cap
  const perFeed = Math.max(6, Math.ceil(limit / Math.max(6, Math.floor(feeds.length/2))));
  const all = [];
  await Promise.all(feeds.map(async f => {
    const list = await parseRss(f.url, f.source);
    for (const it of list.slice(0, perFeed)) all.push(it);
  }));
  return dedupe(all, limit * 2); // give headroom before final cap
}

async function fromNewsAPI(limit=40){
  const key = process.env.NEWSAPI_KEY;
  if (!key) return [];
  const url = `https://newsapi.org/v2/top-headlines?language=en&pageSize=${Math.min(100, limit)}`;
  try{
    const res = await fetch(url, { headers: { "X-Api-Key": key } });
    if (!res.ok) return [];
    const json = await res.json();
    const arts = (json.articles || []).map(a => ({ url: a.url, source: a.source?.name || "NewsAPI" })).filter(a => a.url);
    return dedupe(arts, limit);
  }catch{ return []; }
}

async function fromGNews(limit=40){
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  const url = `https://gnews.io/api/v4/top-headlines?lang=en&max=${Math.min(100, limit)}&apikey=${encodeURIComponent(key)}`;
  try{
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const arts = (json.articles || []).map(a => ({ url: a.url, source: a.source?.name || "GNews" })).filter(a => a.url);
    return dedupe(arts, limit);
  }catch{ return []; }
}

/**
 * Fetch a broad, diverse set of story URLs.
 * opts: { limit, topics?: string[] }
 */
async function fetchNewsItems(opts = {}){
  const limit  = Number(opts.limit || 40);
  const topics = (opts.topics || []).map(s=>s.toLowerCase());

  // Prefer paid APIs if available
  const a = await fromNewsAPI(limit);
  if (a.length >= Math.floor(limit * 0.6)) return dedupe(a, limit);

  const b = await fromGNews(limit);
  const rss = await fromRss({ limit, topics });

  // Merge and diversify by host (cap 3 per host)
  const merged = dedupe(a.concat(b).concat(rss), limit * 3);
  const perHostCap = 3;
  const seen = new Map();
  const out = [];
  for (const it of merged){
    let host = "";
    try{ host = new URL(it.url).host.replace(/^www\./,""); }catch{}
    const n = seen.get(host) || 0;
    if (n >= perHostCap) continue;
    seen.set(host, n+1);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = { fetchNewsItems };
