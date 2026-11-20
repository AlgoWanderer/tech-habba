// A1b: idor-suspect gets a suggested ownership check as fixPreview, but stays "review".
import { describe, it, expect } from 'vitest';
import { rules } from './helpers.js';
import { scan, applyFixes } from '../index.js';

const idor = (c) => rules(c, 'idor-suspect');

const LIBRARY = [
  "const Loan = mongoose.model('Loan', new mongoose.Schema({ title: String, memberId: String, due: Date }));",
  'function requireMember(req, res, next) {',
  '  const m = verify(req.headers.authorization);',
  '  if (!m) return res.status(401).end();',
  '  req.member = m;',
  '  next();',
  '}',
  'app.get("/api/loans/:id", requireMember, async (req, res) => {',
  '  res.json(await Loan.findById(req.params.id));',
  '});',
  '',
].join('\n');

describe('idor-suspect suggested fix', () => {
  it('uses the schema owner field and what the auth middleware puts on req', () => {
    const [f] = idor(LIBRARY);
    expect(f.fixPreview).toBe('res.json(await Loan.findOne({ _id: req.params.id, memberId: req.member.id }));');
    expect(f.fixable).toBe('review');
  });

  it.each([
    ['findByIdAndUpdate', 'await Post.findByIdAndUpdate(req.params.id, req.body);', 'await Post.findOneAndUpdate({ _id: req.params.id, ownerId: req.user.id }, req.body);'],
    ['findByIdAndDelete', 'await Post.findByIdAndDelete(req.params.id);', 'await Post.findOneAndDelete({ _id: req.params.id, ownerId: req.user.id });'],
    ['findOne filter', 'await Post.findOne({ _id: req.params.id });', 'await Post.findOne({ _id: req.params.id, ownerId: req.user.id });'],
    ['deleteOne filter', 'await Post.deleteOne({ _id: req.params.id, });', 'await Post.deleteOne({ _id: req.params.id, ownerId: req.user.id });'],
  ])('rewrites %s', (_, call, expected) => {
    const [f] = idor(`app.put("/p/:id", async (req, res) => {\n  ${call}\n});`);
    expect(f.fixPreview).toBe(expected);
  });

  it('follows a renamed request parameter', () => {
    const [f] = idor('app.get("/p/:id", async (request, res) => res.json(await Post.findById(request.params.id)));');
    expect(f.fixPreview).toContain('ownerId: request.user.id');
  });

  it('gives no preview where there is no single obvious filter (raw SQL, Prisma where)', () => {
    expect(idor('app.get("/p/:id", async (req, res) => res.json(await db.query("SELECT * FROM p WHERE id = ?", [req.params.id])));')[0].fixPreview).toBeUndefined();
    expect(idor('app.get("/p/:id", async (req, res) => res.json(await prisma.post.findUnique({ where: { id: req.params.id } })));')[0].fixPreview).toBeUndefined();
  });

  it('is never auto-applied by the fixer', () => {
    const files = [{ path: 'index.js', content: LIBRARY }];
    const id = scan(files).find((f) => f.ruleId === 'idor-suspect').id;
    const out = applyFixes(files, [id]);
    expect(out.results).toEqual([expect.objectContaining({ findingId: id, status: 'review' })]);
    expect(out.patched).toEqual([]);
  });
});
