// backend/src/services/reader.service.js
const { extract } = require("@extractus/article-extractor");

function wordsCount(s=""){ return (s.trim().match(/\S+/g) || []).length; }

async function fetchAndParse(url){
  try{
    const art = await extract(url, { descriptionTruncateLen: 300 });
    if (!art) return null;

    const title = art.title || "";
    const byline = art.author || "";
    const contentHTML = art.content || art.html || "";
    const text = (art.text || "").trim();
    const excerpt = art.description || (text ? text.slice(0, 300) : "");
    const readingMins = Math.max(1, Math.round(wordsCount(text) / 200));
    const imageUrl =
      art.image ||
      art.imageUrl ||
      art.lead_image_url ||
      (art.meta && (art.meta.ogImage || art.meta.og_image || art.meta.twitterImage)) ||
      "";

    return { title, byline, contentHTML, excerpt, readingMins, imageUrl };
  }catch{
    return null;
  }
}

module.exports = { fetchAndParse };
