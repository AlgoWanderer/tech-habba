import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Rsvp = mongoose.model("Rsvp", new mongoose.Schema({
  eventId: String,
  userId: String,
  confirmed: Boolean
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "No auth" });
  req.user = { id: "user_rsvp" };
  next();
}

// Unprotected route exposing attendee list
app.get("/api/events/attendees", async (req, res) => {
  const list = await Rsvp.find();
  res.json(list);
});

// IDOR: Delete RSVP without ensuring ownership
app.delete("/api/rsvp/:id", requireAuth, async (req, res) => {
  await Rsvp.findByIdAndDelete(req.params.id);
  res.json({ status: "cancelled" });
});

export default app;
