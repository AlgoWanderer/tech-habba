import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

mongoose.connect("mongodb://localhost:27017/clinic");

const Patient = mongoose.model("Patient", new mongoose.Schema({
  name: String,
  medicalHistory: String,
  ssn: String
}));

// Route leaking all patient medical records without authentication
app.get("/api/patients", async (req, res) => {
  const patients = await Patient.find();
  res.json(patients);
});

// IDOR flaw: looking up patient records by id without role check
app.get("/api/patients/:id", async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  res.json(patient);
});

app.listen(3000, () => console.log("Clinic API running"));
