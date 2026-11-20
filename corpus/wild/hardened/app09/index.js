import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import OpenAI from 'openai';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shortener';
const JWT_SECRET = process.env.JWT_SECRET || 'jwt_shortener_secret_123';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.API_KEY_1;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY || 'dummy_key' });

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Shortener DB connected'))
  .catch(err => console.error(err));

const urlSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  originalUrl: { type: String, required: true },
  shortCode: { type: String, required: true, unique: true },
  clicks: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const Url = mongoose.model('Url', urlSchema);

// Auth Middleware
const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Create Short URL
app.post('/api/shorten', requireAuth, async (req, res) => {
  try {
    const originalUrl = String(req.body.url || '').trim();
    if (!originalUrl || !originalUrl.startsWith('http')) {
      return res.status(400).json({ error: 'Valid URL starting with http/https is required' });
    }

    let shortCode = req.body.customCode ? String(req.body.customCode).trim() : '';

    if (!shortCode && OPENAI_API_KEY) {
      try {
        const aiPrompt = `Suggest a 6-character clean slug for: ${originalUrl}`;
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: aiPrompt }],
          max_tokens: 10
        });
        shortCode = completion.choices[0]?.message?.content?.trim().slice(0, 8);
      } catch {
        shortCode = Math.random().toString(36).substring(2, 8);
      }
    } else if (!shortCode) {
      shortCode = Math.random().toString(36).substring(2, 8);
    }

    const newUrl = new Url({
      userId: req.user.userId,
      originalUrl,
      shortCode
    });
    await newUrl.save();
    res.status(201).json(newUrl);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create short link' });
  }
});

// Analytics endpoint (ownership enforced)
app.get('/api/analytics/:shortCode', requireAuth, async (req, res) => {
  try {
    const shortCode = String(req.params.shortCode);
    const link = await Url.findOne({ shortCode, userId: req.user.userId });
    if (!link) {
      return res.status(404).json({ error: 'Link not found or unauthorized' });
    }
    res.json({ shortCode: link.shortCode, originalUrl: link.originalUrl, clicks: link.clicks });
  } catch (err) {
    res.status(500).json({ error: 'Error loading analytics' });
  }
});

// Redirect route
app.get('/:shortCode', async (req, res) => {
  try {
    const shortCode = String(req.params.shortCode);
    const link = await Url.findOneAndUpdate({ shortCode }, { $inc: { clicks: 1 } });
    if (!link) return res.status(404).send('Link not found');
    res.redirect(link.originalUrl);
  } catch {
    res.status(500).send('Server error');
  }
});

app.listen(PORT, () => console.log(`Shortener running on ${PORT}`));

export default app;
