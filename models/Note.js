const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ymd } = require("../utils/date");

const NoteSchema = new Schema({
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title:     { type: String, default: "" },
  body:      { type: String, default: "" },
  date:      { type: String, default: () => ymd(), index: true }, // YYYY-MM-DD
  done:      { type: Boolean, default: false, index: true },
  pinned:    { type: Boolean, default: false },
  tags:      { type: [String], default: [] },
}, { timestamps: true });

NoteSchema.methods.toPublic = function(){
  return {
    id: this._id,
    title: this.title,
    body: this.body,
    date: this.date,
    done: this.done,
    pinned: this.pinned,
    tags: this.tags || [],
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

module.exports = mongoose.model("Note", NoteSchema);
