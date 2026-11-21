import { describe, expect, it } from 'vitest';
import { scan } from '../index.js';

// Regression from live testing: the auth middleware sets req.guest; a correct ownership fix using
// req.guest kept being re-flagged on every fresh scan (risk went UP after "Apply to editor").
const app = (lookup) => [
  'import express from "express";',
  'import mongoose from "mongoose";',
  'import jwt from "jsonwebtoken";',
  'const app = express();',
  'const Booking = mongoose.model("Booking", new mongoose.Schema({ ownerId: String }));',
  'function authGuest(req, res, next) {',
  '  try {',
  '    req.guest = jwt.verify(req.headers.authorization, process.env.JWT_KEY);',
  '    next();',
  '  } catch {',
  '    res.status(401).json({ error: "Login required" });',
  '  }',
  '}',
  'app.get("/api/bookings/:id", authGuest, async (req, res) => {',
  `  const booking = await ${lookup};`,
  '  res.json(booking);',
  '});',
].join('\n');

describe('IDOR with a custom auth identity', () => {
  it('flags the lookup without an ownership check', () => {
    const f = scan([{ path: 'index.js', content: app('Booking.findById(req.params.id)') }]).filter((x) => x.ruleId === 'idor-suspect');
    expect(f).toHaveLength(1);
    expect(f[0].fixPreview).toContain('ownerId: req.guest.id');
  });
  it('accepts an ownership check on the identity the middleware sets (req.guest)', () => {
    const f = scan([{ path: 'index.js', content: app('Booking.findOne({ _id: req.params.id, ownerId: req.guest.id })') }]).filter((x) => x.ruleId === 'idor-suspect');
    expect(f).toHaveLength(0);
  });
});
