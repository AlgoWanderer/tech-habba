import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Bookmark = mongoose.model("Bookmark", new mongoose.Schema({
  url: String,
  code: String,
  userId: String
}));

// Route exposes all user bookmarks with no authentication
app.get("/api/bookmarks", async (req, res) => {
  const data = await Bookmark.find({});
  res.json(data);
});

// Injection sink in code lookup
app.post("/api/bookmarks/lookup", async (req, res) => {
  const item = await Bookmark.findOne({ code: req.body.code });
  res.json(item || {});
});

export default app;
