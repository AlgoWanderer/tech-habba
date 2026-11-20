import { describe, it, expect } from 'vitest';
import { rules } from './helpers.js';

const idor = (c) => rules(c, 'idor-suspect');

describe('idor-suspect', () => {
  it('flags lookups by req.params.id without ownership check, always review', () => {
    const [f] = idor('app.get("/api/orders/:id", requireAuth, async (req, res) => {\n  res.json(await Order.findById(req.params.id));\n});');
    expect(f).toMatchObject({ id: 'idor-suspect:app.js:1', severity: 'medium', fixable: 'review', endLine: 3 });
    // A suggestion only (defaults: ownerId, req.user); never auto-applied.
    expect(f.fixPreview).toBe('res.json(await Order.findOne({ _id: req.params.id, ownerId: req.user.id }));');
  });

  it('tracks destructured params', () => {
    const code = 'r.delete("/posts/:postId", async (req, res) => { const { postId } = req.params; await Post.findByIdAndDelete(postId); });';
    expect(idor(code)).toHaveLength(1);
  });

  it('accepts an ownership check', () => {
    const code = 'app.get("/o/:id", async (req, res) => { res.json(await Order.findOne({ _id: req.params.id, owner: req.user.id })); });';
    expect(idor(code)).toEqual([]);
  });

  it('ignores routes without id params', () => {
    expect(idor('app.get("/o/:slug", async (req, res) => { res.json(await P.findOne({ slug: req.params.slug })); });')).toEqual([]);
  });
});
