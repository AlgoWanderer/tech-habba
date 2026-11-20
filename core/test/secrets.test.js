import { describe, it, expect } from 'vitest';
import { rules } from './helpers.js';
import { entropy, toEnvName } from '../scanner/secrets.js';

const sec = (code, path) => rules(code, 'secret-hardcoded', path);

describe('secret-hardcoded', () => {
  it('flags known key shapes with contract-exact findings', () => {
    const [f] = sec('const STRIPE_KEY = "sk_live_EXAMPLEEXAMPLEEXAMPLE";\n');
    expect(f).toEqual({
      id: 'secret-hardcoded:app.js:1',
      ruleId: 'secret-hardcoded',
      category: 'secret',
      severity: 'critical',
      file: 'app.js',
      line: 1,
      endLine: 1,
      snippet: 'const STRIPE_KEY = "sk_liv…[redacted]";',
      message: 'Hard-coded API key. Move it to an environment variable.',
      fixable: 'auto',
      fixPreview: 'const STRIPE_KEY = process.env.STRIPE_KEY;',
    });
  });

  it.each([
    ['const k = "AKIAABCDEFGHIJKLMNOP";', 'AWS_ACCESS_KEY_ID'],
    ['const openai = new OpenAI({ apiKey: "sk-proj-abcdefghijklmnopqrstuvwxyz123456" });', 'API_KEY'],
    ['mongoose.connect("mongodb+srv://admin:hunter2@cluster0.mongodb.net/app");', 'MONGODB_URI'],
    ['const pool = new Pool({ connectionString: "postgres://u:p4ss@db:5432/x" });', 'CONNECTION_STRING'],
  ])('flags %s', (code, env) => {
    const [f] = sec(code);
    expect(f.fixPreview).toContain(`process.env.${env}`);
  });

  it('flags literal jwt secrets regardless of entropy', () => {
    expect(sec("jwt.sign(payload, 'secret123')")).toHaveLength(1);
  });

  it('replaces a process.env fallback as a whole', () => {
    const [f] = sec("const JWT_SECRET = process.env.JWT_SECRET || 'devsecret123';");
    expect(f.fixPreview).toBe('const JWT_SECRET = process.env.JWT_SECRET;');
  });

  it('flags high-entropy strings in key/token names only', () => {
    expect(sec("const apiToken = 'f9A2kLq81ZpXv0Rt7YwE3mNc';")).toHaveLength(1);
    expect(sec("const tokenKey = 'auth_token';")).toHaveLength(0);
  });

  it('ignores placeholders, public keys, urls without credentials, messages', () => {
    const code = [
      "const password = 'changeme';",
      "const STRIPE_PUBLISHABLE_KEY = 'pk_live_abcdefghijklmnop';",
      "const MONGO_URI = 'mongodb://localhost:27017/app';",
      "const secretMessage = 'the token is invalid';",
      'const apiKey = process.env.API_KEY;',
      "const express = require('express');",
    ].join('\n');
    expect(sec(code)).toEqual([]);
  });

  it('falls back to regex (review) for unparseable files', () => {
    const [f] = sec('const k: string = "sk_live_EXAMPLEEXAMPLEEXAMPLE";', 'app.ts');
    expect(f.fixable).toBe('review');
  });

  it('helpers', () => {
    expect(toEnvName('stripeSecretKey')).toBe('STRIPE_SECRET_KEY');
    expect(entropy('aaaa')).toBe(0);
  });
});
