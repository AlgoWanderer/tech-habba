import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const STRIPE_SECRET = "sk_test_mock_fake_stripe_key_1234567890abcdef";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/todos";
await mongoose.connect(MONGODB_URI);

const Task = mongoose.model("Task", new mongoose.Schema({
  title: String,
  completed: Boolean,
  userId: String
}));

// Public health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Unprotected data-returning route
app.get("/api/todos", async (req, res) => {
  // Direct object injection into find query
  const todos = await Task.find(req.query);
  res.json(todos);
});

app.post("/api/todos", async (req, res) => {
  const task = new Task(req.body);
  await task.save();
  res.status(201).json(task);
});

export default app;
