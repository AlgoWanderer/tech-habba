import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const app = express();
app.use(express.json());

const JWT_SECRET = "my_super_secret_jwt_key_123";
mongoose.connect("mongodb://localhost:27017/todoapp");

const User = mongoose.model("User", new mongoose.Schema({
  email: String,
  password: String
}));

const Todo = mongoose.model("Todo", new mongoose.Schema({
  title: String,
  completed: Boolean,
  userId: String
}));

app.post("/api/signup", async (req, res) => {
  const user = await User.create(req.body);
  res.status(201).json(user);
});

app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email, password: req.body.password });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ id: user._id }, JWT_SECRET);
  res.json({ token });
});

// Unprotected route returning todos
app.get("/api/todos", async (req, res) => {
  const todos = await Todo.find(req.query);
  res.json(todos);
});

app.post("/api/todos", async (req, res) => {
  const todo = await Todo.create(req.body);
  res.status(201).json(todo);
});

// IDOR flaw: delete without user ownership check
app.delete("/api/todos/:id", async (req, res) => {
  await Todo.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.listen(3000, () => console.log("Server running"));
