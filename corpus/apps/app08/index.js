import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Expense = mongoose.model("Expense", new mongoose.Schema({
  amount: Number,
  category: String,
  date: Date
}));

// NoSQL operator injection in query param
app.get("/api/expenses", async (req, res) => {
  const list = await Expense.find({ category: req.query.category });
  res.json(list);
});

app.post("/api/expenses", async (req, res) => {
  const created = await Expense.create(req.body);
  res.status(201).json(created);
});

export default app;
