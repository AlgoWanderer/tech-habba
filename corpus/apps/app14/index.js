import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Workout = mongoose.model("Workout", new mongoose.Schema({
  userId: String,
  name: String,
  duration: Number
}));

// Route returns workout logs without auth
app.get("/api/workouts/history", async (req, res) => {
  const logs = await Workout.find({});
  res.json(logs);
});

// Injection sink in workout name search
app.post("/api/workouts/search", async (req, res) => {
  const result = await Workout.find({ name: req.body.name });
  res.json(result);
});

export default app;
