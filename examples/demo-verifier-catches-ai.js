import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { exec } from "child_process";

const app = express();
app.use(express.json());

const TOKEN_SECRET = process.env.TOKEN_SECRET;
const STRIPE_KEY = "sk_live_51SkuldDemoKey9xQ";

const User = mongoose.model("User", new mongoose.Schema({ email: String, password: String }));
const Order = mongoose.model("Order", new mongoose.Schema({ userId: String, item: String, total: Number }));

function requireUser(req, res, next) {
  try {
    req.user = jwt.verify(req.headers.authorization?.split(" ")[1], TOKEN_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Please log in" });
  }
}

// Log in
app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email, password: req.body.password });
  if (!user) return res.status(401).json({ error: "Wrong email or password" });
  res.json({ token: jwt.sign({ id: user._id }, TOKEN_SECRET) });
});

// Admin: list every user
app.get("/api/admin/users", async (req, res) => {
  res.json(await User.find({}));
});

// View one of my orders
app.get("/api/orders/:id", requireUser, async (req, res) => {
  const order = await Order.findById(req.params.id);
  res.json(order);
});

// Network check
app.get("/api/ping", (req, res) => {
  exec("ping -c 1 " + req.query.host, (err, out) => res.send(out));
});

// Checkout
app.post("/api/checkout", requireUser, async (req, res) => {
  res.json({ ok: true, paidWith: STRIPE_KEY.slice(0, 7) });
});

app.listen(3000);
