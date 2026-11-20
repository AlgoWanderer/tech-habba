import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/blog-db';
const JWT_SECRET = process.env.JWT_SECRET || 'secret_jwt_key_replace_in_env';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Blog DB'))
  .catch(err => console.error('MongoDB error:', err));

const commentSchema = new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, required: true },
  authorName: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const postSchema = new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  comments: [commentSchema],
  createdAt: { type: Date, default: Date.now }
});

const Post = mongoose.model('Post', postSchema);

// Auth middleware
const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication token required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid authentication token' });
  }
};

// Public read routes
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await Post.find().limit(50);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.get('/api/posts/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Error finding post' });
  }
});

// Protected routes
app.post('/api/posts', requireAuth, async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const content = String(req.body.content || '').trim();
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const post = new Post({
      authorId: req.user.userId,
      title,
      content
    });
    await post.save();
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: 'Error saving post' });
  }
});

app.put('/api/posts/:id', requireAuth, async (req, res) => {
  try {
    const postId = req.params.id;
    // Ownership check
    const post = await Post.findOne({ _id: postId, authorId: req.user.userId });
    if (!post) {
      return res.status(404).json({ error: 'Post not found or unauthorized' });
    }

    if (req.body.title) post.title = String(req.body.title).trim();
    if (req.body.content) post.content = String(req.body.content).trim();
    await post.save();
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Error updating post' });
  }
});

app.delete('/api/posts/:id', requireAuth, async (req, res) => {
  try {
    const postId = req.params.id;
    // Ownership check to prevent IDOR
    const result = await Post.findOneAndDelete({ _id: postId, authorId: req.user.userId });
    if (!result) {
      return res.status(404).json({ error: 'Post not found or unauthorized' });
    }
    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting post' });
  }
});

// Comments
app.post('/api/posts/:id/comments', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const content = String(req.body.content || '').trim();
    if (!content) return res.status(400).json({ error: 'Comment content required' });

    post.comments.push({
      authorId: req.user.userId,
      authorName: req.user.username || 'Anonymous',
      content
    });
    await post.save();
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

app.listen(PORT, () => console.log(`Blog server running on port ${PORT}`));

export default app;
