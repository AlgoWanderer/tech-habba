import express from 'express';
import mongoose from 'mongoose';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_1;
const API_TOKEN = process.env.API_KEY || 'auth_token_for_api';

mongoose.connect(MONGODB_URI || 'mongodb://localhost:27017/customers')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: String,
  createdAt: { type: Date, default: Date.now }
});
const Customer = mongoose.model('Customer', customerSchema);

// Admin / staff token auth middleware
const authenticate = (req, res, next) => {
  const token = req.headers['x-api-key'] || req.headers.authorization?.split(' ')[1];
  if (!token || token !== API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized request' });
  }
  next();
};

app.use(authenticate);

// CRUD endpoints for customers
app.get('/api/customers', async (req, res) => {
  try {
    const customers = await Customer.find().limit(100);
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

app.get('/api/customers/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching customer' });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = req.body.phone ? String(req.body.phone).trim() : '';

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and valid email are required' });
    }

    const customer = new Customer({ name, email, phone });
    await customer.save();
    res.status(201).json(customer);
  } catch (err) {
    res.status(500).json({ error: 'Error creating customer' });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    if (req.body.name) customer.name = String(req.body.name).trim();
    if (req.body.email) customer.email = String(req.body.email).trim().toLowerCase();
    if (req.body.phone !== undefined) customer.phone = String(req.body.phone).trim();

    await customer.save();
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: 'Error updating customer' });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    const result = await Customer.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Customer not found' });
    res.json({ message: 'Customer removed' });
  } catch (err) {
    res.status(500).json({ error: 'Error removing customer' });
  }
});

app.listen(PORT, () => console.log(`Customer API running on ${PORT}`));

export default app;
