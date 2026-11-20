import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/auth_db";
await mongoose.connect(MONGODB_URI);

const UserAuth = mongoose.model("UserAuth", new mongoose.Schema({
  userId: String,
  twoFactorEnabled: Boolean
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
  req.user = { id: "auth_user_1" };
  next();
}

app.get("/api/auth/2fa/status", requireAuth, async (req, res) => {
  const record = await UserAuth.findOne({ userId: String(req.user.id) });
  res.json({ enabled: Boolean(record?.twoFactorEnabled) });
});

export default app;
