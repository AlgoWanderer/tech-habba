import { describe, it, expect } from 'vitest';
import { maskSecrets, scan } from '../index.js';

const lines = (s) => s.split('\n').length;

const APP = [
  "const express = require('express');",
  "const jwt = require('jsonwebtoken');",
  'const STRIPE_KEY = "sk_live_ABCDEF123456";',
  'mongoose.connect("mongodb://admin:hunter2@localhost:27017/app");',
  'const JWT_SECRET = "library-jwt-secret-do-not-share";',
  "const greeting = 'hello world';",
  'app.get("/token", (req, res) => res.json({ t: jwt.sign({ id: 1 }, JWT_SECRET) }));',
  '',
].join('\n');

describe('maskSecrets', () => {
  it('replaces each secret literal, keeps quotes, line count and every other byte', () => {
    const { files, count } = maskSecrets([{ path: 'index.js', content: APP }]);
    const out = files[0].content;
    expect(count).toBe(3);
    expect(lines(out)).toBe(lines(APP));
    expect(out).not.toContain('sk_live_ABCDEF123456');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('library-jwt-secret-do-not-share');
    const o = out.split('\n');
    const a = APP.split('\n');
    expect(o[2]).toBe('const STRIPE_KEY = "<REDACTED_SECRET_1>";');
    expect(o[3]).toBe('mongoose.connect("<REDACTED_SECRET_2>");');
    expect(o[4]).toBe('const JWT_SECRET = "<REDACTED_SECRET_3>";');
    for (const i of [0, 1, 5, 6, 7]) expect(o[i]).toBe(a[i]);
  });

  it('masked code still parses and no longer has secret findings', () => {
    const { files } = maskSecrets([{ path: 'index.js', content: APP }]);
    expect(() => new Function(files[0].content.replace(/require\(/g, '(')) ).not.toThrow();
    expect(scan(files).filter((f) => f.category === 'secret')).toEqual([]);
  });

  it('masks only the literal inside a process.env fallback, and reuses the number for the same value', () => {
    const code = "const a = process.env.JWT_SECRET || 'devsecret123';\njwt.verify(t, 'devsecret123');\n";
    const { files, count } = maskSecrets([{ path: 'a.js', content: code }]);
    expect(files[0].content).toBe("const a = process.env.JWT_SECRET || '<REDACTED_SECRET_1>';\njwt.verify(t, '<REDACTED_SECRET_1>');\n");
    expect(count).toBe(2);
  });

  it('keeps line count for multi-line template secrets', () => {
    const code = 'const privateKey = `-----BEGIN PRIVATE KEY-----\nMIIEv\n-----END PRIVATE KEY-----`;\nfoo();\n';
    const out = maskSecrets([{ path: 'k.js', content: code }]).files[0].content;
    expect(lines(out)).toBe(lines(code));
    expect(out).not.toContain('MIIEv');
    expect(out.split('\n')[3]).toBe('foo();');
  });

  it('masks known key shapes in files the rules do not parse (TS, .env, JSON)', () => {
    const { files } = maskSecrets([
      { path: 'a.ts', content: 'const k: string = "sk_live_ABCDEF123456";\n' },
      { path: '.env', content: 'MONGODB_URI=mongodb://u:p4ss@db/x\nPORT=3000\n' },
    ]);
    expect(files[0].content).toBe('const k: string = "<REDACTED_SECRET_1>";\n');
    expect(files[1].content).toBe('MONGODB_URI=<REDACTED_SECRET_2>\nPORT=3000\n');
  });

  it('leaves clean files byte-for-byte identical and does not mutate input', () => {
    const input = [{ path: 'clean.js', content: "const x = process.env.API_KEY;\nconsole.log('ok');\n" }];
    const copy = JSON.parse(JSON.stringify(input));
    const { files, count } = maskSecrets(input);
    expect(count).toBe(0);
    expect(files).toEqual(copy);
    expect(input).toEqual(copy);
  });
});
