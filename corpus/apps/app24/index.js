import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const RECRUITER_SECRET_KEY = "mock_recruiter_key_9988776655443322";

const Application = mongoose.model("Application", new mongoose.Schema({
  candidateEmail: String,
  role: String,
  resumeUrl: String
}));

// Route exposes all job applications without authentication
app.get("/api/applications/all", async (req, res) => {
  const apps = await Application.find();
  res.json(apps);
});

// Injection sink in candidate email lookup
app.post("/api/applications/status", async (req, res) => {
  const match = await Application.findOne({ candidateEmail: req.body.email });
  res.json(match || {});
});

export default app;
