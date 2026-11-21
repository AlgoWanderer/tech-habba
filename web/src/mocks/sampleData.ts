import { ScanResponse, FixResponse, ExploitResponse, HardenPromptResponse, Finding } from '../types';

export const mockAiFindings: Finding[] = [
  {
    id: "ai-injection:index.js:30",
    ruleId: "ai-xss",
    category: "injection",
    severity: "high",
    file: "index.js",
    line: 30,
    endLine: 30,
    snippet: 'res.send(`<h1>Hello ${req.query.name}</h1>`);',
    message: "Reflected cross-site scripting (XSS): unescaped query parameter rendered in HTML response.",
    fixable: "review",
    fixPreview: 'res.send(`<h1>Hello ${escapeHtml(req.query.name)}</h1>`);',
    source: "ai",
    confidence: 0.82
  },
  {
    id: "ai-auth:index.js:12",
    ruleId: "ai-public-route-check",
    category: "auth",
    severity: "medium",
    file: "index.js",
    line: 12,
    endLine: 15,
    snippet: 'app.get("/api/config", (req, res) => res.json(systemConfig));',
    message: "Route /api/config exposes system configuration without auth; verify if intentional.",
    fixable: "review",
    source: "ai",
    confidence: 0.64
  }
];

export const mockScanResponse: ScanResponse = {
  findings: [
    {
      id: "secret-hardcoded:index.js:5",
      ruleId: "secret-hardcoded",
      category: "secret",
      severity: "critical",
      file: "index.js",
      line: 5,
      endLine: 5,
      snippet: 'const STRIPE_KEY = "sk_live_EXAMPLEEXAMPLEEXAMPLE";',
      message: "Hard-coded API key. Move it to an environment variable.",
      fixable: "auto",
      fixPreview: "const STRIPE_KEY = process.env.STRIPE_KEY;"
    },
    {
      id: "secret-hardcoded:index.js:7",
      ruleId: "secret-hardcoded",
      category: "secret",
      severity: "critical",
      file: "index.js",
      line: 7,
      endLine: 7,
      snippet: 'mongoose.connect("mongodb://admin:hunter2@localhost:27017/app");',
      message: "Database URI with an embedded password.",
      fixable: "auto",
      fixPreview: "mongoose.connect(process.env.MONGODB_URI);"
    },
    {
      id: "nosql-injection:index.js:14",
      ruleId: "nosql-injection",
      category: "injection",
      severity: "high",
      file: "index.js",
      line: 14,
      endLine: 14,
      snippet: "const user = await User.findOne({ email: req.body.email, password: req.body.password });",
      message: "Request body is passed straight into a MongoDB query (operator injection).",
      fixable: "auto",
      fixPreview: "User.findOne({ email: String(req.body.email), password: String(req.body.password) })"
    },
    {
      id: "route-no-auth:index.js:20",
      ruleId: "route-no-auth",
      category: "auth",
      severity: "high",
      file: "index.js",
      line: 20,
      endLine: 24,
      snippet: 'app.get("/api/users", async (req, res) => {',
      message: "Data-returning route has no authentication middleware.",
      fixable: "auto",
      fixPreview: 'app.get("/api/users", requireAuth, async (req, res) => {'
    },
    {
      id: "idor-suspect:index.js:28",
      ruleId: "idor-suspect",
      category: "idor",
      severity: "medium",
      file: "index.js",
      line: 28,
      endLine: 31,
      snippet: 'app.get("/api/orders/:id", requireAuth, async (req, res) => {',
      message: "Resource is looked up by id with no ownership check (possible IDOR). Needs human review.",
      fixable: "review"
    }
  ],
  score: {
    safety: 12,
    counts: { critical: 2, high: 2, medium: 1, low: 0 }
  }
};

export const mockFixResponse: FixResponse = {
  patched: [
    {
      path: "index.js",
      original: `import express from "express";
import mongoose from "mongoose";

const app = express();
const STRIPE_KEY = "sk_live_EXAMPLEEXAMPLEEXAMPLE";
app.use(express.json());

mongoose.connect("mongodb://admin:hunter2@localhost:27017/app");

// Login endpoint
app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email, password: req.body.password });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ token: "jwt-token-xyz" });
});

// Admin data leak
app.get("/api/users", async (req, res) => {
  const users = await User.find({});
  res.json(users);
});

// IDOR vulnerability
app.get("/api/orders/:id", requireAuth, async (req, res) => {
  const order = await Order.findById(req.params.id);
  res.json(order);
});
`,
      patched: `import express from "express";
import mongoose from "mongoose";

const app = express();
const STRIPE_KEY = process.env.STRIPE_KEY;
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI);

// Login endpoint
app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ email: String(req.body.email), password: String(req.body.password) });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ token: "jwt-token-xyz" });
});

// Admin data leak
app.get("/api/users", requireAuth, async (req, res) => {
  const users = await User.find({});
  res.json(users);
});

// IDOR vulnerability
app.get("/api/orders/:id", requireAuth, async (req, res) => {
  const order = await Order.findById(req.params.id);
  res.json(order);
});
`
    }
  ],
  envFile: "STRIPE_KEY=\nMONGODB_URI=\n",
  results: [
    {
      findingId: "secret-hardcoded:index.js:5",
      status: "applied",
      reason: "Replaced with process.env.STRIPE_KEY; passed node --check and re-scan.",
      source: "rule"
    },
    {
      findingId: "nosql-injection:index.js:14",
      status: "rejected",
      reason: "Patched file failed node --check; patch discarded.",
      source: "rule"
    },
    {
      findingId: "idor-suspect:index.js:28",
      status: "review",
      reason: "Ownership checks are business logic; flagged for human review.",
      source: "rule"
    }
  ],
  rescan: {
    findings: [
      {
        id: "idor-suspect:index.js:28",
        ruleId: "idor-suspect",
        category: "idor",
        severity: "medium",
        file: "index.js",
        line: 28,
        endLine: 31,
        snippet: 'app.get("/api/orders/:id", requireAuth, async (req, res) => {',
        message: "Resource is looked up by id with no ownership check (possible IDOR). Needs human review.",
        fixable: "review"
      }
    ],
    score: {
      safety: 92,
      counts: { critical: 0, high: 0, medium: 1, low: 0 }
    }
  },
  timingMs: 42
};

export const mockExploitResponse: ExploitResponse = {
  before: {
    status: 200,
    body: {
      success: true,
      data: [
        { id: 1, name: "Alice Admin", email: "alice@corp.internal", role: "superadmin", ssn: "000-12-3456" },
        { id: 2, name: "Bob Customer", email: "bob@example.com", role: "user", balance: 5400 }
      ],
      warning: "Data exposed without authentication barrier"
    }
  },
  after: {
    status: 401,
    body: {
      error: "Unauthorized",
      message: "Authentication token missing or invalid",
      attackBlocked: true
    }
  }
};

export const mockHardenPromptResponse: HardenPromptResponse = {
  hardened: `### SECURITY INSTRUCTIONS & CONSTRAINTS (MANDATORY)
1. Use environment variables (process.env) for all secrets, API keys, credentials, and URIs. Never hard-code credentials.
2. Validate and sanitise all incoming client input using schemas or explicit casting.
3. Parameterise all database queries (never concatenate unvalidated input into NoSQL/SQL sinks).
4. Add authentication & authorization middleware to all non-public Express routes.
5. Check resource ownership on all entity lookups by ID to prevent IDOR/BOLA.
6. Pin exact dependency versions and audit packages before installation.

### USER PROMPT:
Create an Express.js API endpoint with MongoDB that charges a card using Stripe with <API_KEY_1> and connects to <MONGO_URI_1>. Make sure to fetch users at /api/users.`,
  redactions: [
    { type: "stripe_key", original: "sk_live_EXAMPLEEXAMPLEEXAMPLE" },
    { type: "mongodb_uri", original: "mongodb://admin:hunter2@localhost:27017/app" }
  ],
  rules: [
    "Use environment variables for all secrets",
    "Never hard-code credentials",
    "Validate and sanitise all input",
    "Parameterise queries",
    "Add auth middleware to non-public routes",
    "Check resource ownership",
    "Pin and audit dependencies"
  ]
};

export const mockBenchmarkResults = {
  totalApps: 48,
  baselineVulnerabilities: 184,
  slopstopVulnerabilities: 14,
  msPerFile: 38,
  rejectionRate: 0.043,
  failureAnalysis: [
    {
      category: "idor",
      reason: "BOLA/IDOR logic flaws require domain business knowledge of user permissions; flagged as review.",
      count: 10
    },
    {
      category: "complex-ast",
      reason: "Dynamically evaluated variable-depth object queries failed AST parse safety.",
      count: 3
    },
    {
      category: "custom-auth",
      reason: "Non-standard nested session closures could not be deterministically wrapped.",
      count: 1
    }
  ]
};

export const SAMPLE_APPS = [
  {
    name: "Library API (live HTTP demo)",
    filename: "index.js",
    content: "import express from \"express\";\nimport mongoose from \"mongoose\";\nimport jwt from \"jsonwebtoken\";\nconst app = express();\napp.use(express.json());\nconst TOKEN_SECRET = process.env.TOKEN_SECRET;\nconst Member = mongoose.model(\"Member\", new mongoose.Schema({ email: String, password: String }));\nconst Loan = mongoose.model(\"Loan\", new mongoose.Schema({ memberId: String, bookId: String }));\nfunction verifyMember(req, res, next) {\n  try {\n    req.member = jwt.verify(req.headers.authorization?.split(\" \")[1], TOKEN_SECRET);\n    next();\n  } catch {\n    return res.status(401).json({ error: \"Please log in\" });\n  }\n}\napp.post(\"/api/login\", async (req, res) => {\n  const member = await Member.findOne({ email: req.body.email, password: req.body.password });\n  if (!member) return res.status(401).json({ error: \"Wrong email or password\" });\n  res.json({ token: jwt.sign({ id: member._id }, TOKEN_SECRET) });\n});\napp.get(\"/api/staff/members\", async (req, res) => {\n  res.json(await Member.find({}));\n});\napp.get(\"/api/loans/:id\", verifyMember, async (req, res) => {\n  const loan = await Loan.findById(req.params.id);\n  res.json(loan);\n});\napp.listen(3000);\n"
  },
  {
    name: "Vibe-Coded E-Commerce (Contract Sample)",
    filename: "index.js",
    content: `import express from "express";
import mongoose from "mongoose";

const app = express();
const STRIPE_KEY = "sk_live_EXAMPLEEXAMPLEEXAMPLE";
app.use(express.json());

mongoose.connect("mongodb://admin:hunter2@localhost:27017/app");

// Login endpoint
app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email, password: req.body.password });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ token: "jwt-token-xyz" });
});

// Admin data leak
app.get("/api/users", async (req, res) => {
  const users = await User.find({});
  res.json(users);
});

// IDOR vulnerability
app.get("/api/orders/:id", requireAuth, async (req, res) => {
  const order = await Order.findById(req.params.id);
  res.json(order);
});

app.listen(3000, () => console.log("Server running on port 3000"));
`
  },
  {
    name: "AI SaaS Chatbot Backend",
    filename: "server.js",
    content: `import express from "express";
import OpenAI from "openai";

const app = express();
const OPENAI_API_KEY = "sk-proj-9876543210abcdef9876543210abcdef9876543210";
app.use(express.json());

app.get("/api/admin/metrics", async (req, res) => {
  res.json({ revenue: 45000, activeSubscribers: 1200 });
});

app.post("/api/chat", async (req, res) => {
  const { prompt } = req.body;
  const result = await db.collection("chats").findOne({ query: req.body.query });
  res.json({ response: "AI response" });
});

app.get("/api/chat/:sessionId", requireAuth, async (req, res) => {
  const session = await db.collection("chats").findOne({ _id: req.params.sessionId });
  res.json(session);
});
`
  },
  {
    name: "Clean Hardened Reference",
    filename: "secure-app.js",
    content: `import express from "express";
import mongoose from "mongoose";
import { requireAuth } from "./middleware/auth.js";

const app = express();
app.use(express.json());

const STRIPE_KEY = process.env.STRIPE_KEY;
mongoose.connect(process.env.MONGODB_URI);

app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "");
  const password = String(req.body.password || "");
  const user = await User.findOne({ email, password });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ success: true });
});

app.get("/api/users", requireAuth, async (req, res) => {
  const users = await User.find({}, "id name email");
  res.json(users);
});
`
  }
];
