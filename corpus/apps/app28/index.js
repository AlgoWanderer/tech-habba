import express from "express";

const app = express();
app.use(express.json());

const articles = [
  { slug: "getting-started", title: "Getting Started", content: "Welcome to our platform docs." },
  { slug: "api-reference", title: "API Reference", content: "Detailed endpoints documentation." }
];

// Clean public informational endpoints
app.get("/api/docs", (req, res) => {
  res.json(articles.map(a => ({ slug: a.slug, title: a.title })));
});

app.get("/api/docs/:slug", (req, res) => {
  const slug = String(req.params.slug);
  const found = articles.find(a => a.slug === slug);
  if (!found) return res.status(404).json({ error: "Article not found" });
  res.json(found);
});

export default app;
