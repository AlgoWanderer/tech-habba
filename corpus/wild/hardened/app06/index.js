import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_db';
const JWT_SECRET = process.env.JWT_SECRET || 'school_jwt_secret_token_123';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to School DB'))
  .catch(err => console.error(err));

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  gradeLevel: Number
});
const Student = mongoose.model('Student', studentSchema);

const gradeSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  subject: { type: String, required: true },
  score: { type: Number, required: true },
  assignedBy: { type: String, required: true }
});
const Grade = mongoose.model('Grade', gradeSchema);

// Auth & Role-based Access Control
const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Auth token missing' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const requireTeacherOrAdmin = (req, res, next) => {
  if (req.user?.role !== 'teacher' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Teacher or Admin access required' });
  }
  next();
};

// Admin protected route to list all students
app.get('/api/admin/students', requireAuth, requireAdmin, async (req, res) => {
  try {
    const students = await Student.find().limit(200);
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve students' });
  }
});

// Grades: lookup by student ID with ownership check
app.get('/api/students/:id/grades', requireAuth, async (req, res) => {
  try {
    // Student can only see their own grades; teacher/admin can see any
    if (req.user.role === 'student' && req.user.studentId !== req.params.id) {
      return res.status(403).json({ error: 'Unauthorized to view other students grades' });
    }

    const grades = await Grade.find({ studentId: req.params.id });
    res.json(grades);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve grades' });
  }
});

// Record Grade
app.post('/api/grades', requireAuth, requireTeacherOrAdmin, async (req, res) => {
  try {
    const subject = String(req.body.subject || '').trim();
    const score = Number(req.body.score);
    const studentId = req.body.studentId;

    if (!subject || isNaN(score) || !studentId) {
      return res.status(400).json({ error: 'Valid studentId, subject, and score required' });
    }

    const grade = new Grade({
      studentId,
      subject,
      score,
      assignedBy: req.user.userId
    });
    await grade.save();
    res.status(201).json(grade);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save grade' });
  }
});

app.listen(PORT, () => console.log(`School API running on ${PORT}`));

export default app;
