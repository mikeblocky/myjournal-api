// backend/src/services/ai.service.js
const PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const OPENAI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const OPENAI_BASE = process.env.AI_API_BASE || "https://api.openai.com/v1/chat/completions";

const MAX_INPUT_CHARS = Number(process.env.AI_MAX_INPUT_CHARS || 16000);
const TOKENS_TLDR     = Number(process.env.AI_MAX_TOKENS || 220);
const TOKENS_DETAILED = Number(process.env.AI_DETAILED_TOKENS || 480);
const TOKENS_OUTLINE  = Number(process.env.AI_OUTLINE_TOKENS  || 420);
const TEMP = 0.2;
const AI_DEBUG = process.env.AI_DEBUG === "true";

function stripHtml(s = "") { return String(s).replace(/<[^>]+>/g, " "); }
function compress(s = "")  { return String(s).replace(/\s+/g, " ").trim(); }
function truncate(s = "", n = MAX_INPUT_CHARS) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function log(...a){ if (AI_DEBUG) console.log("[AI]", ...a); }
function logErr(...a){ console.error("[AI]", ...a); }

/* ---------- Output normalizers (kill markdown, fix bullets, tidy) ---------- */

function removeInlineEmphasis(s=""){
  // Remove **bold**, *italics*, __bold__, _italics_ (but not bullets—we fix those first)
  return s
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2");
}

function normalizeOutline(text){
  let s = String(text || "").replace(/\r\n/g, "\n").trim();

  // Convert common bullet forms to "• "
  s = s
    // lines that start with *, -, •, or numbered lists → •
    .replace(/^\s*[\*\-]\s+/gm, "• ")
    .replace(/^\s*•\s+/gm, "• ")
    .replace(/^\s*\d+[\.\)\]]\s+/gm, "• ")
    // inline " * " separators (not italics like *Title*) → line breaks
    .replace(/\s\*\s/g, "\n• ");

  // Remove any lingering markdown emphasis
  s = removeInlineEmphasis(s);

  // Split, clean, enforce bullet prefix
  let lines = s.split(/\n+/)
    .map(l => l.replace(/^[\s•\*\-]+\s*/, "").trim())
    .filter(Boolean)
    .map(l => (l[0] ? ("• " + l[0].toUpperCase() + l.slice(1)) : l));

  // Cap 8 bullets, drop dupes
  const seen = new Set();
  lines = lines.filter(l => { const k = l.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);

  return lines.join("\n");
}

function normalizeParagraph(text){
  let s = String(text || "").replace(/\r\n/g, "\n").trim();

  // Turn list-y output into sentences
  s = s
    .replace(/^\s*[•\*\-]\s+/gm, "")   // leading bullet markers at line starts
    .replace(/\s\*\s/g, ". ")          // inline star separators to sentence breaks
    .replace(/\n+/g, " ");

  // Remove markdown emphasis
  s = removeInlineEmphasis(s);

  // Fix spacing around punctuation
  s = s.replace(/\s+([.,;:!?])/g, "$1").replace(/\s{2,}/g, " ").trim();

  // Ensure it ends with terminal punctuation
  if (!/[.!?…]$/.test(s)) s += ".";
  return s;
}

function normalizeOutput(text, mode){
  const raw = (text || "").trim();
  if (!raw) return "";

  if (mode === "outline") return normalizeOutline(raw);

  // If model still returned bullets in non-outline modes, flatten them.
  const looksListy = /^(\s*[•\*\-\d].*)$/m.test(raw) || raw.includes(" * ");
  const cleaned = looksListy ? normalizeParagraph(raw) : removeInlineEmphasis(raw);
  return compress(cleaned);
}

/* ---------------------- Providers ---------------------- */

async function callGemini(text, { maxTokens }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`;
  const body = { contents: [{ parts: [{ text }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: TEMP } };
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(()=> ({}));
    if (!res.ok) { logErr(`[Gemini] HTTP ${res.status}`, json); return null; }
    const cand = json?.candidates?.[0];
    const finish = cand?.finishReason;
    if (!cand || (finish && finish !== "STOP")) { logErr("[Gemini] finishReason:", finish); return null; }
    const out = cand?.content?.parts?.map(p => p?.text).filter(Boolean).join("\n").trim();
    return out || null;
  } catch (e) { logErr("[Gemini] exception:", e); return null; }
}

async function callOpenAI(messages, { maxTokens }) {
  const key = process.env.AI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(OPENAI_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: OPENAI_MODEL, messages, temperature: TEMP, max_tokens: maxTokens }),
    });
    const json = await res.json().catch(()=> ({}));
    if (!res.ok) { logErr(`[OpenAI] HTTP ${res.status}`, json); return null; }
    return json?.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) { logErr("[OpenAI] exception:", e); return null; }
}

/* ---------------------- Fallback ---------------------- */

function fallbackByMode(text, mode) {
  const clean = compress(stripHtml(text));
  if (!clean) return "";
  const sents = clean.split(/(?<=[.!?])\s+/);
  if (mode === "outline") {
    return sents.slice(0, 8).map(s => `• ${s.replace(/^[•\*\-]\s+/, "").trim()}`).join("\n");
  }
  if (mode === "detailed") {
    const mid = Math.floor(sents.length / 2);
    const pick = [0, 1, mid, sents.length - 2, sents.length - 1].filter(i => i >= 0 && i < sents.length);
    return normalizeParagraph(pick.map(i => sents[i]).join(" "));
  }
  return normalizeParagraph(sents.slice(0, 3).join(" "));
}

/* ---------------------- Prompt builder ---------------------- */

function buildPrompt(text, mode) {
  const commonRules =
    "Plain text only. No markdown or inline formatting (no *, _, #, backticks). " +
    "Use your own wording; do not copy exact phrases or repeat the headline. " +
    "Be neutral, concrete, and specific. No filler.";

  if (mode === "outline") {
    return `${commonRules}
Return 5–8 one-line bullets. Prefix each bullet with "• " (Unicode bullet) exactly.
No sub-bullets. No numbering. No extra commentary.
Text:
${text}`;
  }
  if (mode === "detailed") {
    return `${commonRules}
Write a clear 120–180 word paragraph covering: what happened, who is involved, where/when, why it matters, what's next.
One paragraph. No bullets.
Text:
${text}`;
  }
  // tldr
  return `${commonRules}
Write 2–3 plain sentences (no bullets).
Text:
${text}`;
}

/* ---------------------- Public API ---------------------- */

async function summarize(rawText, { mode = "tldr" } = {}) {
  const text = truncate(compress(stripHtml(rawText || "")));
  if (!text) return "";

  const maxTokens = mode === "detailed" ? TOKENS_DETAILED : mode === "outline" ? TOKENS_OUTLINE : TOKENS_TLDR;
  const prompt = buildPrompt(text, mode);

  if (PROVIDER === "gemini") {
    const g = await callGemini(prompt, { maxTokens });
    if (g) return normalizeOutput(g, mode);
  }
  const o = await callOpenAI(
    [
      { role: "system", content: "You write neutral, concise news summaries for a personal journal app. Output must follow the user's constraints exactly." },
      { role: "user", content: prompt },
    ],
    { maxTokens }
  );
  if (o) return normalizeOutput(o, mode);

  log("[fallback] local summarizer");
  return fallbackByMode(text, mode);
}

async function topicIdeas(headlines = []) {
  const list = Array.isArray(headlines) ? headlines.filter(Boolean) : [];
  if (list.length === 0) return [];
  const joined = list.slice(0, 12).map((t, i) => `${i + 1}. ${compress(t)}`).join("\n");

  const prompt = `Plain text only. No markdown, no numbering. 
Give 3 short daily journal prompts, one per line (no bullets). Keep each under 8 words.
Headlines:
${joined}`;

  if (PROVIDER === "gemini") {
    const g = await callGemini(prompt, { maxTokens: 140 });
    if (g) return g.split("\n").map(s => s.replace(/^\d+[\).\s-]*/, "").trim()).filter(Boolean).slice(0, 3);
  }
  const o = await callOpenAI(
    [
      { role: "system", content: "Suggest 3 short, timely journal prompts. Plain text, one per line, no bullets/numbering." },
      { role: "user", content: prompt },
    ],
    { maxTokens: 140 }
  );
  if (o) return o.split("\n").map(s => s.replace(/^\d+[\).\s-]*/, "").trim()).filter(Boolean).slice(0, 3);

  return list.slice(0, 3).map(t => `Reflect on: ${compress(t)}`);
}

module.exports = { summarize, topicIdeas };
