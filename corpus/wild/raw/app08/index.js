import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const SESSION_SECRET = "jobboard_secret_session_key";
mongoose.connect("mongodb://localhost:27017/jobs");

const Job = mongoose.model("Job", new mongoose.Schema({
  title: String,
  company: String,
  description: String
}));

const Application = mongoose.model("Application", new mongoose.Schema({
  jobId: String,
  applicantName: String,
  resume: String
}));

app.get("/api/jobs", async (req, res) => {
  const jobs = await Job.find();
  res.json(jobs);
});

app.post("/api/jobs", async (req, res) => {
  const job = await Job.create(req.body);
  res.status(201).json(job);
});

// IDOR: delete job without checking employer company ownership
app.delete("/api/jobs/:id", async (req, res) => {
  await Job.findByIdAndDelete(req.params.id);
  res.json({ message: "Job deleted" });
});

// Unprotected data route leaking applicant resumes
app.get("/api/applications", async (req, res) => {
  const apps = await Application.find();
  res.json(apps);
});

app.listen(3000, () => console.log("Job board server running"));
