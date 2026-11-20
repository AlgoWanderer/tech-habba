// Modes: "rules" (deterministic, unchanged), "ai" (model only), "hybrid" (rules + model, every
// model patch verified). Rule findings always win over overlapping AI findings.
import { performance } from 'node:perf_hooks';
import { runFix, runScan } from '../pipeline.js';
import { aiDetect, CATEGORIES } from './detect.js';
import { aiPatch } from './patch.js';

export const SCAN_MODES = ['rules', 'ai', 'hybrid'];
export const FIX_MODES = ['rules', 'hybrid'];
const MAX_AI_PATCHES = 10;

/** Fallback for core's mergeFindings (role A). Same rule: same file + category, line within 1 -> rule wins. */
export function mergeLocal(ruleFindings, aiFindings) {
  const rules = ruleFindings.map((f) => ({ ...f, source: f.source ?? 'rule' }));
  const ai = aiFindings.filter((a) => !rules.some((r) => r.file === a.file && r.category === a.category && Math.abs(r.line - a.line) <= 1));
  return [...rules, ...ai].sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line);
}

const merge = (core, rules, ai) => (typeof core.mergeFindings === 'function' ? core.mergeFindings(rules, ai) : mergeLocal(rules, ai));

export async function scanWithMode(core, files, mode, client) {
  if (mode === 'rules') return runScan(core, files);
  const ai = await aiDetect(core, files, client);
  const findings = mode === 'ai' ? ai : merge(core, await core.scan(files), ai);
  return { findings, score: await core.computeScore(findings) };
}

/** Finds a finding's line again in changed code by its snippet (closest match to the old line). */
function relocate(finding, files) {
  const file = files.find((f) => f.path === finding.file);
  if (!file) return null;
  const want = finding.snippet.trim();
  let best = null;
  file.content.split('\n').forEach((l, i) => {
    if (l.trim() === want && (best === null || Math.abs(i + 1 - finding.line) < Math.abs(best - finding.line))) best = i + 1;
  });
  return best === null ? null : { ...finding, line: best, endLine: best };
}

/** AI findings sent back by the client: keep only well-formed ones whose snippet is really in the code. */
export function sanitizeAiFindings(list, files) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((f) => f && typeof f.id === 'string' && f.id.startsWith('ai-') && CATEGORIES.includes(f.category) && typeof f.snippet === 'string' && typeof f.file === 'string')
    .map((f) => relocate({ ...f, source: 'ai', fixable: 'review', line: Number(f.line) || 1 }, files))
    .filter(Boolean);
}

/**
 * fixHybrid(core, files, ids, client, { aiFindings })
 * 1. rule fixes exactly as in rules mode (verified);  2. the model patches every requested finding the
 * rules left for review, one at a time on top of the result, each verified;  3. rescan.
 */
export async function fixHybrid(core, files, ids, client, { aiFindings, httpTest = false } = {}) {
  const t0 = performance.now();
  const ai = sanitizeAiFindings(aiFindings, files);
  const aiById = new Map(ai.map((f) => [f.id, f]));
  const ruleIds = ids.filter((id) => !id.startsWith('ai-'));

  const base = await runFix(core, files, ruleIds, { httpTest });
  const results = new Map(base.results.map((r) => [r.findingId, { ...r, source: 'rule' }]));
  let current = files.map((f) => ({ ...f }));
  for (const p of base.patched) {
    const i = current.findIndex((f) => f.path === p.path);
    if (i >= 0) current[i] = { path: p.path, content: p.patched };
    else current.push({ path: p.path, content: p.patched });
  }

  const before = await core.scan(files);
  // Rule findings left for review are only offered to the model when they sit in a JavaScript file
  // (package.json dependency findings, for example, stay "review": upgrading is a human decision).
  const patchable = (f) => /\.(c|m)?js$/i.test(f.file);
  const queue = [
    ...ruleIds.filter((id) => results.get(id)?.status === 'review').map((id) => before.find((f) => f.id === id)).filter((f) => f && patchable(f)),
    ...ids.filter((id) => id.startsWith('ai-')).map((id) => aiById.get(id) ?? (results.set(id, { findingId: id, status: 'rejected', reason: 'AI finding not provided or no longer in the code.', source: 'ai' }), null)).filter(Boolean),
  ];

  const leftAi = [];
  for (const [n, f] of queue.entries()) {
    if (n >= MAX_AI_PATCHES) {
      results.set(f.id, { findingId: f.id, status: 'review', reason: `Not attempted: at most ${MAX_AI_PATCHES} AI patches per request.`, source: f.source ?? 'rule' });
      if (f.source === 'ai') leftAi.push(f);
      continue;
    }
    const target = relocate(f, current);
    if (!target) {
      results.set(f.id, { findingId: f.id, status: 'rejected', reason: 'AI patch skipped: the code around this finding changed.', source: 'ai' });
      continue;
    }
    const ruleFindings = await core.scan(current);
    const live = f.source === 'ai' ? target : ruleFindings.find((r) => r.ruleId === f.ruleId && r.file === f.file && r.snippet.trim() === f.snippet.trim()) ?? target;
    const r = await aiPatch(core, current, live, client, { ruleFindings, httpTest });
    results.set(f.id, { ...r.result, findingId: f.id });
    if (r.patched) current = current.map((c) => (c.path === r.patched.path ? { path: c.path, content: r.patched.patched } : c));
    else if (f.source === 'ai') leftAi.push(f);
  }

  const patched = current
    .map((c) => ({ path: c.path, original: files.find((f) => f.path === c.path)?.content ?? '', patched: c.content }))
    .filter((p) => p.patched !== p.original);
  const carried = leftAi.map((f) => relocate(f, current)).filter(Boolean);
  // A rule finding whose fix the HTTP test proved (IDOR pattern not recognised, behaviour verified) is not
  // reported again for the same route.
  const proven = queue.filter((f) => results.get(f.id)?.status === 'applied' && /HTTP test proved it works/.test(results.get(f.id)?.reason ?? ''));
  const ruleAfter = (await core.scan(current)).filter((r) => !proven.some((p) => p.ruleId === r.ruleId && p.file === r.file && p.snippet.trim() === r.snippet.trim()));
  const findings = merge(core, ruleAfter, carried);
  return {
    patched,
    envFile: base.envFile,
    results: ids.map((id) => results.get(id) ?? { findingId: id, status: 'rejected', reason: 'Unknown finding id.', source: 'rule' }),
    rescan: { findings, score: await core.computeScore(findings) },
    timingMs: Math.round(performance.now() - t0),
  };
}
