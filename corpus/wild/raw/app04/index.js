import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const MONGO_URI = "mongodb+srv://admin:Passw0rd123@cluster0.ab12c.mongodb.net/app";
mongoose.connect(MONGO_URI);

const Customer = mongoose.model("Customer", new mongoose.Schema({
  name: String,
  email: String,
  phone: String
}));

// Unprotected customer list
app.get("/api/customers", async (req, res) => {
  const customers = await Customer.find();
  res.json(customers);
});

// IDOR customer endpoints
app.get("/api/customers/:id", async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  res.json(customer);
});

app.post("/api/customers", async (req, res) => {
  const customer = await Customer.create(req.body);
  res.status(201).json(customer);
});

app.put("/api/customers/:id", async (req, res) => {
  const updated = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

app.delete("/api/customers/:id", async (req, res) => {
  await Customer.findByIdAndDelete(req.params.id);
  res.json({ deleted: true });
});

app.listen(3000, () => console.log("Customer API ready"));
