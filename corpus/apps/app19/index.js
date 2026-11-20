import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const MAPBOX_ACCESS_TOKEN = "pk_mock_mapbox_token_998877665544332211";

const Vehicle = mongoose.model("Vehicle", new mongoose.Schema({
  vin: String,
  lat: Number,
  lng: Number
}));

// Route returning real-time vehicle GPS coordinates without auth
app.get("/api/fleet/locations", async (req, res) => {
  const vehicles = await Vehicle.find();
  res.json(vehicles);
});

export default app;
