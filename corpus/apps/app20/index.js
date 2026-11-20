import express from "express";
import mongoose from "mongoose";
import _ from "lodash";

const app = express();
app.use(express.json());

const Playlist = mongoose.model("Playlist", new mongoose.Schema({
  title: String,
  songs: [String]
}));

// Injection sink via body parameter in findOne
app.post("/api/playlists/search", async (req, res) => {
  const match = await Playlist.findOne({ title: req.body.title });
  res.json(match || {});
});

export default app;
