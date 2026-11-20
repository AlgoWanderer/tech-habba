import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/notes_app';
const JWT_SECRET = process.env.JWT_SECRET || 'jwt_notes_private_secret_key';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to Notes MongoDB'))
  .catch(err => console.error(err));

const noteSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Note = mongoose.model('Note', noteSchema);

// JWT Middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid authentication token' });
  }
};

app.use('/api/notes', authMiddleware);

// Get user's notes only
app.get('/api/notes', async (req, res) => {
  try {
    const notes = await Note.find({ userId: String(req.user.userId) });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve notes' });
  }
});

// Get single note by ID with ownership check (IDOR protected)
app.get('/api/notes/:id', async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, userId: String(req.user.userId) });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve note' });
  }
});

// Create private note
app.post('/api/notes', async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const content = String(req.body.content || '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const note = new Note({
      userId: req.user.userId,
      title,
      content
    });
    await note.save();
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// Update note (ownership enforced)
app.put('/api/notes/:id', async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, userId: String(req.user.userId) });
    if (!note) return res.status(404).json({ error: 'Note not found or unauthorized' });

    if (req.body.title) note.title = String(req.body.title).trim();
    if (req.body.content) note.content = String(req.body.content).trim();
    await note.save();
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// Delete note (ownership enforced)
app.delete('/api/notes/:id', async (req, res) => {
  try {
    const result = await Note.findOneAndDelete({ _id: req.params.id, userId: String(req.user.userId) });
    if (!result) return res.status(404).json({ error: 'Note not found or unauthorized' });
    res.json({ message: 'Note deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

app.listen(PORT, () => console.log(`Notes API running on port ${PORT}`));

export default app;
