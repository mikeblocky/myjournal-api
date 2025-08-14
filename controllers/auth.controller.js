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
  return jwt.sign({}, process.env.JWT_SECRET, { subject: userId.toString(), expiresIn: "7d" });
}

async function signup(req, res, next) {
  try {
    const data = signupSchema.parse(req.body);
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
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.issues });
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken(user._id);
    res.json({ token, user: user.toPublic() });
  } catch (err) {
    if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input", details: err.issues });
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
