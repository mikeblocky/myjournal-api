// backend/src/services/ai.service.js
"use strict";

/* -------------------- Env & defaults -------------------- */
const PROVIDER      = (process.env.AI_PROVIDER || "openai").toLowerCase(); // "openai" | "gemini"
const GEMINI_MODEL  = process.env.GEMINI_MODEL  || "gemini-2.0-flash";

const OPENAI_MODEL  = process.env.AI_MODEL      || "gpt-4o-mini";
const OPENAI_BASE   = "https://api.openai.com/v1/chat/completions"; // Force Chat Completions API

// Only include temperature if AI_TEMPERATURE is explicitly set
const TEMP_ENV      = process.env.AI_TEMPERATURE;
const HAS_TEMP      = TEMP_ENV !== undefined && TEMP_ENV !== "" && !Number.isNaN(Number(TEMP_ENV));
const TEMP_VALUE    = HAS_TEMP ? Number(TEMP_ENV) : null;

const MAX_INPUT_CHARS = Number(process.env.AI_MAX_INPUT_CHARS || 16000);
const TOKENS_TLDR     = Number(process.env.AI_MAX_TOKENS      || 150);  // Reduced from 220
const TOKENS_DETAILED = Number(process.env.AI_DETAILED_TOKENS || 300);  // Reduced from 480
const TOKENS_OUTLINE  = Number(process.env.AI_OUTLINE_TOKENS  || 250);  // Reduced from 420

const AI_DEBUG = process.env.AI_DEBUG === "true";
function log(...a){ if (AI_DEBUG) console.log("[AI]", ...a); }
function logErr(...a){ console.error("[AI]", ...a); }

/* -------------------- Text utils -------------------- */
function stripHtml(s = "") { return String(s).replace(/<[^>]+>/g, " "); }
function compress(s = "")  { return String(s).replace(/\s+/g, " ").trim(); }
function truncate(s = "", n = MAX_INPUT_CHARS) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

/* -------------------- Output normalizers -------------------- */
function removeInlineEmphasis(s=""){
  return s
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2");
}

function normalizeOutline(text){
  let s = String(text || "").replace(/\r\n/g, "\n").trim();
  
  log("[normalizeOutline] Input:", { length: s.length, text: s.substring(0, 200) + "..." });

  // First, clean up the input to standardize bullet formats
  s = s
    .replace(/^\s*[\*\-]\s+/gm, "• ")
    .replace(/^\s*•\s+/gm, "• ")
    .replace(/^\s*\d+[\.\)\]]\s+/gm, "• ")
    .replace(/\s\*\s/g, "\n• ");

  s = removeInlineEmphasis(s);

  // Handle cases where AI returns text with periods instead of line breaks
  // Split on periods followed by spaces and common sentence starters
  if (!s.includes('\n') && s.includes('• ')) {
    s = s.replace(/\.\s+/g, ".\n");
  }
  
  // If the AI returned a paragraph-like text but we need bullets, try to split on sentence boundaries
  if (!s.includes('\n') && !s.includes('• ') && s.includes('. ')) {
    // Split on sentence boundaries and convert to bullets
    s = s.split(/\.\s+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 10) // Only keep meaningful sentences
      .map(sentence => `• ${sentence}`)
      .join('\n');
  }
  
  // Handle case where AI returns bullets without line breaks (e.g., "• Point 1. • Point 2. • Point 3")
  if (s.includes('• ') && !s.includes('\n')) {
    log("[normalizeOutline] Found bullets without line breaks, fixing...");
    // Split on bullet markers and ensure each gets its own line
    s = s.replace(/•\s+/g, '\n• ')
      .replace(/^\n/, '') // Remove leading newline
      .trim();
    log("[normalizeOutline] After fixing line breaks:", { text: s.substring(0, 200) + "..." });
  }
  
  // Handle case where AI returns bullets with periods but no line breaks (e.g., "• Point 1. • Point 2.")
  if (s.includes('• ') && s.includes('. ') && !s.includes('\n')) {
    log("[normalizeOutline] Found bullets with periods but no line breaks, fixing...");
    // First split on bullet markers, then on periods
    s = s.replace(/•\s+/g, '\n• ')
      .replace(/^\n/, '') // Remove leading newline
      .replace(/\.\s+/g, '.\n') // Add line breaks after periods
      .trim();
    log("[normalizeOutline] After fixing periods and line breaks:", { text: s.substring(0, 200) + "..." });
  }
  
  // Handle case where AI returns text that looks like a paragraph but contains bullet markers
  // This is the most common case - AI returns "• Point 1. • Point 2. • Point 3" as one line
  if (s.includes('• ') && s.includes('. ') && s.split('\n').length === 1) {
    log("[normalizeOutline] Found paragraph-like text with bullets, converting to proper format...");
    // Split on bullet markers and ensure proper formatting
    const bullets = s.split(/•\s+/)
      .filter(part => part.trim().length > 0)
      .map(part => {
        let bullet = part.trim();
        // Ensure it ends with a period
        if (!bullet.endsWith('.')) {
          bullet += '.';
        }
        return `• ${bullet}`;
      });
    s = bullets.join('\n');
    log("[normalizeOutline] After converting paragraph to bullets:", { text: s.substring(0, 200) + "..." });
  }
  
  // Handle case where AI returns text with multiple bullet markers on the same line
  // This can happen when the AI doesn't follow the format properly
  if (s.includes('• ') && s.split('\n').length === 1 && (s.match(/•/g) || []).length > 1) {
    log("[normalizeOutline] Found multiple bullets on same line, splitting...");
    // Split on bullet markers and clean up
    const bullets = s.split(/•\s+/)
      .filter(part => part.trim().length > 0)
      .map(part => {
        let bullet = part.trim();
        // Remove any trailing punctuation that might interfere
        bullet = bullet.replace(/[.!?]+$/, '');
        // Ensure it ends with a period
        if (!bullet.endsWith('.') && !bullet.endsWith('!') && !bullet.endsWith('?')) {
          bullet += '.';
        }
        return `• ${bullet}`;
      });
    s = bullets.join('\n');
    log("[normalizeOutline] After splitting multiple bullets:", { text: s.substring(0, 200) + "..." });
  }
  
  // NEW: Handle the specific case where AI returns "• Point 1. • Point 2. • Point 3" as one line
  // This is the exact issue described by the user
  if (s.includes('• ') && s.includes('. ') && !s.includes('\n') && (s.match(/•/g) || []).length > 1) {
    log("[normalizeOutline] Found continuous bullet text without line breaks, fixing...");
    // Split on bullet markers and ensure each gets its own line
    const bullets = s.split(/•\s+/)
      .filter(part => part.trim().length > 0)
      .map(part => {
        let bullet = part.trim();
        // Remove trailing punctuation and add clean period
        bullet = bullet.replace(/[.!?]+$/, '');
        bullet = bullet + '.';
        return `• ${bullet}`;
      });
    s = bullets.join('\n');
    log("[normalizeOutline] After fixing continuous bullet text:", { text: s.substring(0, 200) + "..." });
  }
  
  // Final cleanup: ensure we have proper line breaks and no extra whitespace
  s = s.replace(/\n\s+/g, '\n') // Remove leading whitespace on lines
       .replace(/\s+\n/g, '\n') // Remove trailing whitespace on lines
       .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines to max 2
       .trim();
  
  // If we still don't have proper line breaks, try to split on sentence boundaries
  if (!s.includes('\n') && s.includes('. ')) {
    log("[normalizeOutline] Still no line breaks, trying sentence-based splitting...");
    const sentences = s.split(/\.\s+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 10)
      .map(sentence => `• ${sentence}.`);
    s = sentences.join('\n');
    log("[normalizeOutline] After sentence-based splitting:", { text: s.substring(0, 200) + "..." });
  }
  
  // Last resort: if we still don't have bullets, try to create them from the text
  if (!s.includes('• ') && s.includes('. ')) {
    log("[normalizeOutline] No bullets found, creating them from sentences...");
    const sentences = s.split(/\.\s+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 10)
      .map(sentence => `• ${sentence}.`);
    s = sentences.join('\n');
    log("[normalizeOutline] After creating bullets from sentences:", { text: s.substring(0, 200) + "..." });
  }
  
  // Absolute last resort: if we have no sentence boundaries, try to split on common conjunctions
  if (!s.includes('\n') && !s.includes('. ') && s.length > 100) {
    log("[normalizeOutline] No sentence boundaries, trying conjunction-based splitting...");
    const parts = s.split(/\s+(?:and|but|however|meanwhile|additionally|furthermore|moreover|also|while|although|despite|nevertheless)\s+/i)
      .map(part => part.trim())
      .filter(part => part.length > 20)
      .map(part => `• ${part}.`);
    if (parts.length > 1) {
      s = parts.join('\n');
      log("[normalizeOutline] After conjunction-based splitting:", { text: s.substring(0, 200) + "..." });
    }
  }
  
  // Final fallback: if we still have no structure, try to create artificial breaks
  if (!s.includes('\n') && s.length > 150) {
    log("[normalizeOutline] No structure found, creating artificial breaks...");
    const words = s.split(/\s+/);
    const wordsPerBullet = Math.ceil(words.length / 6); // Aim for 6 bullets
    const bullets = [];
    for (let i = 0; i < words.length; i += wordsPerBullet) {
      const chunk = words.slice(i, i + wordsPerBullet).join(' ');
      if (chunk.trim().length > 10) {
        bullets.push(`• ${chunk.trim()}.`);
      }
    }
    if (bullets.length > 1) {
      s = bullets.join('\n');
      log("[normalizeOutline] After creating artificial breaks:", { text: s.substring(0, 200) + "..." });
    }
  }
  
  // If we still have no structure at all, just return the text as a single bullet
  if (!s.includes('\n') && !s.includes('• ')) {
    log("[normalizeOutline] No structure at all, creating single bullet...");
    s = `• ${s.trim()}.`;
  }
  
  // Final validation: ensure we have at least one bullet
  if (!s.includes('• ')) {
    log("[normalizeOutline] No bullets found after all processing, creating fallback...");
    s = `• ${s.trim()}.`;
  }
  
  // Ensure we have proper line breaks for the final processing
  if (!s.includes('\n')) {
    log("[normalizeOutline] Adding line breaks for final processing...");
    s = s.replace(/•\s+/g, '\n• ').replace(/^\n/, '').trim();
  }
  
  // Log the final text before line processing
  log("[normalizeOutline] Final text before line processing:", { text: s.substring(0, 300) + "..." });

  // Split into lines and process each bullet
  let lines = s.split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      // Ensure each line starts with a bullet
      if (!l.startsWith("• ")) {
        l = "• " + l;
      }
      // Capitalize first letter after bullet
      if (l.length > 2) {
        l = "• " + l[2].toUpperCase() + l.slice(3);
      }
      // Ensure each bullet ends with a period
      if (!l.endsWith('.') && !l.endsWith('!') && !l.endsWith('?')) {
        l += '.';
      }
      return l;
    });

  // Remove duplicates and limit to 8 bullets
  const seen = new Set();
  lines = lines.filter(l => { 
    const k = l.toLowerCase(); 
    if (seen.has(k)) return false; 
    seen.add(k); 
    return true; 
  }).slice(0, 8);
  
  // Join with proper line breaks
  const result = lines.join("\n");
  log("[normalizeOutline] Final output:", { length: result.length, text: result.substring(0, 200) + "..." });
  return result;
}

function normalizeParagraph(text){
  let s = String(text || "").replace(/\r\n/g, "\n").trim();
  s = s
    .replace(/^\s*[•\*\-]\s+/gm, "")
    .replace(/\s\*\s/g, ". ")
    .replace(/\n+/g, " ");

  s = removeInlineEmphasis(s);
  s = s.replace(/\s+([.,;:!?])/g, "$1").replace(/\s{2,}/g, " ").trim();
  if (!/[.!?…]$/.test(s)) s += ".";
  return s;
}

function normalizeOutput(text, mode){
  const raw = (text || "").trim();
  if (!raw) return "";
  
  if (mode === "outline") {
    // For outline mode, preserve the bullet structure and line breaks
    log("[normalizeOutput] Processing outline mode");
    return normalizeOutline(raw);
  }

  // For other modes, clean up the text
  const looksListy = /^(\s*[•\*\-\d].*)$/m.test(raw) || raw.includes(" * ");
  const cleaned = looksListy ? normalizeParagraph(raw) : removeInlineEmphasis(raw);
  return compress(cleaned);
}

/* -------------------- Prompt builder -------------------- */
function buildPrompt(text, mode) {
  const base =
    "IMPORTANT: You are summarizing the following text. Do NOT repeat or copy the original text. " +
    "Create a NEW summary in your own words. " +
    "Plain text only. No markdown or inline formatting (no *, _, #, backticks). " +
    "Use your own wording; do not copy exact phrases or repeat the headline. " +
    "Be neutral, concrete, and specific. No filler.";

  if (mode === "outline") {
    return `${base}
Return 5–8 one-line bullets. Each bullet should be on its own line.
Prefix each bullet with "• " (Unicode bullet) exactly.
No sub-bullets. No numbering. No extra commentary.
Each bullet should be a complete, standalone sentence.
IMPORTANT: Each bullet point must be on a separate line with a line break between them.
CRITICAL: Do not put all bullets in one paragraph. Each bullet must be on its own line.
CRITICAL: Each bullet must end with a period and be followed by a line break.
CRITICAL: Use actual line breaks (\\n), not just spaces or periods.
CRITICAL: The output should look like this exact format with line breaks:
• First bullet point here.
• Second bullet point here.
• Third bullet point here.

Text to summarize:
${text}`;
  }
  if (mode === "detailed") {
    return `${base}
Write a clear 120–180 word paragraph covering: what happened, who is involved, where/when, why it matters, what's next.
One paragraph. No bullets.
Text to summarize:
${text}`;
  }
  // tldr
  return `${base}
Write 2–3 plain sentences (no bullets).
Text to summarize:
${text}`;
}

/* -------------------- Providers -------------------- */
async function callGemini(text, { maxTokens }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 } // Gemini tolerates 0.2 well
  };

  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) { logErr("[Gemini] HTTP", res.status, json); return null; }

    const cand = json?.candidates?.[0];
    const out  = cand?.content?.parts?.map(p => p?.text).filter(Boolean).join("\n").trim();
    if (out) return out;

    logErr("[Gemini] finishReason:", cand?.finishReason);
    return null;
  } catch (e) {
    logErr("[Gemini] exception:", e);
    return null;
  }
}

function isResponsesAPI() { return /\/responses\b/.test(OPENAI_BASE); }

async function callOpenAI(messages, { maxTokens }) {
  const key = process.env.AI_API_KEY;
  if (!key) return null;

  // Helper for POST
  async function post(body) {
    const res  = await fetch(OPENAI_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  }

  // Responses API path (we join messages into one text block to keep it simple)
  if (isResponsesAPI()) {
    const joined = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
    const payload = {
      model: OPENAI_MODEL,
      input: joined,
      max_output_tokens: maxTokens
    };
    if (TEMP_VALUE !== null) payload.temperature = TEMP_VALUE;

    let { res, json } = await post(payload);

    // If temperature unsupported → retry without it
    if (!res.ok && (json?.error?.param === "temperature" || /temperature/.test(json?.error?.message || ""))) {
      delete payload.temperature;
      ({ res, json } = await post(payload));
    }

    if (res.ok) {
      log("[OpenAI][responses] Response received:", { 
        model: OPENAI_MODEL, 
        maxTokens, 
        response: json 
      });
      
      // Handle the Responses API structure properly
      let out = "";
      
      // Try different possible output locations
      if (json.output_text) {
        out = json.output_text;
      } else if (json.output && Array.isArray(json.output) && json.output.length > 0) {
        // The output is an array, extract text from it
        const outputItem = json.output[0];
        if (outputItem && outputItem.content && Array.isArray(outputItem.content)) {
          out = outputItem.content.map(c => c.text || "").filter(Boolean).join("\n");
        } else if (outputItem && outputItem.text) {
          out = outputItem.text;
        }
      } else if (json.choices && json.choices[0] && json.choices[0].message) {
        out = json.choices[0].message.content;
      }
      
      if (out && out.trim()) {
        log("[OpenAI][responses] Content extracted:", { 
          outputLength: out.length, 
          output: out.substring(0, 100) + "..." 
        });
        return out.trim();
      } else {
        logErr("[OpenAI][responses] No content found in response. Output structure:", json.output);
        return null;
      }
    }

    // Retry on 429/5xx
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      for (let i = 0; i < 2; i++) {
        await new Promise(r => setTimeout(r, 400 * (i + 1) ** 2));
        ({ res, json } = await post(payload));
        if (res.ok) {
          const out =
            json.output_text ||
            json?.output?.[0]?.content?.[0]?.text ||
            json?.choices?.[0]?.message?.content || "";
          return (out || "").trim() || null;
        }
      }
    }

    logErr("[OpenAI][responses] HTTP", res.status, json);
    return null;
  }

  // Chat Completions path
  // Handle different parameter names for different models
  const basePayload = { model: OPENAI_MODEL, messages };
  if (TEMP_VALUE !== null) basePayload.temperature = TEMP_VALUE;

  // Try max_completion_tokens first (for gpt-5* models)
  let { res, json } = await post({ ...basePayload, max_completion_tokens: maxTokens });

  // If that fails, try max_tokens (for gpt-4* models)
  if (!res.ok && json?.error?.param === "max_completion_tokens") {
    ({ res, json } = await post({ ...basePayload, max_tokens: maxTokens }));
  }

  if (res.ok) {
    const content = json?.choices?.[0]?.message?.content;
    log("[OpenAI] Response received:", { 
      model: OPENAI_MODEL, 
      maxTokens, 
      contentLength: content?.length || 0,
      usage: json?.usage,
      choices: json?.choices,
      firstChoice: json?.choices?.[0]
    });
    return content?.trim() || null;
  }

  // Retry on 429/5xx
  if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
    for (let i = 0; i < 2; i++) {
      await new Promise(r => setTimeout(r, 400 * (i + 1) ** 2));
      const { res: retryRes, json: retryJson } = await post({ ...basePayload, max_completion_tokens: maxTokens });
      if (retryRes.ok) {
        const content = retryJson?.choices?.[0]?.message?.content;
        log("[OpenAI] Response received (retry):", { 
          model: OPENAI_MODEL, 
          maxTokens, 
          contentLength: content?.length || 0,
          usage: retryJson?.usage 
        });
        return content?.trim() || null;
      }
    }
  }

  logErr("[OpenAI] HTTP", res.status, json);
  return null;
}

/* -------------------- Local fallback -------------------- */
function fallbackByMode(text, mode) {
  const clean = compress(stripHtml(text));
  if (!clean) return "";
  const sents = clean.split(/(?<=[.!?])\s+/);

  if (mode === "outline") {
    const outline = sents.slice(0, 8).map(s => `• ${s.replace(/^[•\*\-]\s+/, "").trim()}`).join("\n");
    log("[fallback] outline generated:", { outputLength: outline.length, output: outline.substring(0, 200) + "..." });
    return outline;
  }
  if (mode === "detailed") {
    const mid  = Math.floor(sents.length / 2);
    const pick = [0, 1, mid, sents.length - 2, sents.length - 1]
      .filter(i => i >= 0 && i < sents.length);
    return normalizeParagraph(pick.map(i => sents[i]).join(" "));
  }
  return normalizeParagraph(sents.slice(0, 3).join(" "));
}

/* -------------------- Public API -------------------- */
async function summarize(rawText, { mode = "tldr" } = {}) {
  const text = truncate(compress(stripHtml(rawText || "")));
  if (!text) return "";

  const maxTokens =
    mode === "detailed" ? TOKENS_DETAILED :
    mode === "outline"  ? TOKENS_OUTLINE  :
                          TOKENS_TLDR;

  const prompt = buildPrompt(text, mode);
  
  log("[AI] Summarizing:", { 
    mode, 
    maxTokens, 
    inputLength: text.length, 
    provider: PROVIDER,
    model: OPENAI_MODEL 
  });

  if (PROVIDER === "gemini") {
    const g = await callGemini(prompt, { maxTokens });
    if (g) {
      log("[AI] Gemini response:", { outputLength: g.length, output: g.substring(0, 100) + "..." });
      const normalized = normalizeOutput(g, mode);
      log("[AI] Normalized output:", { mode, outputLength: normalized.length, output: normalized.substring(0, 200) + "..." });
      return normalized;
    }
  }

  const o = await callOpenAI(
    [
      { role: "system", content: "You write neutral, concise news summaries for a personal journal app. Output must follow the user's constraints exactly." },
      { role: "user",   content: prompt }
    ],
    { maxTokens }
  );
  
  if (o) {
    log("[AI] OpenAI response:", { outputLength: o.length, output: o.substring(0, 100) + "..." });
    const normalized = normalizeOutput(o, mode);
    log("[AI] Normalized output:", { mode, outputLength: normalized.length, output: normalized.substring(0, 200) + "..." });
    return normalized;
  }

  log("[fallback] local summarizer");
  return fallbackByMode(text, mode);
}

async function topicIdeas(headlines = []) {
  const list = Array.isArray(headlines) ? headlines.filter(Boolean) : [];
  if (list.length === 0) return [];

  const joined = list.slice(0, 12).map((t, i) => `${i + 1}. ${compress(t)}`).join("\n");
  const prompt =
`Plain text only. No markdown, no numbering.
Give 3 short daily journal prompts, one per line (no bullets). Keep each under 8 words.
Headlines:
${joined}`;

  if (PROVIDER === "gemini") {
    const g = await callGemini(prompt, { maxTokens: 140 });
    if (g) {
      return g.split("\n")
        .map(s => s.replace(/^\d+[\).\s-]*/, "").trim())
        .filter(Boolean).slice(0, 3);
    }
  }

  const o = await callOpenAI(
    [
      { role: "system", content: "Suggest 3 short, timely journal prompts. Plain text, one per line, no bullets/numbering." },
      { role: "user",   content: prompt }
    ],
    { maxTokens: 140 }
  );
  if (o) {
    return o.split("\n")
      .map(s => s.replace(/^\d+[\).\s-]*/, "").trim())
      .filter(Boolean).slice(0, 3);
  }

  return list.slice(0, 3).map(t => `Reflect on: ${compress(t)}`);
}

module.exports = { summarize, topicIdeas };
