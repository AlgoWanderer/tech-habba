import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Episode = mongoose.model("Episode", new mongoose.Schema({
  title: String,
  creatorId: String,
  audioUrl: String
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
  req.user = { id: "host_1" };
  next();
}

// IDOR: Updating podcast episode without creatorId verification
app.put("/api/episodes/:id", requireAuth, async (req, res) => {
  const updated = await Episode.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

export default app;
