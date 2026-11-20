import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

mongoose.connect("mongodb://localhost:27017/school_db");

const Student = mongoose.model("Student", new mongoose.Schema({
  name: String,
  grade: String
}));

const Grade = mongoose.model("Grade", new mongoose.Schema({
  studentId: String,
  subject: String,
  score: Number
}));

// Sensitive admin route without authentication
app.get("/api/admin/students", async (req, res) => {
  const students = await Student.find();
  res.json(students);
});

// IDOR on grades
app.get("/api/grades/:id", async (req, res) => {
  const grade = await Grade.findById(req.params.id);
  res.json(grade);
});

app.post("/api/grades", async (req, res) => {
  const grade = await Grade.create(req.body);
  res.status(201).json(grade);
});

app.listen(3000, () => console.log("School server running"));
