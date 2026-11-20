import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Post = mongoose.model("Post", new mongoose.Schema({
  title: String,
  body: String,
  authorId: String,
  isDraft: Boolean
}));

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Unauthorized" });
  req.user = { id: "user123" };
  next();
}

// Unprotected route exposing internal drafts
app.get("/api/posts/drafts", async (req, res) => {
  const drafts = await Post.find({ isDraft: true });
  res.json(drafts);
});

// IDOR flaw: Deletes post by id without confirming authorId === req.user.id
app.delete("/api/posts/:id", requireAuth, async (req, res) => {
  const deleted = await Post.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.json({ message: "Deleted" });
});

export default app;
