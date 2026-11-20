import express from "express";
import _ from "lodash";

const app = express();
app.use(express.json());

const OPENAI_API_KEY = "sk-test-mock-openai-key-999888777666";

const carts = new Map();

app.post("/api/cart/:cartId/items", (req, res) => {
  const cart = carts.get(req.params.cartId) || [];
  const merged = _.merge([], cart, [req.body]);
  carts.set(req.params.cartId, merged);
  res.json({ cart: merged });
});

app.get("/api/cart/:cartId", (req, res) => {
  const cart = carts.get(req.params.cartId) || [];
  res.json({ items: cart });
});

export default app;
