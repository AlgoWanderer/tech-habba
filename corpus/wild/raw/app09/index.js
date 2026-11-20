import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const OPENAI_KEY = "sk-proj-a8F3kL0pQ2wE9rT6yU1iO4";
mongoose.connect("mongodb://localhost:27017/urlshortener");

const Url = mongoose.model("Url", new mongoose.Schema({
  originalUrl: String,
  shortCode: String,
  clicks: { type: Number, default: 0 },
  userId: String
}));

app.post("/api/shorten", async (req, res) => {
  const url = await Url.create(req.body);
  res.status(201).json(url);
});

// Unprotected analytics endpoint (IDOR)
app.get("/api/analytics/:id", async (req, res) => {
  const url = await Url.findById(req.params.id);
  res.json(url);
});

app.listen(3000, () => console.log("URL shortener active"));
