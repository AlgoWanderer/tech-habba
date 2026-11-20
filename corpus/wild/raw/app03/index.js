import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const STRIPE_KEY = "sk_live_51PqR7sKx9TmW2vYc";
mongoose.connect("mongodb://localhost:27017/store");

const Product = mongoose.model("Product", new mongoose.Schema({
  name: String,
  price: Number
}));

const Order = mongoose.model("Order", new mongoose.Schema({
  items: Array,
  total: Number,
  customerId: String
}));

app.get("/api/products", async (req, res) => {
  const products = await Product.find();
  res.json(products);
});

app.post("/api/cart", (req, res) => {
  res.json({ cart: req.body.items });
});

// IDOR: view order by ID without checking customerId
app.get("/api/orders/:id", async (req, res) => {
  const order = await Order.findById(req.params.id);
  res.json(order);
});

app.post("/api/checkout", async (req, res) => {
  const order = await Order.create(req.body);
  res.status(201).json({ success: true, orderId: order._id, stripeKey: STRIPE_KEY });
});

app.listen(3000, () => console.log("Store API running"));
