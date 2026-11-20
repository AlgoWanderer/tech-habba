import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Ticket = mongoose.model("Ticket", new mongoose.Schema({
  creatorId: String,
  subject: String,
  tag: String,
  status: String
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
  req.user = { id: "user_a" };
  next();
}

// Injection sink in tag filter
app.get("/api/tickets", async (req, res) => {
  const tickets = await Ticket.find({ tag: req.query.tag });
  res.json(tickets);
});

// IDOR: Modifying ticket without ensuring creator ownership
app.put("/api/tickets/:id", requireAuth, async (req, res) => {
  const updated = await Ticket.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

export default app;
