import express from 'express';
import mongoose from 'mongoose';
import session from 'express-session';
import MongoStore from 'connect-mongo';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jobboard';
const SESSION_SECRET = process.env.SESSION_SECRET || 'session_secret_key_change_me';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Job board DB connected'))
  .catch(err => console.error(err));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGODB_URI }),
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }
}));

const jobSchema = new mongoose.Schema({
  companyId: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  location: String,
  createdAt: { type: Date, default: Date.now }
});
const Job = mongoose.model('Job', jobSchema);

// Auth Middleware
const requireAuth = (req, res, next) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

const requireCompany = (req, res, next) => {
  if (req.session.user?.role !== 'company' && req.session.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Company account required' });
  }
  next();
};

// Public Job Listings
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await Job.find().limit(50);
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Company Post Job
app.post('/api/jobs', requireAuth, requireCompany, async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    if (!title || !description) return res.status(400).json({ error: 'Title and description required' });

    const job = new Job({
      companyId: req.session.user.id,
      title,
      description,
      location: String(req.body.location || 'Remote')
    });
    await job.save();
    res.status(201).json(job);
  } catch (err) {
    res.status(500).json({ error: 'Failed to post job' });
  }
});

// Delete Job (company owner or admin)
app.delete('/api/jobs/:id', requireAuth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Ownership or admin check to prevent IDOR
    if (job.companyId !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: not your job post' });
    }

    await Job.findByIdAndDelete(req.params.id);
    res.json({ message: 'Job deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

app.listen(PORT, () => console.log(`Job board on port ${PORT}`));

export default app;
