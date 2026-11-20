import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Comment = mongoose.model("Comment", new mongoose.Schema({
  authorId: String,
  postId: String,
  text: String
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Missing token" });
  req.user = { id: "user_commenter" };
  next();
}

// Injection sink in postId query
app.get("/api/comments", async (req, res) => {
  const list = await Comment.find({ postId: req.query.postId });
  res.json(list);
});

// IDOR: Delete comment without verifying authorId
app.delete("/api/comments/:id", requireAuth, async (req, res) => {
  await Comment.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

export default app;
