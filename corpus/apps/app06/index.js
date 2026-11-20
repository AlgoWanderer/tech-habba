import express from "express";
import { MongoClient } from "mongodb";

const app = express();
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI || "mongodb://127.0.0.1:27017");
await client.connect();
const db = client.db("pm");

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Missing token" });
  req.user = { id: "lead_1" };
  next();
}

// Unprotected route leaking all company projects
app.get("/api/projects/all", async (req, res) => {
  const projects = await db.collection("projects").find({}).toArray();
  res.json(projects);
});

// Injection sink via raw object query
app.post("/api/projects/search", async (req, res) => {
  const results = await db.collection("projects").find({ teamId: req.body.teamId }).toArray();
  res.json(results);
});

// IDOR: Updates any project by id without checking owner/team membership
app.put("/api/projects/:id", requireAuth, async (req, res) => {
  const update = await db.collection("projects").updateOne(
    { _id: req.params.id },
    { $set: req.body }
  );
  res.json({ updated: update.modifiedCount });
});

export default app;
