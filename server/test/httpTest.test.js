import { describe, expect, it } from 'vitest';
import { loadCore } from '../coreAdapter.js';
import { createFakeClient } from '../ai/client.js';
import { aiPatch } from '../ai/patch.js';
import { findRoutes, httpCheck, startApp } from '../exploit/httpTest.js';
import { runFix } from '../pipeline.js';

const core = await loadCore({ forceMock: false });

// A small vibe-coded library API: login injection, an unprotected staff route, an IDOR.
const APP = [
  'import express from "express";',
  'import mongoose from "mongoose";',
  'import jwt from "jsonwebtoken";',
  'const app = express();',
  'app.use(express.json());',
  'const TOKEN_SECRET = process.env.TOKEN_SECRET;',
  'const Member = mongoose.model("Member", new mongoose.Schema({ email: String, password: String }));',
  'const Loan = mongoose.model("Loan", new mongoose.Schema({ memberId: String, bookId: String }));',
  'function verifyMember(req, res, next) {',
  '  try {',
  '    req.member = jwt.verify(req.headers.authorization?.split(" ")[1], TOKEN_SECRET);',
  '    next();',
  '  } catch {',
  '    return res.status(401).json({ error: "Please log in" });',
  '  }',
  '}',
  'app.post("/api/login", async (req, res) => {',
  '  const member = await Member.findOne({ email: req.body.email, password: req.body.password });',
  '  if (!member) return res.status(401).json({ error: "Wrong email or password" });',
  '  res.json({ token: jwt.sign({ id: member._id }, TOKEN_SECRET) });',
  '});',
  'app.get("/api/staff/members", async (req, res) => {',
  '  res.json(await Member.find({}));',
  '});',
  'app.get("/api/loans/:id", verifyMember, async (req, res) => {',
  '  const loan = await Loan.findById(req.params.id);',
  '  res.json(loan);',
  '});',
  'app.listen(3000);',
].join('\n');
const FILES = [{ path: 'index.js', content: APP }];
const swap = (from, to) => [{ path: 'index.js', content: APP.replace(from, to) }];
const find = async (ruleId) => (await core.scan(FILES)).find((f) => f.ruleId === ruleId);

describe('HTTP test (attack mode + normal mode)', { timeout: 60000 }, () => {
  it('finds routes', () => {
    expect(findRoutes(APP).map((r) => `${r.method} ${r.path}`)).toEqual(['POST /api/login', 'GET /api/staff/members', 'GET /api/loans/:id']);
  });

  it('IDOR: passes the correct fix, fails a fix that locks the owner out or crashes', async () => {
    const idor = await find('idor-suspect');
    const good = await httpCheck(FILES, swap('Loan.findById(req.params.id)', 'Loan.findOne({ _id: req.params.id, memberId: req.member.id })'), idor);
    expect(good).toMatchObject({ testable: true, passed: true });
    expect(good.summary).toMatch(/another user got the owner's record.*another user was refused.*the owner got their record/);
    // The real token only holds { id }, so `_id` is undefined: the owner is locked out of their own loan.
    const subtle = await httpCheck(FILES, swap('Loan.findById(req.params.id)', 'Loan.findOne({ _id: req.params.id, memberId: req.member._id })'), idor);
    expect(subtle).toMatchObject({ testable: true, passed: false });
    expect(subtle.summary).toMatch(/normal mode FAILED.*owner can no longer get their own record/);
    const crash = await httpCheck(FILES, swap('Loan.findById(req.params.id)', 'Loan.findOne({ _id: req.params.id, userId: req.user.id })'), idor);
    expect(crash.summary).toMatch(/the app crashed/);
    const none = await httpCheck(FILES, FILES, idor);
    expect(none).toMatchObject({ testable: true, passed: false });
    expect(none.summary).toMatch(/attack mode FAILED/);
  });

  it('rule fixes get the HTTP result in their reason (login injection + missing auth)', async () => {
    const findings = await core.scan(FILES);
    const out = await runFix(core, FILES, findings.map((f) => f.id), { httpTest: true });
    const login = out.results.find((r) => r.findingId.startsWith('nosql-injection'));
    const staff = out.results.find((r) => r.findingId.startsWith('route-no-auth'));
    expect(login.reason).toMatch(/HTTP test passed on POST \/api\/login: before the fix an operator payload .* was accepted \(200\); after it .* was refused \(401\), and valid input still works \(200\)/);
    expect(staff.reason).toMatch(/HTTP test passed on GET \/api\/staff\/members: .*without login got in \(200\).*refused \(401\)/);
  });

  it('rejects an AI patch that passes every static check but fails the HTTP test', async () => {
    // Same app, but the middleware sets req.user (which the rule re-scan already accepts as an ownership source).
    const files = [{ path: 'index.js', content: APP.replaceAll('req.member', 'req.user') }];
    const idor = (await core.scan(files)).find((f) => f.ruleId === 'idor-suspect');
    const route = (filter) => `app.get("/api/loans/:id", verifyMember, async (req, res) => {\n  const loan = await Loan.findOne({ _id: req.params.id, ${filter} });\n  res.json(loan);\n});`;
    // req.user._id: real names, valid syntax, passes the re-scan; but the token only carries `id`, so owners are locked out.
    const bad = await aiPatch(core, files, idor, createFakeClient(() => ({ replacement: route('memberId: req.user._id'), explanation: 'ownership' })), { httpTest: true });
    expect(bad.result.status).toBe('rejected');
    expect(bad.result.reason).toMatch(/HTTP normal mode FAILED.*owner can no longer get their own record/);
    const good = await aiPatch(core, files, idor, createFakeClient(() => ({ replacement: route('memberId: req.user.id'), explanation: 'ownership' })), { httpTest: true });
    expect(good.result.status).toBe('applied');
    expect(good.result.reason).toMatch(/HTTP test passed on GET \/api\/loans\/:id/);
  });

  it('feedback loop: the verifier rejection is sent back and a corrected second attempt is applied', async () => {
    const files = [{ path: 'index.js', content: APP.replaceAll('req.member', 'req.user') }];
    const idor = (await core.scan(files)).find((f) => f.ruleId === 'idor-suspect');
    const route = (filter) => `app.get("/api/loans/:id", verifyMember, async (req, res) => {\n  const loan = await Loan.findOne({ _id: req.params.id, ${filter} });\n  res.json(loan);\n});`;
    const client = createFakeClient((_s, _u, n) => ({ replacement: route(n === 1 ? 'memberId: req.user._id' : 'memberId: req.user.id'), explanation: 'ownership' }));
    const r = await aiPatch(core, files, idor, client, { httpTest: true });
    expect(r.result.status).toBe('applied');
    expect(r.result.reason).toMatch(/Fixed on attempt 2 after the verifier rejected: HTTP normal mode FAILED/);
    expect(client.calls).toBe(2);
    expect(client.sent[1].userText).toMatch(/YOUR PREVIOUS ATTEMPT WAS REJECTED BY THE VERIFIER:\nHTTP normal mode FAILED.*owner can no longer get their own record/);
    expect(client.sent[1].userText).toContain('req.user._id');
  });

  it('IDOR with req.member: the rule now accepts the ownership check, and the HTTP test still catches the subtle bug', async () => {
    const idor = await find('idor-suspect');
    const route = (filter) => `app.get("/api/loans/:id", verifyMember, async (req, res) => {\n  const loan = await Loan.findOne({ _id: req.params.id, ${filter} });\n  res.json(loan);\n});`;
    const good = await aiPatch(core, FILES, idor, createFakeClient(() => ({ replacement: route('memberId: req.member.id'), explanation: 'ownership' })), { httpTest: true });
    expect(good.result.status).toBe('applied');
    expect(good.result.reason).toMatch(/HTTP test passed on GET \/api\/loans\/:id/);
    // req.member._id passes the re-scan now (it mentions req.member), so only the HTTP test can reject it
    const bad = await aiPatch(core, FILES, idor, createFakeClient(() => ({ replacement: route('memberId: req.member._id'), explanation: 'ownership' })), { httpTest: true });
    expect(bad.result.status).toBe('rejected');
    expect(bad.result.reason).toMatch(/HTTP normal mode FAILED/);
  });

  it('sandbox: the app under test cannot write files, read outside its folder or run commands', async () => {
    const evil = [{ path: 'index.js', content: 'import express from "express";\nimport fs from "node:fs";\nimport cp from "node:child_process";\nimport os from "node:os";\nconst app = express();\nconst out = {};\ntry { fs.writeFileSync(os.tmpdir() + "/slopstop-evil.txt", "x"); out.write = "ALLOWED"; } catch (e) { out.write = e.code; }\ntry { fs.readFileSync(os.homedir() + "/.gitconfig"); out.read = "ALLOWED"; } catch (e) { out.read = e.code; }\ntry { cp.execSync("node -v"); out.exec = "ALLOWED"; } catch (e) { out.exec = e.code; }\napp.get("/r", (req, res) => res.json(out));\napp.listen(3000);\n' }];
    const app = await startApp(evil);
    expect(app.port).toBeTruthy();
    const out = await (await fetch(`http://127.0.0.1:${app.port}/r`)).json();
    await app.stop();
    expect(out.write).toBe('ERR_ACCESS_DENIED');
    expect(out.exec).toBe('ERR_ACCESS_DENIED');
    expect(out.read).not.toBe('ALLOWED');
  });

  it('reports untestable cases instead of failing them', async () => {
    const secret = { id: 's', ruleId: 'secret-hardcoded', category: 'secret', file: 'index.js', line: 6, message: '' };
    expect(await httpCheck(FILES, FILES, secret)).toMatchObject({ testable: false });
    const broken = [{ path: 'index.js', content: 'import nope from "not-a-real-package";\nnope();' }];
    const r = await httpCheck(broken, broken, { ...(await find('idor-suspect')), file: 'index.js' });
    expect(r.testable).toBe(false);
  });
});
