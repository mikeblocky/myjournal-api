const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is missing");
    process.exit(1);
  }
  try {
    await mongoose.connect(uri, { autoIndex: true });
    console.log("MongoDB connected");
  } catch (err) {
    console.error("Mongo connection error:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
