const mongoose = require("mongoose");
const { Schema } = mongoose;

const NoteDailySchema = new Schema({
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  summary: { type: String, default: "" },
  bullets: { type: [String], default: [] },
  generatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

NoteDailySchema.index({ createdBy: 1, date: 1 }, { unique: true });

NoteDailySchema.methods.toPublic = function(){
  return {
    id: this._id,
    date: this.date,
    summary: this.summary,
    bullets: this.bullets,
    generatedAt: this.generatedAt
  };
};

module.exports = mongoose.model("NoteDaily", NoteDailySchema);
