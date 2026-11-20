import express from "express";

const app = express();
app.use(express.json());

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

app.post("/api/webhook", (req, res) => {
  const signature = req.headers["x-webhook-signature"];
  if (!signature || signature !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  const event = String(req.body.event || "");
  res.json({ received: true, event });
});

export default app;
