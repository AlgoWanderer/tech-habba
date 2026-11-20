// Verification gate: every candidate patch must pass `node --check` and a re-scan before it is
// accepted. A patch that fails either check is rejected with a human-readable reason.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SYNTAX_CHECKABLE = /\.(?:c|m)?js$/i;
const BLOCKING = new Set(['critical', 'high']);

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const fingerprint = (f) => `${f.ruleId}|${f.file}|${norm(f.snippet)}`;

function looksLikeEsm(code) {
  return /^\s*(?:import\s*[\w{*'"]|export\s)/m.test(code) || /\bimport\.meta\b/.test(code);
}

/** Runs `node --check` on the code in a throwaway file. Never executes the code. */
export function checkSyntax(code, dir, label = 'file.js') {
  const file = path.join(dir, `check-${Math.random().toString(36).slice(2)}${looksLikeEsm(code) ? '.mjs' : '.cjs'}`);
  writeFileSync(file, code);
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 3000 });
  if (r.error) {
    return { ok: false, error: r.error.code === 'ETIMEDOUT' ? 'node --check timed out' : r.error.message };
  }
  if (r.status !== 0) {
    const lines = (r.stderr || '').split(/\r?\n/).filter(Boolean);
    const msg = lines.find((l) => /Error/.test(l)) ?? lines[0] ?? 'syntax error';
    return { ok: false, error: msg.split(file).join(label).trim() };
  }
  return { ok: true };
}

/**
 * verify(patched, { scan, originalFindings, targets })
 *   patched:          [{path, original, patched}]
 *   scan:             core scan(files) -> Finding[]; if omitted only the syntax check runs
 *   originalFindings: findings from the scan before patching (to spot newly introduced ones)
 *   targets:          the findings these patches were meant to fix
 * Returns one entry per patch: {path, accepted, reason, syntax, remaining, introduced}.
 */
export async function verify(patched, { scan, originalFindings = [], targets = [] } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'slopstop-verify-'));
  try {
    const out = [];
    for (const p of patched) {
      const res = { path: p.path, accepted: true, reason: 'Passed node --check and re-scan.', syntax: 'skipped', remaining: [], introduced: [] };
      out.push(res);

      if (SYNTAX_CHECKABLE.test(p.path)) {
        const s = checkSyntax(p.patched, dir, p.path);
        res.syntax = s.ok ? 'ok' : 'failed';
        if (!s.ok) {
          res.accepted = false;
          res.reason = `node --check failed: ${s.error}`;
          continue;
        }
      }
      if (!scan) continue;

      const after = await scan([{ path: p.path, content: p.patched }]);
      const beforeKeys = new Set(originalFindings.filter((f) => f.file === p.path).map(fingerprint));
      const afterIds = new Set(after.map((f) => f.id));
      const afterKeys = new Set(after.map(fingerprint));

      res.remaining = targets
        .filter((t) => t.file === p.path && (afterIds.has(t.id) || afterKeys.has(fingerprint(t))))
        .map((t) => t.id);
      res.introduced = after
        .filter((f) => BLOCKING.has(f.severity) && !beforeKeys.has(fingerprint(f)))
        .map((f) => f.id);

      if (res.remaining.length) {
        res.accepted = false;
        res.reason = `Re-scan still finds: ${res.remaining.join(', ')}.`;
      } else if (res.introduced.length) {
        res.accepted = false;
        res.reason = `Patch introduced new critical/high finding(s): ${res.introduced.join(', ')}.`;
      }
    }
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
