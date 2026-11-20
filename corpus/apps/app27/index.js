import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/orders";
await mongoose.connect(MONGODB_URI);

const Order = mongoose.model("Order", new mongoose.Schema({
  trackingNumber: String,
  status: String,
  customerId: String
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
  req.user = { id: "user_customer" };
  next();
}

// Sanitized parameter lookup with auth
app.get("/api/orders/track", requireAuth, async (req, res) => {
  const trackingNumber = String(req.query.tracking || "");
  const order = await Order.findOne({
    trackingNumber: trackingNumber,
    customerId: String(req.user.id)
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

export default app;
