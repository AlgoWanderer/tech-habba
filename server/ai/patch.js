// AI patcher: the model rewrites only the statement (route or function) around one finding.
// Every candidate then goes through the deterministic gate: no masked secret in the output, no
// deleted route, node --check, a rule re-scan (target gone, nothing new critical/high), and for
// AI-found flaws an independent re-check. Anything that fails is rejected, never applied.
import { parse, walk, isFunction } from '../../core/lib/ast.js';
import { verify } from '../verify.js';
import { containsPlaceholder, maskForModel } from './mask.js';

const MAX_SPAN = 120;
const CONTEXT = 10;
const ROUTE = /\b(?:app|router)\.(?:get|post|put|patch|delete|all)\s*\(/g;
export const countRoutes = (code) => (String(code).match(ROUTE) || []).length;

/** Lines [start, end] (1-based, inclusive) to hand to the model for a finding on `line`. */
export function enclosingRange(content, line) {
  const total = content.split('\n').length;
  const window = { start: Math.max(1, line - 5), end: Math.min(total, line + 5) };
  const parsed = parse(content);
  if (!parsed) return window;
  const top = parsed.ast.body.find((n) => n.loc.start.line <= line && line <= n.loc.end.line);
  if (top && top.loc.end.line - top.loc.start.line < MAX_SPAN) return { start: top.loc.start.line, end: top.loc.end.line };
  let best = null;
  walk(parsed.ast, (n) => {
    if (!isFunction(n) || n.loc.start.line > line || line > n.loc.end.line) return;
    const span = n.loc.end.line - n.loc.start.line;
    if (span < MAX_SPAN && (!best || span > best.loc.end.line - best.loc.start.line)) best = n;
  });
  return best ? { start: best.loc.start.line, end: best.loc.end.line } : window;
}

export const PATCH_SYSTEM = `You fix exactly one security flaw in a Node.js / Express file.
You receive the flaw, the lines to rewrite (TARGET) and some surrounding lines (CONTEXT, read-only).
Return JSON {"replacement": "...", "explanation": "..."}:
- replacement = the complete new text for the TARGET lines only, same indentation, no line numbers, no markdown fences.
- Fix the flaw with the smallest change. Keep every route, response shape and feature.
- Secrets go to process.env.NAME. Never output <REDACTED_SECRET_n> placeholders.
- Only use identifiers and packages that already exist in the file (e.g. an existing auth middleware, the existing models).
- Ownership checks: compare the record's owner field with the authenticated user the file already uses (e.g. req.user.id).`;

export const PATCH_SCHEMA = {
  type: 'OBJECT',
  properties: { replacement: { type: 'STRING' }, explanation: { type: 'STRING' } },
  required: ['replacement', 'explanation'],
};

export const RECHECK_SYSTEM = `You check whether one specific security flaw is still present in the code shown.
Return JSON {"fixed": true|false, "reason": "..."}. Say fixed only if the exact flaw described can no longer be exploited.`;

const RECHECK_SCHEMA = {
  type: 'OBJECT',
  properties: { fixed: { type: 'BOOLEAN' }, reason: { type: 'STRING' } },
  required: ['fixed', 'reason'],
};

const stripFences = (s) => String(s ?? '').replace(/^\s*```[a-z]*\n?/i, '').replace(/\n?```\s*$/, '');
const slice = (lines, a, b) => lines.slice(a - 1, b).map((l, i) => `${String(a + i).padStart(4)}| ${l}`).join('\n');

/**
 * aiPatch(core, files, finding, client, { ruleFindings })
 *   -> { result: {findingId, status: "applied"|"rejected", reason, source: "ai"}, patched: {path, original, patched} | null }
 * `files` is the current state (e.g. after rule fixes); `ruleFindings` = rule scan of those files.
 */
export async function aiPatch(core, files, finding, client, { ruleFindings } = {}) {
  const reject = (reason) => ({ result: { findingId: finding.id, status: 'rejected', reason: `AI patch rejected: ${reason}`, source: 'ai' }, patched: null });
  const file = files.find((f) => f.path === finding.file);
  if (!file) return reject('file not found.');

  const lines = file.content.split('\n');
  const { start, end } = enclosingRange(file.content, finding.line);
  const { files: masked } = await maskForModel(core, [file]);
  const mlines = masked[0].content.split('\n');
  const user = [
    `FLAW (${finding.category}, line ${finding.line}): ${finding.message}`,
    `FILE: ${file.path}`,
    `CONTEXT before:\n${slice(mlines, Math.max(1, start - CONTEXT), start - 1) || '(none)'}`,
    `TARGET lines ${start}-${end}:\n${slice(mlines, start, end)}`,
    `CONTEXT after:\n${slice(mlines, end + 1, Math.min(mlines.length, end + CONTEXT)) || '(none)'}`,
  ].join('\n\n');

  let out;
  try {
    out = await client.generateJson(PATCH_SYSTEM, user, PATCH_SCHEMA);
  } catch (e) {
    return reject(`model error (${e.message}).`);
  }
  const replacement = stripFences(out?.replacement).replace(/\s+$/, '');
  if (!replacement.trim()) return reject('empty replacement.');
  if (containsPlaceholder(replacement)) return reject('it contains a masked secret placeholder.');

  const patchedText = [...lines.slice(0, start - 1), ...replacement.split('\n'), ...lines.slice(end)].join('\n');
  if (patchedText === file.content) return reject('it changed nothing.');
  if (countRoutes(patchedText) < countRoutes(file.content)) return reject('it deleted a route.');

  const isRuleTarget = finding.source !== 'ai';
  const [check] = await verify([{ path: file.path, original: file.content, patched: patchedText }], {
    scan: core.scan,
    originalFindings: ruleFindings ?? (await core.scan(files)),
    targets: isRuleTarget ? [finding] : [],
  });
  if (!check.accepted) return reject(check.reason);

  if (!isRuleTarget) {
    const newEnd = start + replacement.split('\n').length - 1;
    const { files: maskedAfter } = await maskForModel(core, [{ path: file.path, content: patchedText }]);
    let re;
    try {
      re = await client.generateJson(RECHECK_SYSTEM, `FLAW: ${finding.message}\n\nCODE:\n${slice(maskedAfter[0].content.split('\n'), start, newEnd)}`, RECHECK_SCHEMA);
    } catch (e) {
      return reject(`re-check failed (${e.message}).`);
    }
    if (!re?.fixed) return reject(`independent re-check says the flaw is still there (${String(re?.reason ?? '').slice(0, 120)}).`);
  }

  return {
    result: { findingId: finding.id, status: 'applied', reason: `AI patch verified (node --check, re-scan${isRuleTarget ? '' : ', re-check'}): ${String(out.explanation ?? '').slice(0, 160)}`, source: 'ai' },
    patched: { path: file.path, original: file.content, patched: patchedText },
  };
}
