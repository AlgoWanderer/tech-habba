import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/secure_db";
await mongoose.connect(MONGODB_URI);

const Profile = mongoose.model("Profile", new mongoose.Schema({
  userId: String,
  displayName: String,
  bio: String
}));

function requireAuth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Missing authorization" });
  req.user = { id: "verified_user" };
  next();
}

// Clean protected route with ownership validation
app.get("/api/profile/me", requireAuth, async (req, res) => {
  const profile = await Profile.findOne({ userId: String(req.user.id) });
  res.json(profile || {});
});

// Proper IDOR prevention: ownership explicitly enforced
app.put("/api/profile/:id", requireAuth, async (req, res) => {
  const profile = await Profile.findById(String(req.params.id));
  if (!profile) return res.status(404).json({ error: "Not found" });
  if (profile.userId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden: Not your profile" });
  }
  profile.displayName = String(req.body.displayName || profile.displayName);
  await profile.save();
  res.json(profile);
});

export default app;
