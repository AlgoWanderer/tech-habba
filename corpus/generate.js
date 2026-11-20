import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = __dirname;
const appsDir = path.join(corpusDir, 'apps');

if (!fs.existsSync(appsDir)) {
  fs.mkdirSync(appsDir, { recursive: true });
}

// 30 realistic apps
const appDefs = [
  // --- BATCH 1: app01 - app10 ---
  {
    id: 'app01',
    name: 'Todo REST API',
    flaws: [
      { category: 'secret', pattern: 'sk_test_mock_fake_stripe_key_1234567890abcdef', severity: 'critical' },
      { category: 'injection', pattern: 'Task.find(req.query)', severity: 'high' },
      { category: 'auth', pattern: 'app.get("/api/todos"', severity: 'high' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const STRIPE_SECRET = "sk_test_mock_fake_stripe_key_1234567890abcdef";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/todos";
await mongoose.connect(MONGODB_URI);

const Task = mongoose.model("Task", new mongoose.Schema({
  title: String,
  completed: Boolean,
  userId: String
}));

// Public health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Unprotected data-returning route
app.get("/api/todos", async (req, res) => {
  // Direct object injection into find query
  const todos = await Task.find(req.query);
  res.json(todos);
});

app.post("/api/todos", async (req, res) => {
  const task = new Task(req.body);
  await task.save();
  res.status(201).json(task);
});

export default app;
`
  },
  {
    id: 'app02',
    name: 'User Notes Service',
    flaws: [
      { category: 'secret', pattern: 'mongodb://admin:hunter2Pass@cluster0.fake.net/notes', severity: 'critical' },
      { category: 'idor', pattern: 'app.get("/api/notes/:id"', severity: 'medium' },
      { category: 'dependency', file: 'package.json', pattern: '"jsonwebtoken": "8.5.1"', severity: 'high' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0', jsonwebtoken: '8.5.1' },
    code: `import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const app = express();
app.use(express.json());

const DB_URI = "mongodb://admin:hunter2Pass@cluster0.fake.net/notes";
await mongoose.connect(DB_URI);

const Note = mongoose.model("Note", new mongoose.Schema({
  title: String,
  content: String,
  userId: String
}));

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "fallback");
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// IDOR: Looks up note by id without checking owner userId === req.user.id
app.get("/api/notes/:id", requireAuth, async (req, res) => {
  const note = await Note.findById(req.params.id);
  if (!note) return res.status(404).json({ error: "Note not found" });
  res.json(note);
});

app.post("/api/notes", requireAuth, async (req, res) => {
  const note = await Note.create({ ...req.body, userId: req.user.id });
  res.status(201).json(note);
});

export default app;
`
  },
  {
    id: 'app03',
    name: 'Customer Authentication API',
    flaws: [
      { category: 'secret', pattern: 'const JWT_SECRET = "supersecret_vibe_jwt_token_key_99";', severity: 'critical' },
      { category: 'injection', pattern: 'User.findOne({ email: req.body.email, password: req.body.password })', severity: 'high' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const JWT_SECRET = "supersecret_vibe_jwt_token_key_99";

const User = mongoose.model("User", new mongoose.Schema({
  email: String,
  password: String,
  name: String
}));

// Login endpoint vulnerable to NoSQL injection (e.g. { "$gt": "" })
app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email, password: req.body.password });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ message: "Login successful", userId: user._id });
});

app.post("/api/register", async (req, res) => {
  const existing = await User.findOne({ email: req.body.email });
  if (existing) return res.status(400).json({ error: "User exists" });
  const user = await User.create(req.body);
  res.status(201).json(user);
});

export default app;
`
  },
  {
    id: 'app04',
    name: 'Blog Post Publishing Engine',
    flaws: [
      { category: 'auth', pattern: 'app.get("/api/posts/drafts"', severity: 'high' },
      { category: 'idor', pattern: 'app.delete("/api/posts/:id"', severity: 'medium' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Post = mongoose.model("Post", new mongoose.Schema({
  title: String,
  body: String,
  authorId: String,
  isDraft: Boolean
}));

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Unauthorized" });
  req.user = { id: "user123" };
  next();
}

// Unprotected route exposing internal drafts
app.get("/api/posts/drafts", async (req, res) => {
  const drafts = await Post.find({ isDraft: true });
  res.json(drafts);
});

// IDOR flaw: Deletes post by id without confirming authorId === req.user.id
app.delete("/api/posts/:id", requireAuth, async (req, res) => {
  const deleted = await Post.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.json({ message: "Deleted" });
});

export default app;
`
  },
  {
    id: 'app05',
    name: 'E-commerce Cart and Checkout',
    flaws: [
      { category: 'secret', pattern: 'const OPENAI_API_KEY = "sk-test-mock-openai-key-999888777666";', severity: 'critical' },
      { category: 'dependency', file: 'package.json', pattern: '"lodash": "4.17.15"', severity: 'high' }
    ],
    deps: { express: '^4.18.2', lodash: '4.17.15' },
    code: `import express from "express";
import _ from "lodash";

const app = express();
app.use(express.json());

const OPENAI_API_KEY = "sk-test-mock-openai-key-999888777666";

const carts = new Map();

app.post("/api/cart/:cartId/items", (req, res) => {
  const cart = carts.get(req.params.cartId) || [];
  const merged = _.merge([], cart, [req.body]);
  carts.set(req.params.cartId, merged);
  res.json({ cart: merged });
});

app.get("/api/cart/:cartId", (req, res) => {
  const cart = carts.get(req.params.cartId) || [];
  res.json({ items: cart });
});

export default app;
`
  },
  {
    id: 'app06',
    name: 'Team Project Management API',
    flaws: [
      { category: 'injection', pattern: 'db.collection("projects").find({ teamId: req.body.teamId })', severity: 'high' },
      { category: 'auth', pattern: 'app.get("/api/projects/all"', severity: 'high' },
      { category: 'idor', pattern: 'app.put("/api/projects/:id"', severity: 'medium' }
    ],
    deps: { express: '^4.18.2', mongodb: '^5.0.0' },
    code: `import express from "express";
import { MongoClient } from "mongodb";

const app = express();
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URI || "mongodb://127.0.0.1:27017");
await client.connect();
const db = client.db("pm");

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Missing token" });
  req.user = { id: "lead_1" };
  next();
}

// Unprotected route leaking all company projects
app.get("/api/projects/all", async (req, res) => {
  const projects = await db.collection("projects").find({}).toArray();
  res.json(projects);
});

// Injection sink via raw object query
app.post("/api/projects/search", async (req, res) => {
  const results = await db.collection("projects").find({ teamId: req.body.teamId }).toArray();
  res.json(results);
});

// IDOR: Updates any project by id without checking owner/team membership
app.put("/api/projects/:id", requireAuth, async (req, res) => {
  const update = await db.collection("projects").updateOne(
    { _id: req.params.id },
    { $set: req.body }
  );
  res.json({ updated: update.modifiedCount });
});

export default app;
`
  },
  {
    id: 'app07',
    name: 'Customer Feedback & Survey Collector',
    flaws: [
      { category: 'secret', pattern: 'const AWS_SECRET_ACCESS_KEY = "mock_aws_secret_key_1234567890abcdefghij";', severity: 'critical' },
      { category: 'auth', pattern: 'app.get("/api/surveys/responses"', severity: 'high' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const AWS_SECRET_ACCESS_KEY = "mock_aws_secret_key_1234567890abcdefghij";

const Survey = mongoose.model("Survey", new mongoose.Schema({
  title: String,
  feedback: String,
  email: String
}));

// Route returning private survey responses without auth middleware
app.get("/api/surveys/responses", async (req, res) => {
  const items = await Survey.find({});
  res.json(items);
});

app.post("/api/surveys", async (req, res) => {
  const item = await Survey.create(req.body);
  res.status(201).json(item);
});

export default app;
`
  },
  {
    id: 'app08',
    name: 'Expense Tracker Microservice',
    flaws: [
      { category: 'injection', pattern: 'Expense.find({ category: req.query.category })', severity: 'high' },
      { category: 'dependency', file: 'package.json', pattern: '"express": "4.16.0"', severity: 'high' }
    ],
    deps: { express: '4.16.0', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Expense = mongoose.model("Expense", new mongoose.Schema({
  amount: Number,
  category: String,
  date: Date
}));

// NoSQL operator injection in query param
app.get("/api/expenses", async (req, res) => {
  const list = await Expense.find({ category: req.query.category });
  res.json(list);
});

app.post("/api/expenses", async (req, res) => {
  const created = await Expense.create(req.body);
  res.status(201).json(created);
});

export default app;
`
  },
  {
    id: 'app09',
    name: 'Recipe Sharing Community',
    flaws: [
      { category: 'secret', pattern: 'mongodb://chefuser:KitchenSecret77@mongodb.local:27017/recipes', severity: 'critical' },
      { category: 'idor', pattern: 'app.delete("/api/recipes/:id"', severity: 'medium' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const MONGO_URL = "mongodb://chefuser:KitchenSecret77@mongodb.local:27017/recipes";
await mongoose.connect(MONGO_URL);

const Recipe = mongoose.model("Recipe", new mongoose.Schema({
  title: String,
  ingredients: [String],
  creatorId: String
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Auth required" });
  req.user = { id: "user_chef" };
  next();
}

app.get("/api/recipes", async (req, res) => {
  const list = await Recipe.find();
  res.json(list);
});

// IDOR: Delete recipe without checking creatorId
app.delete("/api/recipes/:id", requireAuth, async (req, res) => {
  const deleted = await Recipe.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Recipe not found" });
  res.json({ message: "Recipe removed" });
});

export default app;
`
  },
  {
    id: 'app10',
    name: 'Bookmark Vault API',
    flaws: [
      { category: 'auth', pattern: 'app.get("/api/bookmarks"', severity: 'high' },
      { category: 'injection', pattern: 'Bookmark.findOne({ code: req.body.code })', severity: 'high' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Bookmark = mongoose.model("Bookmark", new mongoose.Schema({
  url: String,
  code: String,
  userId: String
}));

// Route exposes all user bookmarks with no authentication
app.get("/api/bookmarks", async (req, res) => {
  const data = await Bookmark.find({});
  res.json(data);
});

// Injection sink in code lookup
app.post("/api/bookmarks/lookup", async (req, res) => {
  const item = await Bookmark.findOne({ code: req.body.code });
  res.json(item || {});
});

export default app;
`
  },

  // --- BATCH 2: app11 - app20 ---
  {
    id: 'app11',
    name: 'Medical Clinic Patient Portal',
    flaws: [
      { category: 'secret', pattern: 'const CLINIC_API_KEY = "mock_clinic_api_key_1122334455667788";', severity: 'critical' },
      { category: 'auth', pattern: 'app.get("/api/patients"', severity: 'high' },
      { category: 'idor', pattern: 'app.get("/api/patients/:id/records"', severity: 'medium' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const CLINIC_API_KEY = "mock_clinic_api_key_1122334455667788";

const Patient = mongoose.model("Patient", new mongoose.Schema({
  name: String,
  history: String,
  doctorId: String
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
  req.user = { id: "doc_1" };
  next();
}

// Unprotected data-returning route exposing patient identities
app.get("/api/patients", async (req, res) => {
  const patients = await Patient.find();
  res.json(patients);
});

// IDOR: Access patient medical records by ID without validating doctor assignment
app.get("/api/patients/:id/records", requireAuth, async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  res.json(patient);
});

export default app;
`
  },
  {
    id: 'app12',
    name: 'Real Estate Property Listings',
    flaws: [
      { category: 'injection', pattern: 'Listing.find({ type: req.query.type })', severity: 'high' },
      { category: 'dependency', file: 'package.json', pattern: '"mongoose": "5.10.0"', severity: 'high' }
    ],
    deps: { express: '^4.18.2', mongoose: '5.10.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Listing = mongoose.model("Listing", new mongoose.Schema({
  address: String,
  price: Number,
  type: String
}));

// Injection sink via query params
app.get("/api/listings/filter", async (req, res) => {
  const results = await Listing.find({ type: req.query.type });
  res.json(results);
});

app.post("/api/listings", async (req, res) => {
  const item = await Listing.create(req.body);
  res.status(201).json(item);
});

export default app;
`
  },
  {
    id: 'app13',
    name: 'Invoice Billing Gateway',
    flaws: [
      { category: 'secret', pattern: 'const PAYMENT_WEBHOOK_SECRET = "whsec_mock_test_key_9988771122334455";', severity: 'critical' },
      { category: 'idor', pattern: 'app.get("/api/invoices/:id"', severity: 'medium' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const PAYMENT_WEBHOOK_SECRET = "whsec_mock_test_key_9988771122334455";

const Invoice = mongoose.model("Invoice", new mongoose.Schema({
  customerId: String,
  amount: Number,
  paid: Boolean
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Auth required" });
  req.user = { id: "cust_77" };
  next();
}

// IDOR: Customer can view any invoice by simply altering :id in the URL
app.get("/api/invoices/:id", requireAuth, async (req, res) => {
  const inv = await Invoice.findById(req.params.id);
  res.json(inv);
});

export default app;
`
  },
  {
    id: 'app14',
    name: 'Fitness Workout Logger',
    flaws: [
      { category: 'auth', pattern: 'app.get("/api/workouts/history"', severity: 'high' },
      { category: 'injection', pattern: 'Workout.find({ name: req.body.name })', severity: 'high' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Workout = mongoose.model("Workout", new mongoose.Schema({
  userId: String,
  name: String,
  duration: Number
}));

// Route returns workout logs without auth
app.get("/api/workouts/history", async (req, res) => {
  const logs = await Workout.find({});
  res.json(logs);
});

// Injection sink in workout name search
app.post("/api/workouts/search", async (req, res) => {
  const result = await Workout.find({ name: req.body.name });
  res.json(result);
});

export default app;
`
  },
  {
    id: 'app15',
    name: 'HR Employee Directory',
    flaws: [
      { category: 'secret', pattern: 'mongodb://hrmanager:SuperSecretHR2026@internal.mongo:27017/hr', severity: 'critical' },
      { category: 'auth', pattern: 'app.get("/api/employees/salaries"', severity: 'high' },
      { category: 'dependency', file: 'package.json', pattern: '"jsonwebtoken": "8.5.1"', severity: 'high' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0', jsonwebtoken: '8.5.1' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const MONGO_URI = "mongodb://hrmanager:SuperSecretHR2026@internal.mongo:27017/hr";
await mongoose.connect(MONGO_URI);

const Employee = mongoose.model("Employee", new mongoose.Schema({
  name: String,
  salary: Number,
  department: String
}));

// Unprotected route exposing internal salary records
app.get("/api/employees/salaries", async (req, res) => {
  const list = await Employee.find({}, "name salary department");
  res.json(list);
});

export default app;
`
  },
  {
    id: 'app16',
    name: 'Customer Support Ticket Helpdesk',
    flaws: [
      { category: 'idor', pattern: 'app.put("/api/tickets/:id"', severity: 'medium' },
      { category: 'injection', pattern: 'Ticket.find({ tag: req.query.tag })', severity: 'high' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Ticket = mongoose.model("Ticket", new mongoose.Schema({
  creatorId: String,
  subject: String,
  tag: String,
  status: String
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
  req.user = { id: "user_a" };
  next();
}

// Injection sink in tag filter
app.get("/api/tickets", async (req, res) => {
  const tickets = await Ticket.find({ tag: req.query.tag });
  res.json(tickets);
});

// IDOR: Modifying ticket without ensuring creator ownership
app.put("/api/tickets/:id", requireAuth, async (req, res) => {
  const updated = await Ticket.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

export default app;
`
  },
  {
    id: 'app17',
    name: 'Student Learning Management API',
    flaws: [
      { category: 'secret', pattern: 'const JWT_SIGNING_KEY = "vibe_coding_secret_jwt_sign_key_112233";', severity: 'critical' },
      { category: 'auth', pattern: 'app.get("/api/courses/grades"', severity: 'high' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const JWT_SIGNING_KEY = "vibe_coding_secret_jwt_sign_key_112233";

const Grade = mongoose.model("Grade", new mongoose.Schema({
  studentId: String,
  course: String,
  score: Number
}));

// Route exposing student grades with no auth guard
app.get("/api/courses/grades", async (req, res) => {
  const grades = await Grade.find();
  res.json(grades);
});

export default app;
`
  },
  {
    id: 'app18',
    name: 'Social Media Feed & Comments',
    flaws: [
      { category: 'injection', pattern: 'Comment.find({ postId: req.query.postId })', severity: 'high' },
      { category: 'idor', pattern: 'app.delete("/api/comments/:id"', severity: 'medium' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Comment = mongoose.model("Comment", new mongoose.Schema({
  authorId: String,
  postId: String,
  text: String
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Missing token" });
  req.user = { id: "user_commenter" };
  next();
}

// Injection sink in postId query
app.get("/api/comments", async (req, res) => {
  const list = await Comment.find({ postId: req.query.postId });
  res.json(list);
});

// IDOR: Delete comment without verifying authorId
app.delete("/api/comments/:id", requireAuth, async (req, res) => {
  await Comment.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

export default app;
`
  },
  {
    id: 'app19',
    name: 'Vehicle Fleet Tracking System',
    flaws: [
      { category: 'secret', pattern: 'const MAPBOX_ACCESS_TOKEN = "pk_mock_mapbox_token_998877665544332211";', severity: 'critical' },
      { category: 'auth', pattern: 'app.get("/api/fleet/locations"', severity: 'high' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const MAPBOX_ACCESS_TOKEN = "pk_mock_mapbox_token_998877665544332211";

const Vehicle = mongoose.model("Vehicle", new mongoose.Schema({
  vin: String,
  lat: Number,
  lng: Number
}));

// Route returning real-time vehicle GPS coordinates without auth
app.get("/api/fleet/locations", async (req, res) => {
  const vehicles = await Vehicle.find();
  res.json(vehicles);
});

export default app;
`
  },
  {
    id: 'app20',
    name: 'Music Playlist Creator',
    flaws: [
      { category: 'injection', pattern: 'Playlist.findOne({ title: req.body.title })', severity: 'high' },
      { category: 'dependency', file: 'package.json', pattern: '"lodash": "4.17.15"', severity: 'high' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0', lodash: '4.17.15' },
    code: `import express from "express";
import mongoose from "mongoose";
import _ from "lodash";

const app = express();
app.use(express.json());

const Playlist = mongoose.model("Playlist", new mongoose.Schema({
  title: String,
  songs: [String]
}));

// Injection sink via body parameter in findOne
app.post("/api/playlists/search", async (req, res) => {
  const match = await Playlist.findOne({ title: req.body.title });
  res.json(match || {});
});

export default app;
`
  },

  // --- BATCH 3: app21 - app30 ---
  {
    id: 'app21',
    name: 'Cloud File Metadata Stash',
    flaws: [
      { category: 'secret', pattern: 'mongodb://cloudadmin:SecretStoragePassword44@mongo.cloud:27017/files', severity: 'critical' },
      { category: 'idor', pattern: 'app.get("/api/files/:id/meta"', severity: 'medium' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const STORAGE_URI = "mongodb://cloudadmin:SecretStoragePassword44@mongo.cloud:27017/files";
await mongoose.connect(STORAGE_URI);

const FileMeta = mongoose.model("FileMeta", new mongoose.Schema({
  filename: String,
  ownerId: String,
  size: Number
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Auth header required" });
  req.user = { id: "user_owner" };
  next();
}

// IDOR: Access file metadata without checking ownerId
app.get("/api/files/:id/meta", requireAuth, async (req, res) => {
  const file = await FileMeta.findById(req.params.id);
  res.json(file);
});

export default app;
`
  },
  {
    id: 'app22',
    name: 'Weather Cache Aggregator',
    flaws: [
      { category: 'secret', pattern: 'const OPENWEATHER_API_KEY = "mock_openweather_key_9900112233445566";', severity: 'critical' },
      { category: 'injection', pattern: 'Weather.find({ city: req.query.city })', severity: 'high' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const OPENWEATHER_API_KEY = "mock_openweather_key_9900112233445566";

const Weather = mongoose.model("Weather", new mongoose.Schema({
  city: String,
  temp: Number
}));

// Injection sink via query params
app.get("/api/weather", async (req, res) => {
  const data = await Weather.find({ city: req.query.city });
  res.json(data);
});

export default app;
`
  },
  {
    id: 'app23',
    name: 'Event RSVP Management',
    flaws: [
      { category: 'auth', pattern: 'app.get("/api/events/attendees"', severity: 'high' },
      { category: 'idor', pattern: 'app.delete("/api/rsvp/:id"', severity: 'medium' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Rsvp = mongoose.model("Rsvp", new mongoose.Schema({
  eventId: String,
  userId: String,
  confirmed: Boolean
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "No auth" });
  req.user = { id: "user_rsvp" };
  next();
}

// Unprotected route exposing attendee list
app.get("/api/events/attendees", async (req, res) => {
  const list = await Rsvp.find();
  res.json(list);
});

// IDOR: Delete RSVP without ensuring ownership
app.delete("/api/rsvp/:id", requireAuth, async (req, res) => {
  await Rsvp.findByIdAndDelete(req.params.id);
  res.json({ status: "cancelled" });
});

export default app;
`
  },
  {
    id: 'app24',
    name: 'Job Application Tracker',
    flaws: [
      { category: 'secret', pattern: 'const RECRUITER_SECRET_KEY = "mock_recruiter_key_9988776655443322";', severity: 'critical' },
      { category: 'injection', pattern: 'Application.findOne({ candidateEmail: req.body.email })', severity: 'high' },
      { category: 'auth', pattern: 'app.get("/api/applications/all"', severity: 'high' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const RECRUITER_SECRET_KEY = "mock_recruiter_key_9988776655443322";

const Application = mongoose.model("Application", new mongoose.Schema({
  candidateEmail: String,
  role: String,
  resumeUrl: String
}));

// Route exposes all job applications without authentication
app.get("/api/applications/all", async (req, res) => {
  const apps = await Application.find();
  res.json(apps);
});

// Injection sink in candidate email lookup
app.post("/api/applications/status", async (req, res) => {
  const match = await Application.findOne({ candidateEmail: req.body.email });
  res.json(match || {});
});

export default app;
`
  },
  {
    id: 'app25',
    name: 'Podcast Episode Library',
    flaws: [
      { category: 'dependency', file: 'package.json', pattern: '"jsonwebtoken": "8.5.1"', severity: 'high' },
      { category: 'idor', pattern: 'app.put("/api/episodes/:id"', severity: 'medium' }
    ],
    deps: { express: '^4.18.2', mongoose: '^7.0.0', jsonwebtoken: '8.5.1' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const Episode = mongoose.model("Episode", new mongoose.Schema({
  title: String,
  creatorId: String,
  audioUrl: String
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
  req.user = { id: "host_1" };
  next();
}

// IDOR: Updating podcast episode without creatorId verification
app.put("/api/episodes/:id", requireAuth, async (req, res) => {
  const updated = await Episode.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

export default app;
`
  },

  // --- CLEAN APPS (26-30): ZERO FLAWS, TESTING FALSE POSITIVES ---
  {
    id: 'app26',
    name: 'Secure Account Profile Manager (CLEAN)',
    flaws: [],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/secure_db";
await mongoose.connect(MONGODB_URI);

const Profile = mongoose.model("Profile", new mongoose.Schema({
  userId: String,
  displayName: String,
  bio: String
}));

function requireAuth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Missing authorization" });
  req.user = { id: "verified_user" };
  next();
}

// Clean protected route with ownership validation
app.get("/api/profile/me", requireAuth, async (req, res) => {
  const profile = await Profile.findOne({ userId: String(req.user.id) });
  res.json(profile || {});
});

// Proper IDOR prevention: ownership explicitly enforced
app.put("/api/profile/:id", requireAuth, async (req, res) => {
  const profile = await Profile.findById(String(req.params.id));
  if (!profile) return res.status(404).json({ error: "Not found" });
  if (profile.userId !== req.user.id) {
    return res.status(403).json({ error: "Forbidden: Not your profile" });
  }
  profile.displayName = String(req.body.displayName || profile.displayName);
  await profile.save();
  res.json(profile);
});

export default app;
`
  },
  {
    id: 'app27',
    name: 'Secure Order Status Checker (CLEAN)',
    flaws: [],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/orders";
await mongoose.connect(MONGODB_URI);

const Order = mongoose.model("Order", new mongoose.Schema({
  trackingNumber: String,
  status: String,
  customerId: String
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
  req.user = { id: "user_customer" };
  next();
}

// Sanitized parameter lookup with auth
app.get("/api/orders/track", requireAuth, async (req, res) => {
  const trackingNumber = String(req.query.tracking || "");
  const order = await Order.findOne({
    trackingNumber: trackingNumber,
    customerId: String(req.user.id)
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
});

export default app;
`
  },
  {
    id: 'app28',
    name: 'Secure Public Documentation Service (CLEAN)',
    flaws: [],
    deps: { express: '^4.18.2' },
    code: `import express from "express";

const app = express();
app.use(express.json());

const articles = [
  { slug: "getting-started", title: "Getting Started", content: "Welcome to our platform docs." },
  { slug: "api-reference", title: "API Reference", content: "Detailed endpoints documentation." }
];

// Clean public informational endpoints
app.get("/api/docs", (req, res) => {
  res.json(articles.map(a => ({ slug: a.slug, title: a.title })));
});

app.get("/api/docs/:slug", (req, res) => {
  const slug = String(req.params.slug);
  const found = articles.find(a => a.slug === slug);
  if (!found) return res.status(404).json({ error: "Article not found" });
  res.json(found);
});

export default app;
`
  },
  {
    id: 'app29',
    name: 'Secure Notification Webhook Receiver (CLEAN)',
    flaws: [],
    deps: { express: '^4.18.2' },
    code: `import express from "express";

const app = express();
app.use(express.json());

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

app.post("/api/webhook", (req, res) => {
  const signature = req.headers["x-webhook-signature"];
  if (!signature || signature !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  const event = String(req.body.event || "");
  res.json({ received: true, event });
});

export default app;
`
  },
  {
    id: 'app30',
    name: 'Secure Two-Factor Authentication Helper (CLEAN)',
    flaws: [],
    deps: { express: '^4.18.2', mongoose: '^7.0.0' },
    code: `import express from "express";
import mongoose from "mongoose";

const app = express();
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/auth_db";
await mongoose.connect(MONGODB_URI);

const UserAuth = mongoose.model("UserAuth", new mongoose.Schema({
  userId: String,
  twoFactorEnabled: Boolean
}));

function requireAuth(req, res, next) {
  if (!req.headers.authorization) return res.status(401).json({ error: "Unauthorized" });
  req.user = { id: "auth_user_1" };
  next();
}

app.get("/api/auth/2fa/status", requireAuth, async (req, res) => {
  const record = await UserAuth.findOne({ userId: String(req.user.id) });
  res.json({ enabled: Boolean(record?.twoFactorEnabled) });
});

export default app;
`
  }
];

const groundTruth = { apps: [] };

console.log('Generating 30 apps...');

for (const app of appDefs) {
  const dir = path.join(appsDir, app.id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const pkgJson = {
    name: `@slopstop-corpus/${app.id}`,
    version: '1.0.0',
    type: 'module',
    private: true,
    dependencies: app.deps
  };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n');

  const indexPath = path.join(dir, 'index.js');
  fs.writeFileSync(indexPath, app.code);

  // Validate syntax
  try {
    execSync('node --check "' + indexPath + '"');
  } catch (err) {
    console.error(`FATAL: Syntax check failed on ${app.id}/index.js`);
    process.exit(1);
  }

  // Calculate ground truth lines by actual file inspection
  const indexLines = fs.readFileSync(indexPath, 'utf-8').split('\n');
  const pkgLines = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8').split('\n');

  const appFlaws = [];
  for (const flaw of app.flaws) {
    if (flaw.category === 'dependency') {
      const idx = pkgLines.findIndex(l => l.includes(flaw.pattern));
      if (idx === -1) {
        console.error(`Missing pattern ${flaw.pattern} in ${app.id}/package.json`);
        process.exit(1);
      }
      appFlaws.push({
        category: flaw.category,
        file: 'package.json',
        line: idx + 1,
        severity: flaw.severity
      });
    } else {
      const idx = indexLines.findIndex(l => l.includes(flaw.pattern));
      if (idx === -1) {
        console.error(`Missing pattern ${flaw.pattern} in ${app.id}/index.js`);
        process.exit(1);
      }
      appFlaws.push({
        category: flaw.category,
        file: 'index.js',
        line: idx + 1,
        severity: flaw.severity
      });
    }
  }

  groundTruth.apps.push({
    app: app.id,
    flaws: appFlaws
  });
}

const gtPath = path.join(corpusDir, 'ground-truth.json');
fs.writeFileSync(gtPath, JSON.stringify(groundTruth, null, 2) + '\n');

// Summary statistics
const catCounts = { secret: 0, injection: 0, auth: 0, dependency: 0, idor: 0 };
let totalFlaws = 0;
for (const a of groundTruth.apps) {
  for (const f of a.flaws) {
    catCounts[f.category] = (catCounts[f.category] || 0) + 1;
    totalFlaws++;
  }
}

console.log('Ground truth written. Total flaws:', totalFlaws);
console.log('Category breakdown:', catCounts);

// Generate corpus/README.md
const readme = `# SlopStop Corpus

This corpus contains 30 realistic AI-generated ("vibe-coded") Express + MongoDB apps used to evaluate SlopStop's deterministic security scanner and auto-patcher against baselines.

## Flaw Counts by Category

| Category | Description | Count |
| :--- | :--- | :--- |
| **secret** | Hard-coded API keys, JWT secrets, database connection URIs | ${catCounts.secret} |
| **injection** | Direct NoSQL operator injections (\`find\`, \`findOne\`, \`$where\`) | ${catCounts.injection} |
| **auth** | Sensitive data-returning Express routes lacking auth middleware | ${catCounts.auth} |
| **idor** | Direct object reference endpoints without ownership validation | ${catCounts.idor} |
| **dependency** | Pinned vulnerable package versions (CVEs in npm dependencies) | ${catCounts.dependency} |
| **TOTAL** | | **${totalFlaws}** |

## Structure

- \`apps/app01\` to \`apps/app25\`: 25 flawed applications with 1–4 realistic security flaws each (40–120 LOC).
- \`apps/app26\` to \`apps/app30\`: 5 clean applications (0 flaws) to evaluate false positive rates.
- \`ground-truth.json\`: Exact machine-readable ground truth with validated file paths, line numbers, categories, and severities.
- \`baselines/\`: Scripts to run Semgrep, Gitleaks, and LLM-only fixer baselines.
- \`benchmark/\`: SlopStop core benchmark execution harness and evaluation metrics.
- \`FAILURES.md\`: Documented edge cases, IDOR limitations, and benchmark failure analysis.
`;

fs.writeFileSync(path.join(corpusDir, 'README.md'), readme);
console.log('corpus/README.md written successfully.');
