// A tiny deterministic stand-in for role A's core, used only by server tests so the pipeline
// can be tested before the real engine exists. It follows the contract shapes exactly.
import { contractScore } from '../coreAdapter.js';

const SECRET = /(["'])(sk_live_[A-Za-z0-9]+)\1/;
const INJECTION = /findOne\(\s*req\.body\s*\)/;

function finding(ruleId, category, severity, file, line, snippet, fixable, message) {
  return { id: `${ruleId}:${file}:${line}`, ruleId, category, severity, file, line, endLine: line, snippet: snippet.trim(), message, fixable };
}

export function makeFakeCore({ breakInjectionFix = false, injectionFixAddsSecret = false } = {}) {
  const scan = async (files) =>
    files.flatMap((f) =>
      f.content.split('\n').flatMap((text, i) => {
        const out = [];
        if (SECRET.test(text)) out.push(finding('secret-hardcoded', 'secret', 'critical', f.path, i + 1, text, 'auto', 'Hard-coded API key.'));
        if (INJECTION.test(text)) out.push(finding('nosql-injection', 'injection', 'high', f.path, i + 1, text, 'auto', 'Request body passed into a query.'));
        if (/req\.params\.id/.test(text)) out.push(finding('idor-suspect', 'idor', 'medium', f.path, i + 1, text, 'review', 'No ownership check.'));
        return out;
      }),
    );

  const applyFixes = async (files, findings) => {
    const patched = [];
    const results = [];
    let envFile = '';
    for (const file of files) {
      const mine = findings.filter((f) => f.file === file.path);
      if (!mine.length) continue;
      let code = file.content;
      for (const f of mine) {
        if (f.ruleId === 'secret-hardcoded') {
          code = code.replace(SECRET, 'process.env.STRIPE_KEY');
          envFile += 'STRIPE_KEY=\n';
        }
        if (f.ruleId === 'nosql-injection') {
          let fix = breakInjectionFix ? 'findOne({ email: String(req.body.email) ' : 'findOne({ email: String(req.body.email) })';
          if (injectionFixAddsSecret) fix += '; const k = "sk_live_NEWLEAK123"';
          code = code.replace(INJECTION, fix);
        }
        results.push({ findingId: f.id, status: 'applied', reason: '' });
      }
      patched.push({ path: file.path, original: file.content, patched: code });
    }
    return { patched, envFile, results };
  };

  return { isMock: false, scan, computeScore: async (f) => contractScore(f), applyFixes };
}

export const SAMPLE_FILES = [
  { path: 'a.js', content: 'const express = require("express");\nconst KEY = "sk_live_ABCDEF123456";\nmodule.exports = KEY;\n' },
  {
    path: 'b.js',
    content: [
      'const app = require("express")();',
      'app.post("/login", async (req, res) => {',
      '  const user = await User.findOne(req.body);',
      '  res.json(user);',
      '});',
      'app.get("/orders/:id", async (req, res) => res.json(await Order.findById(req.params.id)));',
      '',
    ].join('\n'),
  },
];
