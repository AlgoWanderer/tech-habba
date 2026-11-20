import { describe, it, expect } from 'vitest';
import { rules } from './helpers.js';

const nosql = (c) => rules(c, 'nosql-injection');
const sql = (c) => rules(c, 'sql-injection');

describe('nosql-injection', () => {
  it('casts req.body fields in a filter', () => {
    const [f] = nosql('app.post("/x", async (req, res) => { await User.findOne({ email: req.body.email }); });');
    expect(f.fixable).toBe('auto');
    expect(f.fixPreview).toContain('email: String(req.body.email)');
  });

  it('tracks destructured variables (shorthand properties)', () => {
    const [f] = nosql('async function h(req) { const { email } = req.body; return User.find({ email }); }');
    expect(f.fixPreview).toContain('{ email: String(email) }');
  });

  it('whole req.body as a filter is review', () => {
    const [f] = nosql('async function h(req) { return User.findOne(req.body); }');
    expect(f.fixable).toBe('review');
  });

  it('$where is critical review', () => {
    const [f] = nosql('function h(req) { return User.find({ $where: `this.name == "${req.query.n}"` }); }');
    expect(f).toMatchObject({ severity: 'critical', fixable: 'review' });
  });

  it('operator values are review', () => {
    expect(nosql('function h(req) { return U.find({ age: { $gt: req.query.age } }); }')[0].fixable).toBe('review');
  });

  it('ignores req.params, casts, and non-mongo update()/find()', () => {
    const code = [
      'function h(req) {',
      '  Order.findOne({ _id: req.params.id });',
      '  User.findOne({ email: String(req.body.email) });',
      '  hash.update(req.body.password);',
      '  items.find((i) => i.id === req.body.id);',
      '}',
    ].join('\n');
    expect(nosql(code)).toEqual([]);
  });
});

describe('sql-injection', () => {
  it('parameterises a template literal and strips surrounding quotes', () => {
    const [f] = sql("function h(req) { db.query(`SELECT * FROM t WHERE name = '${req.query.q}'`); }");
    expect(f).toMatchObject({ severity: 'critical', fixable: 'auto' });
    expect(f.fixPreview).toContain('db.query(`SELECT * FROM t WHERE name = ?`, [req.query.q]);');
  });

  it('uses $n placeholders for pg', () => {
    const code = "const { Pool } = require('pg');\nfunction h(req) { pool.query(`SELECT * FROM t WHERE a = ${req.params.a} AND b = ${req.params.b}`); }";
    expect(sql(code)[0].fixPreview).toContain('WHERE a = $1 AND b = $2`, [req.params.a, req.params.b]');
  });

  it('concatenation and indirect SQL are review', () => {
    const code = [
      'function h(req) {',
      '  db.query("SELECT * FROM t WHERE id = " + req.params.id);',
      '  const s = `DELETE FROM t WHERE id = ${id}`;',
      '  db.query(s);',
      '}',
    ].join('\n');
    expect(sql(code).map((f) => [f.line, f.fixable])).toEqual([
      [2, 'review'],
      [4, 'review'],
    ]);
  });

  it('LIKE patterns inside quotes are review', () => {
    expect(sql("db.query(`SELECT * FROM t WHERE n LIKE '%${q}%'`)")[0].fixable).toBe('review');
  });

  it('ignores static SQL and non-SQL templates', () => {
    expect(sql('db.query("SELECT 1 FROM t"); app.get(`/x/${a}`, h); db.query(`SELECT * FROM t`);')).toEqual([]);
  });
});
