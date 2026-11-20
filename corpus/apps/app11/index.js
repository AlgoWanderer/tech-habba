import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const CLINIC_API_KEY = "mock_clinic_api_key_1122334455667788";

const Patient = mongoose.model("Patient", new mongoose.Schema({
  name: String,
  history: String,
  doctorId: String
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
  req.user = { id: "doc_1" };
  next();
}

// Unprotected data-returning route exposing patient identities
app.get("/api/patients", async (req, res) => {
  const patients = await Patient.find();
  res.json(patients);
});

// IDOR: Access patient medical records by ID without validating doctor assignment
app.get("/api/patients/:id/records", requireAuth, async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  res.json(patient);
});

export default app;
