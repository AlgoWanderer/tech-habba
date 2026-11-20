import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const OPENWEATHER_API_KEY = "mock_openweather_key_9900112233445566";

const Weather = mongoose.model("Weather", new mongoose.Schema({
  city: String,
  temp: Number
}));

// Injection sink via query params
app.get("/api/weather", async (req, res) => {
  const data = await Weather.find({ city: req.query.city });
  res.json(data);
});

export default app;
