// Runs every rule over the submitted files.
//   analyze(files) -> findings that still carry hidden `_fix` plans (used by the fixer)
//   scan(files)    -> plain contract Findings
import { parse, JS_FILE } from '../lib/ast.js';
import { scanSecrets, scanSecretsRegex } from './secrets.js';
import { scanInjection } from './injection.js';
import { scanAuth } from './auth.js';
import { isAuditFile, parseAudit } from './deps.js';
import { scanPackageJson } from './advisories.js';
import { scanIdor } from '../idor.js';

const TS_FILE = /\.(?:c|m)?tsx?$/i;
const SKIP = /(?:^|\/)(?:node_modules|dist|build|coverage|\.git)\//;
const FIELDS = ['id', 'ruleId', 'category', 'severity', 'file', 'line', 'endLine', 'snippet', 'message', 'fixable', 'fixPreview'];

const normPath = (p) => String(p ?? '').replace(/\\/g, '/').replace(/^\.\//, '');

function scanFile(file, code) {
  if (TS_FILE.test(file)) return scanSecretsRegex(file, code);
  if (!JS_FILE.test(file)) return [];
  const parsed = parse(code);
  if (!parsed) return scanSecretsRegex(file, code);
  return [...scanSecrets(file, code, parsed), ...scanInjection(file, code, parsed), ...scanAuth(file, code, parsed), ...scanIdor(file, code, parsed)];
}

/** Merge findings that share an id (same rule on the same line): fixes are combined. */
function dedupe(findings) {
  const byId = new Map();
  for (const f of findings) {
    const prev = byId.get(f.id);
    if (!prev) {
      byId.set(f.id, f);
      continue;
    }
    const fixes = [prev._fix, f._fix];
    if (fixes.every(Boolean)) {
      Object.defineProperty(prev, '_fix', { value: { type: 'multi', parts: fixes.flatMap((x) => (x.type === 'multi' ? x.parts : [x])) } });
      delete prev.fixPreview;
    } else if (prev.fixable === 'auto') {
      prev.fixable = 'review';
      delete prev.fixPreview;
      Object.defineProperty(prev, '_fix', { value: null });
    }
  }
  return [...byId.values()];
}

export function analyze(files, options = {}) {
  const list = (Array.isArray(files) ? files : []).map((f) => ({ path: normPath(f.path), content: String(f.content ?? '') }));
  const findings = [];
  const isPkg = (f) => /(?:^|\/)package\.json$/.test(f.path) && !SKIP.test(f.path);
  const pkg = list.find(isPkg);
  let audited = Boolean(options.audit);
  for (const f of list) {
    if (SKIP.test(f.path)) continue;
    if (/\.json$/i.test(f.path)) {
      if (isAuditFile(f.path, f.content)) {
        audited = true;
        findings.push(...parseAudit(f.content, pkg?.content, pkg?.path ?? 'package.json'));
      }
      continue;
    }
    findings.push(...scanFile(f.path, f.content));
  }
  if (options.audit) findings.push(...parseAudit(options.audit, pkg?.content, pkg?.path ?? 'package.json'));
  // No npm audit output supplied: fall back to the built-in advisory list.
  if (!audited) for (const f of list.filter(isPkg)) findings.push(...scanPackageJson(f.path, f.content));
  const out = dedupe(findings);
  out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.ruleId.localeCompare(b.ruleId));
  return out;
}

/** Strip to the exact contract shape (no hidden fields, no undefined). */
export function toContract(f) {
  const o = {};
  for (const k of FIELDS) if (f[k] !== undefined) o[k] = f[k];
  return o;
}

export function scan(files, options) {
  return analyze(files, options).map(toContract);
}
