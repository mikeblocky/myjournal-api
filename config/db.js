const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI environment variable is missing");
    console.error("Please set MONGODB_URI in your environment variables");
    console.error("Example: MONGODB_URI=mongodb://localhost:27017/myjournal");
    process.exit(1);
  }
  
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(uri, { 
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection failed:");
    console.error("Error:", err.message);
    console.error("URI:", uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")); // Hide credentials
    console.error("Please check your MongoDB connection string and ensure the database is running");
    process.exit(1);
  }
}

module.exports = connectDB;
