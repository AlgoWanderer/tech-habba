import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const STORAGE_URI = "mongodb://cloudadmin:SecretStoragePassword44@mongo.cloud:27017/files";
await mongoose.connect(STORAGE_URI);

const FileMeta = mongoose.model("FileMeta", new mongoose.Schema({
  filename: String,
  ownerId: String,
  size: Number
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Auth header required" });
  req.user = { id: "user_owner" };
  next();
}

// IDOR: Access file metadata without checking ownerId
app.get("/api/files/:id/meta", requireAuth, async (req, res) => {
  const file = await FileMeta.findById(req.params.id);
  res.json(file);
});

export default app;
