const mongoose = require("mongoose");
const { Schema } = mongoose;

/* ---------- helpers ---------- */
function stripHtml(s = "") {
  return String(s).replace(/<[^>]+>/g, " ");
}
function estimateReadingMins(htmlOrText = "") {
  const words = stripHtml(htmlOrText).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220)); // ~220 wpm; minimum 1 min
}
function normUrl(u) {
  try {
    const x = new URL(u);
    x.hash = "";
    // strip common trackers
    [
      "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
      "ns_mchannel","ns_source","ns_campaign","ns_linkname","ocid","at_medium","at_campaign"
    ].forEach(k => x.searchParams.delete(k));
    // unify BBC hosts to reduce dupes
    x.host = x.host.replace(/^www\./, "").replace("bbc.com", "bbc.co.uk");
    return x.toString();
  } catch {
    return String(u || "").split("#")[0];
  }
}

const ArticleSchema = new Schema(
  {
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    url:        { type: String, required: true },
    title:      { type: String, default: "" },
    byline:     { type: String, default: "" },
    excerpt:    { type: String, default: "" },
    contentHTML:{ type: String, default: "" },
        imageUrl: { type: String, default: "" },


    readingMins:{ type: Number, default: 0 },
    tags:       { type: [String], default: [] },

    // where we fetched it from (e.g., "BBC News", "Reuters")
    source:     { type: String, default: "" },

    // used for “newly seen” sorting after refresh
    lastSeenAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// normalize URL before validation (ensures unique index hits same value)
ArticleSchema.pre("validate", function(next) {
  if (this.url) this.url = normUrl(this.url);
  next();
});

// ensure readingMins is set if we have content/excerpt
ArticleSchema.pre("save", function(next) {
  if (!this.readingMins || this.readingMins < 1) {
    const basis = this.contentHTML || this.excerpt || this.title;
    this.readingMins = estimateReadingMins(basis);
  }
  next();
});

// unique per-user per-URL
ArticleSchema.index({ createdBy: 1, url: 1 }, { unique: true });

// optional search helpers
ArticleSchema.index({ title: "text", excerpt: "text" });

ArticleSchema.methods.toPublic = function toPublic() {
  const host = (() => { try { return new URL(this.url).host.replace(/^www\./, ""); } catch { return ""; } })();
  return {
    id: this._id,
    title: this.title,
    url: this.url,
    host,
    byline: this.byline,
    readingMins: this.readingMins,
    excerpt: this.excerpt,
    contentHTML: this.contentHTML,
    tags: this.tags || [],
    source: this.source || host,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    lastSeenAt: this.lastSeenAt,
    imageUrl: this.imageUrl || "",
  };
};

module.exports = mongoose.model("Article", ArticleSchema);
module.exports._normUrl = normUrl; // exported for controllers/tests if needed
