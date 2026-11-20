import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/clinic';
const JWT_SECRET = process.env.JWT_SECRET || 'clinic_jwt_secret_token_123';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Clinic DB connected'))
  .catch(err => console.error(err));

const patientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  medicalHistory: [String],
  assignedDoctorId: String
});
const Patient = mongoose.model('Patient', patientSchema);

const appointmentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctorId: { type: String, required: true },
  date: { type: Date, required: true },
  notes: String
});
const Appointment = mongoose.model('Appointment', appointmentSchema);

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

const requireDoctor = (req, res, next) => {
  if (req.user?.role !== 'doctor' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Doctor authorization required' });
  }
  next();
};

app.use('/api', requireAuth);

// Doctors looking up patient by ID (role-based access controlled)
app.get('/api/patients/:id', requireDoctor, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json(patient);
  } catch (err) {
    res.status(500).json({ error: 'Error finding patient' });
  }
});

// Appointments endpoint (ownership enforced)
app.get('/api/appointments', async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'patient') {
      query.patientId = req.user.patientId;
    } else if (req.user.role === 'doctor') {
      query.doctorId = req.user.doctorId;
    }

    const appointments = await Appointment.find(query);
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

app.listen(PORT, () => console.log(`Clinic server running on ${PORT}`));

export default app;
