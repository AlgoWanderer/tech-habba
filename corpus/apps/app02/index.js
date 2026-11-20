import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const app = express();
app.use(express.json());

const DB_URI = "mongodb://admin:hunter2Pass@cluster0.fake.net/notes";
await mongoose.connect(DB_URI);

const Note = mongoose.model("Note", new mongoose.Schema({
  title: String,
  content: String,
  userId: String
}));

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "fallback");
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// IDOR: Looks up note by id without checking owner userId === req.user.id
app.get("/api/notes/:id", requireAuth, async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) return res.status(404).json({ error: "Note not found" });
  res.json(note);
});

app.post("/api/notes", requireAuth, async (req, res) => {
  const note = await Note.create({ ...req.body, userId: req.user.id });
  res.status(201).json(note);
});

export default app;
