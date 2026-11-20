import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp';
const JWT_SECRET = process.env.JWT_SECRET || 'chat_secret_token_key_123';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Chat DB connected'))
  .catch(err => console.error(err));

const messageSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  senderId: { type: String, required: true },
  senderName: String,
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// Auth Middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Auth token missing' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid authentication' });
  }
};

app.use('/api', authenticate);

// Send message
app.post('/api/rooms/:roomId/messages', async (req, res) => {
  try {
    const roomId = String(req.params.roomId);
    const text = String(req.body.text || '').trim();

    if (!text) return res.status(400).json({ error: 'Message text required' });

    const message = new Message({
      roomId,
      senderId: req.user.userId,
      senderName: req.user.username || 'User',
      text
    });
    await message.save();
    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: 'Failed to post message' });
  }
});

// List room messages
app.get('/api/rooms/:roomId/messages', async (req, res) => {
  try {
    const roomId = String(req.params.roomId);
    const messages = await Message.find({ roomId }).sort({ timestamp: -1 }).limit(50);
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Search messages endpoint - explicitly casting to String to prevent NoSQL operator injection
app.get('/api/messages/search', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) return res.status(400).json({ error: 'Search query required' });

    // Parameterized regex search with escaped input
    const safeQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const results = await Message.find({
      text: { $regex: safeQuery, $options: 'i' }
    }).limit(30);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

app.listen(PORT, () => console.log(`Chat server on port ${PORT}`));

export default app;
