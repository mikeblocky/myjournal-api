const mongoose = require("mongoose");
const { Schema } = mongoose;

const DigestItemSchema = new Schema({
  articleId: { type: Schema.Types.ObjectId, ref: "Article" },
  url: String,
  title: String,
  summary: String,
  source: String,
  readingMins: Number,
  category: { type: String, enum: ["top","emerging","long"], default: "top" },
  rank: Number,
}, { _id: false });

const DigestSchema = new Schema({
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  tldr: { type: String, default: "" },
  topics: { type: [String], default: [] },
  sources: { type: [String], default: [] },
  stats: {
    totalItems: { type: Number, default: 0 },
    longReads:  { type: Number, default: 0 },
    newCount:   { type: Number, default: 0 },
  },
  items: { type: [DigestItemSchema], default: [] },
  generatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

DigestSchema.index({ createdBy: 1, date: 1 }, { unique: true });

DigestSchema.methods.toPublic = function(){
  return {
    id: this._id,
    date: this.date,
    tldr: this.tldr,
    topics: this.topics,
    sources: this.sources,
    stats: this.stats,
    items: this.items,
    generatedAt: this.generatedAt,
  };
};

module.exports = mongoose.model("Digest", DigestSchema);
