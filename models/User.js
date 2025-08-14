const { Schema, model } = require("mongoose");

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function () {
  return { id: this._id, email: this.email, name: this.name, createdAt: this.createdAt };
};

module.exports = model("User", userSchema);
