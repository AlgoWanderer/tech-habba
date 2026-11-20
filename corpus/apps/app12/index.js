import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Listing = mongoose.model("Listing", new mongoose.Schema({
  address: String,
  price: Number,
  type: String
}));

// Injection sink via query params
app.get("/api/listings/filter", async (req, res) => {
  const results = await Listing.find({ type: req.query.type });
  res.json(results);
});

app.post("/api/listings", async (req, res) => {
  const item = await Listing.create(req.body);
  res.status(201).json(item);
});

export default app;
