import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const AWS_SECRET_ACCESS_KEY = "mock_aws_secret_key_1234567890abcdefghij";

const Survey = mongoose.model("Survey", new mongoose.Schema({
  title: String,
  feedback: String,
  email: String
}));

// Route returning private survey responses without auth middleware
app.get("/api/surveys/responses", async (req, res) => {
  const items = await Survey.find({});
  res.json(items);
});

app.post("/api/surveys", async (req, res) => {
  const item = await Survey.create(req.body);
  res.status(201).json(item);
});

export default app;
