import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const MONGO_URL = "mongodb://chefuser:KitchenSecret77@mongodb.local:27017/recipes";
await mongoose.connect(MONGO_URL);

const Recipe = mongoose.model("Recipe", new mongoose.Schema({
  title: String,
  ingredients: [String],
  creatorId: String
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Auth required" });
  req.user = { id: "user_chef" };
  next();
}

app.get("/api/recipes", async (req, res) => {
  const list = await Recipe.find();
  res.json(list);
});

// IDOR: Delete recipe without checking creatorId
app.delete("/api/recipes/:id", requireAuth, async (req, res) => {
  const deleted = await Recipe.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Recipe not found" });
  res.json({ message: "Recipe removed" });
});

export default app;
