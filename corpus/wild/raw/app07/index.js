import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

mongoose.connect("mongodb://localhost:27017/chat_app");

const Message = mongoose.model("Message", new mongoose.Schema({
  roomId: String,
  sender: String,
  text: String
}));

// Injection sink via search query
app.get("/api/messages/search", async (req, res) => {
  const messages = await Message.find({ text: req.query.text });
  res.json(messages);
});

// IDOR on chat room messages
app.get("/api/rooms/:id/messages", async (req, res) => {
  const messages = await Message.find({ roomId: req.params.id });
  res.json(messages);
});

app.post("/api/messages", async (req, res) => {
  const msg = await Message.create(req.body);
  res.status(201).json(msg);
});

app.listen(3000, () => console.log("Chat server listening"));
