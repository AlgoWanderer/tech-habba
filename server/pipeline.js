// scan -> applyFixes -> verify -> rescan. Pure functions over a core object, so the server,
// the CLI and the benchmark (role C) can all reuse them.
import { performance } from 'node:perf_hooks';
import { verify } from './verify.js';

/**
 * Keeps variable names, drops values: `STRIPE_KEY=sk_live_...` -> `STRIPE_KEY=`.
 * The secrets the fixer just removed from the code must never travel back to the browser.
 */
export function blankEnvValues(envFile) {
  return String(envFile ?? '')
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      return m ? `${m[1]}=` : line;
    })
    .join('\n');
}

export async function runScan(core, files) {
  const findings = await core.scan(files);
  return { findings, score: await core.computeScore(findings) };
}

export async function runFix(core, files, findingIds) {
  if (core.isMock) return core.sampleFix();
  const t0 = performance.now();

  const findings = await core.scan(files);
  const byId = new Map(findings.map((f) => [f.id, f]));
  const ids = [...new Set(findingIds)];
  const results = new Map();
  const toFix = [];

  for (const id of ids) {
    const f = byId.get(id);
    if (!f) results.set(id, { findingId: id, status: 'rejected', reason: 'Finding not present in a fresh scan of these files.' });
    else if (f.fixable !== 'auto') results.set(id, { findingId: id, status: 'review', reason: 'Needs human review; SlopStop does not auto-fix this.' });
    else toFix.push(f);
  }

  let patched = [];
  let envFile = '';
  if (toFix.length) {
    const out = await core.applyFixes(files, toFix);
    patched = out?.patched ?? [];
    envFile = out?.envFile ?? '';
    for (const r of out?.results ?? []) {
      if (toFix.some((f) => f.id === r.findingId)) results.set(r.findingId, { findingId: r.findingId, status: r.status, reason: r.reason ?? '' });
    }
  }

  const checks = await verify(patched, { scan: core.scan, originalFindings: findings, targets: toFix });
  const checkByPath = new Map(checks.map((c) => [c.path, c]));
  const accepted = patched.filter((p) => checkByPath.get(p.path)?.accepted);

  for (const f of toFix) {
    const c = checkByPath.get(f.file);
    const r = results.get(f.id) ?? { findingId: f.id, status: 'applied', reason: '' };
    if (r.status === 'applied') {
      if (!c) Object.assign(r, { status: 'rejected', reason: 'Fixer produced no patch for this file.' });
      else if (!c.accepted) Object.assign(r, { status: 'rejected', reason: `${c.reason} Patch discarded.` });
      else if (!r.reason) r.reason = c.reason;
    }
    results.set(f.id, r);
  }

  const merged = files.map((f) => {
    const p = accepted.find((a) => a.path === f.path);
    return p ? { path: f.path, content: p.patched } : f;
  });
  for (const p of accepted) if (!files.some((f) => f.path === p.path)) merged.push({ path: p.path, content: p.patched });

  const rescan = await runScan(core, merged);
  return {
    patched: accepted,
    envFile: accepted.length ? blankEnvValues(envFile) : '',
    results: ids.map((id) => results.get(id)),
    rescan,
    timingMs: Math.round(performance.now() - t0),
  };
}
