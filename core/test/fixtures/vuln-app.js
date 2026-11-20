const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = express();
const STRIPE_KEY = "sk_live_EXAMPLEEXAMPLEEXAMPLE";
mongoose.connect("mongodb://admin:hunter2@localhost:27017/app");
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret123';

app.post('/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email, password: req.body.password });
  res.json({ token: jwt.sign({ id: user.id }, 'superSecretKey!') });
});

app.get('/api/users', async (req, res) => {
  res.json(await User.find());
});

app.get('/api/orders/:id', async (req, res) => {
  res.json(await Order.findById(req.params.id));
});

app.get('/api/search', (req, res) => {
  db.query(`SELECT * FROM items WHERE name = '${req.query.q}'`, (e, rows) => res.json(rows));
});

app.delete('/api/posts/:id', async (req, res) => {
  const { title } = req.body;
  await Post.deleteOne({ title });
  res.sendStatus(204);
});

module.exports = { app, STRIPE_KEY, JWT_SECRET };
