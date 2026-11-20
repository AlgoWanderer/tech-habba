import express from 'express';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shop';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || process.env.API_KEY_1;
const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_token_123';

const stripe = new Stripe(STRIPE_SECRET_KEY || '');

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to Store DB'))
  .catch(err => console.error(err));

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  inventory: { type: Number, default: 0 }
});
const Product = mongoose.model('Product', productSchema);

const orderSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  items: [{ productId: String, quantity: Number, price: Number }],
  totalAmount: Number,
  status: { type: String, default: 'pending' },
  stripePaymentIntentId: String,
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Auth required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid auth token' });
  }
};

// Public Products
app.get('/api/products', async (req, res) => {
  const products = await Product.find().limit(100);
  res.json(products);
});

// Protected Orders
app.post('/api/orders/checkout', authenticate, async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

    let totalAmount = 0;
    const validatedItems = [];

    for (const item of items) {
      const prod = await Product.findById(item.productId);
      if (!prod) return res.status(404).json({ error: `Product ${item.productId} not found` });
      const qty = Math.max(1, parseInt(item.quantity) || 1);
      totalAmount += prod.price * qty;
      validatedItems.push({ productId: prod._id, quantity: qty, price: prod.price });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
      currency: 'usd',
      metadata: { userId: String(req.user.userId) }
    });

    const order = new Order({
      userId: req.user.userId,
      items: validatedItems,
      totalAmount,
      stripePaymentIntentId: paymentIntent.id
    });
    await order.save();

    res.status(201).json({ order, clientSecret: paymentIntent.client_secret });
  } catch (err) {
    res.status(500).json({ error: 'Checkout failed' });
  }
});

app.get('/api/orders/:id', authenticate, async (req, res) => {
  try {
    // Ownership check to prevent IDOR
    const order = await Order.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve order' });
  }
});

app.listen(PORT, () => console.log(`Store backend on port ${PORT}`));

export default app;
