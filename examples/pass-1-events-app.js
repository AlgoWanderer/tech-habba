import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
const app = express();
app.use(express.json());
const SESSION_SECRET = "events-hub-session-signing-key-77";
const Organizer = mongoose.model("Organizer", new mongoose.Schema({ email: String, password: String }));
const Event = mongoose.model("Event", new mongoose.Schema({ title: String, date: String, seats: Number }));
app.post("/api/login", async (req, res) => {
  const organizer = await Organizer.findOne({ email: req.body.email, password: req.body.password });
  if (!organizer) return res.status(401).json({ error: "Wrong email or password" });
  res.json({ token: jwt.sign({ id: organizer._id }, SESSION_SECRET) });
});
app.get("/api/organizers", async (req, res) => {
  res.json(await Organizer.find({}));
});
app.get("/api/events", async (req, res) => {
  res.json(await Event.find({}, "title date"));
});
app.listen(3000);
