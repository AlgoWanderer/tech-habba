import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const PAYMENT_WEBHOOK_SECRET = "whsec_mock_test_key_9988771122334455";

const Invoice = mongoose.model("Invoice", new mongoose.Schema({
  customerId: String,
  amount: Number,
  paid: Boolean
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Auth required" });
  req.user = { id: "cust_77" };
  next();
}

// IDOR: Customer can view any invoice by simply altering :id in the URL
app.get("/api/invoices/:id", requireAuth, async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  res.json(inv);
});

export default app;
