import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const app = express();
app.use(express.json());

const JWT_SECRET = "secret_blog_token_key_99";
mongoose.connect("mongodb://localhost:27017/blog");

const Post = mongoose.model("Post", new mongoose.Schema({
  title: String,
  content: String,
  authorId: String,
  comments: [{ text: String, authorId: String }]
}));

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/api/posts", async (req, res) => {
  const posts = await Post.find();
  res.json(posts);
});

app.post("/api/posts", authMiddleware, async (req, res) => {
  const post = await Post.create({ ...req.body, authorId: req.user.id });
  res.status(201).json(post);
});

// IDOR: edit post without checking authorId === req.user.id
app.put("/api/posts/:id", authMiddleware, async (req, res) => {
  const updated = await Post.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

// IDOR: delete post without checking authorId
app.delete("/api/posts/:id", authMiddleware, async (req, res) => {
  await Post.findByIdAndDelete(req.params.id);
  res.json({ message: "Post deleted" });
});

app.post("/api/posts/:id/comments", authMiddleware, async (req, res) => {
  const post = await Post.findById(req.params.id);
  post.comments.push({ text: req.body.text, authorId: req.user.id });
  await post.save();
  res.json(post);
});

app.listen(3000, () => console.log("Blog API running"));
