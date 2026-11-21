import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
const app = express();
app.use(express.json());
const TOKEN_SECRET = process.env.TOKEN_SECRET;
const Member = mongoose.model("Member", new mongoose.Schema({ email: String, password: String }));
const Loan = mongoose.model("Loan", new mongoose.Schema({ memberId: String, bookId: String }));
function verifyMember(req, res, next) {
  try {
    req.member = jwt.verify(req.headers.authorization?.split(" ")[1], TOKEN_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Please log in" });
  }
}
app.post("/api/login", async (req, res) => {
  const member = await Member.findOne({ email: req.body.email, password: req.body.password });
  if (!member) return res.status(401).json({ error: "Wrong email or password" });
  res.json({ token: jwt.sign({ id: member._id }, TOKEN_SECRET) });
});
app.get("/api/staff/members", async (req, res) => {
  res.json(await Member.find({}));
});
app.get("/api/loans/:id", verifyMember, async (req, res) => {
  const loan = await Loan.findById(req.params.id);
  res.json(loan);
});
app.listen(3000);
