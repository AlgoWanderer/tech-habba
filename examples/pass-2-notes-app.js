import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
const app = express();
app.use(express.json());
const JWT_SECRET = "notes-app-super-secret-signing-key-2026";
const User = mongoose.model("User", new mongoose.Schema({ username: String, password: String }));
const Note = mongoose.model("Note", new mongoose.Schema({ ownerId: String, title: String, body: String }));
function requireLogin(req, res, next) {
  try {
    req.user = jwt.verify(req.headers.authorization?.split(" ")[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Please log in" });
  }
}
app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ username: req.body.username, password: req.body.password });
  if (!user) return res.status(401).json({ error: "Wrong username or password" });
  res.json({ token: jwt.sign({ id: user._id }, JWT_SECRET) });
});
app.get("/api/admin/notes", async (req, res) => {
  res.json(await Note.find({}));
});
app.get("/api/notes", requireLogin, async (req, res) => {
  res.json(await Note.find({ ownerId: req.user.id }));
});
app.listen(3000);
