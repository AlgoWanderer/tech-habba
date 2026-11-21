import express from "express";
import { exec } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
const app = express();
app.use(express.json());
app.post("/api/convert", (req, res) => {
  exec("convert uploads/" + req.body.file + " -resize 50% out/" + req.body.file, (err) => {
    if (err) return res.status(500).json({ error: "Conversion failed" });
    res.json({ ok: true });
  });
});
app.get("/api/download", async (req, res) => {
  const data = await readFile(path.join("out", req.query.name));
  res.send(data);
});
app.listen(3000);
