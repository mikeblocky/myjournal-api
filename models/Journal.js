const mongoose = require("mongoose");
const { Schema } = mongoose;

function ymd(d = new Date()) { return new Date(d).toISOString().slice(0,10); }
function slugify(s=""){
  return String(s).toLowerCase()
    .replace(/['"]/g,"")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,60);
}
function excerptOf(body="", n=260){
  const s = String(body).replace(/\s+/g," ").trim();
  return s.length > n ? s.slice(0, n-1) + "…" : s;
}

const JournalSchema = new Schema({
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, default: "" },
  body: { type: String, default: "" },
  tags: { type: [String], default: [] },
  date: { type: String, default: () => ymd() }, // YYYY-MM-DD

  // publishing
  visibility: { type: String, enum: ["private", "public"], default: "private", index: true },
  publishedAt: { type: Date, default: null, index: true },
  slug: { type: String, unique: true, sparse: true }, // only required for public posts

  // optional display fields
  coverUrl: { type: String, default: "" },
  authorDisplay: { type: String, default: "" },
}, { timestamps: true });

JournalSchema.pre("validate", function(next){
  if (this.visibility === "public") {
    if (!this.date) this.date = ymd();
    if (!this.publishedAt) this.publishedAt = new Date();
    if (!this.slug) {
      const base = `${this.date}-${slugify(this.title || "journal")}`;
      const tail = String(this._id || "").slice(-6) || Math.random().toString(36).slice(2,8);
      this.slug = `${base}-${tail}`;
    }
  }
  next();
});

JournalSchema.methods.toPublic = function(){
  return {
    id: this._id,
    title: this.title,
    body: this.body,
    excerpt: excerptOf(this.body),
    tags: this.tags || [],
    date: this.date,
    slug: this.slug || null,
    coverUrl: this.coverUrl || "",
    authorDisplay: this.authorDisplay || "",
    visibility: this.visibility,
    publishedAt: this.publishedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("Journal", JournalSchema);
