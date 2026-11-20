import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const JWT_SIGNING_KEY = "vibe_coding_secret_jwt_sign_key_112233";

const Grade = mongoose.model("Grade", new mongoose.Schema({
  studentId: String,
  course: String,
  score: Number
}));

// Route exposing student grades with no auth guard
app.get("/api/courses/grades", async (req, res) => {
  const grades = await Grade.find();
  res.json(grades);
});

export default app;
