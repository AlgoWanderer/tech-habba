import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const MONGO_URI = "mongodb://hrmanager:SuperSecretHR2026@internal.mongo:27017/hr";
await mongoose.connect(MONGO_URI);

const Employee = mongoose.model("Employee", new mongoose.Schema({
  name: String,
  salary: Number,
  department: String
}));

// Unprotected route exposing internal salary records
app.get("/api/employees/salaries", async (req, res) => {
  const list = await Employee.find({}, "name salary department");
  res.json(list);
});

export default app;
