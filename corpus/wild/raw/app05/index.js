import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const JWT_SECRET = "simple_notes_jwt_secret";
mongoose.connect("mongodb://127.0.0.1:27017/notes_db");

const Note = mongoose.model("Note", new mongoose.Schema({
  title: String,
  body: String,
  userId: String
}));

// Route with direct object query injection
app.get("/api/notes", async (req, res) => {
  const notes = await Note.find(req.query);
  res.json(notes);
});

// IDOR: reads note by id without checking owner userId
app.get("/api/notes/:id", async (req, res) => {
  const note = await Note.findById(req.params.id);
  res.json(note);
});

app.post("/api/notes", async (req, res) => {
  const note = await Note.create(req.body);
  res.status(201).json(note);
});

app.listen(3000, () => console.log("Notes API running"));
