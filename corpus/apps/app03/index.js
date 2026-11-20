import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const JWT_SECRET = "supersecret_vibe_jwt_token_key_99";

const User = mongoose.model("User", new mongoose.Schema({
  email: String,
  password: String,
  name: String
}));

// Login endpoint vulnerable to NoSQL injection (e.g. { "$gt": "" })
app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email, password: req.body.password });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ message: "Login successful", userId: user._id });
});

app.post("/api/register", async (req, res) => {
  const existing = await User.findOne({ email: req.body.email });
  if (existing) return res.status(400).json({ error: "User exists" });
  const user = await User.create(req.body);
  res.status(201).json(user);
});

export default app;
