const mongoose = require("mongoose");
const { Schema } = mongoose;

function ymd(d = new Date()) { return new Date(d).toISOString().slice(0,10); }

const CalendarEventSchema = new Schema({
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

  title: { type: String, required: true },
  date:  { type: String, default: () => ymd(), index: true }, // YYYY-MM-DD
  startTime: { type: String, default: "" }, // "HH:MM" 24h
  endTime:   { type: String, default: "" }, // "HH:MM"
  allDay: { type: Boolean, default: true },

  location: { type: String, default: "" },
  description: { type: String, default: "" },
  color: { type: String, default: "" },
  tags: { type: [String], default: [] },
}, { timestamps: true });

CalendarEventSchema.pre("validate", function(next){
  if (typeof this.date === "string") this.date = this.date.slice(0,10);
  // auto allDay if no startTime
  this.allDay = !this.startTime;
  next();
});

CalendarEventSchema.methods.toPublic = function(){
  return {
    id: this._id,
    title: this.title,
    date: this.date,
    startTime: this.startTime,
    endTime: this.endTime,
    allDay: this.allDay,
    location: this.location,
    description: this.description,
    color: this.color,
    tags: this.tags || [],
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

module.exports = mongoose.model("CalendarEvent", CalendarEventSchema);
