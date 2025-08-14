const mongoose = require("mongoose");
const { Schema } = mongoose;

const CalendarDailySchema = new Schema({
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD

  summary: { type: String, default: "" },   // full AI text (optional)
  agenda:  { type: [String], default: [] }, // bullets
  generatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

CalendarDailySchema.index({ createdBy: 1, date: 1 }, { unique: true });

CalendarDailySchema.methods.toPublic = function(){
  return {
    id: this._id,
    date: this.date,
    summary: this.summary,
    agenda: this.agenda,
    generatedAt: this.generatedAt
  };
};

module.exports = mongoose.model("CalendarDaily", CalendarDailySchema);
