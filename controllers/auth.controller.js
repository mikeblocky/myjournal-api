const jwt = require("jsonwebtoken");
const { z } = require("zod");
const User = require("../models/User");
const { hashPassword, comparePassword } = require("../utils/crypto");

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().min(1).max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function signToken(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not configured");
  }
  return jwt.sign({}, secret, { subject: userId.toString(), expiresIn: "7d" });
}

async function signup(req, res, next) {
  try {
    // Check if JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ 
        error: "Server configuration error", 
        details: "JWT_SECRET environment variable is not configured" 
      });
    }

    const data = signupSchema.parse(req.body);
    
    // Validate email format
    if (!data.email || !data.email.includes('@')) {
      return res.status(400).json({ error: "Invalid email format" });
    }
    
    // Validate password length
    if (!data.password || data.password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    const exists = await User.findOne({ email: data.email });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const user = await User.create({
      email: data.email,
      name: data.name || "",
      passwordHash: await hashPassword(data.password),
    });

    const token = signToken(user._id);
    res.status(201).json({ token, user: user.toPublic() });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({ 
        error: "Invalid input", 
        details: err.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }
    
    // Log the error for debugging
    console.error("Signup error:", err);
    
    // Handle specific error types
    if (err.message.includes("JWT_SECRET")) {
      return res.status(500).json({ error: "Server configuration error", details: err.message });
    }
    
    if (err.code === 11000) {
      return res.status(409).json({ error: "Email already registered" });
    }
    
    next(err);
  }
}

async function login(req, res, next) {
  try {
    // Check if JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ 
        error: "Server configuration error", 
        details: "JWT_SECRET environment variable is not configured" 
      });
    }

    const { email, password } = loginSchema.parse(req.body);
    
    // Validate email format
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: "Invalid email format" });
    }
    
    // Validate password
    if (!password || password.length === 0) {
      return res.status(400).json({ error: "Password is required" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken(user._id);
    res.json({ token, user: user.toPublic() });
  } catch (err) {
    if (err.name === "ZodError") {
      return res.status(400).json({ 
        error: "Invalid input", 
        details: err.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }
    
    // Log the error for debugging
    console.error("Login error:", err);
    
    // Handle specific error types
    if (err.message.includes("JWT_SECRET")) {
      return res.status(500).json({ error: "Server configuration error", details: err.message });
    }
    
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: user.toPublic() });
  } catch (err) {
    next(err);
  }
}

module.exports = { signup, login, me };
