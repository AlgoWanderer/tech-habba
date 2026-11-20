// applyFixes(files, findings) -> { patched, envFile, results }
// Deterministic, idempotent string edits at AST offsets. Never adds or removes lines in an existing
// file (so finding ids stay stable), never writes to disk, and re-parses every patched file:
// a file that no longer parses is discarded and its findings are "rejected".
import { parse, applyEdits } from '../lib/ast.js';
import { analyze } from '../scanner/index.js';
import { secretReplacement } from '../scanner/secrets.js';
import { EnvRegistry } from './env.js';
import { middlewareSource, middlewareEnv, middlewarePath, importSpecifier, hasRequireAuthBinding, importEdit } from './auth.js';

const normPath = (p) => String(p ?? '').replace(/\\/g, '/').replace(/^\.\//, '');

const REVIEW_REASON = {
  idor: 'Ownership checks are business logic; flagged for human review.',
  dependency: 'Dependency upgrades change behaviour; run the suggested npm command and re-test.',
  injection: 'Not safely auto-fixable (whole-object filter, operator value, $where or concatenated SQL); needs human review.',
  secret: 'Secret is inside a dynamic template or an unparseable file; move it to an environment variable by hand.',
  auth: 'Needs human review.',
};

function reviewReason(f) {
  const base = REVIEW_REASON[f.category] ?? 'Needs human review; SlopStop does not auto-fix this.';
  return f.category === 'dependency' && f.fixPreview ? `${base} Suggested: ${f.fixPreview}.` : base;
}

function appliedReason(f, envNames, mw) {
  if (f.category === 'secret') return `Replaced with process.env.${envNames.join(', process.env.')}; value moved to .env.`;
  if (f.category === 'auth') return `Added requireAuth middleware (${mw}).`;
  if (f.ruleId === 'sql-injection') return 'Converted to a parameterised query.';
  return 'Cast request values with String() so objects with $ operators cannot reach the query.';
}

const parts = (fix) => (fix.type === 'multi' ? fix.parts : [fix]);
const overlaps = (a, b) => a.start < b.end && b.start < a.end || (a.start === a.end && a.start === b.start && b.start === b.end);

function projectInfo(files) {
  const pkg = files.find((f) => /(?:^|\/)package\.json$/.test(f.path) && !f.path.includes('node_modules/'));
  let pkgJson = {};
  try {
    pkgJson = pkg ? JSON.parse(pkg.content) : {};
  } catch {
    /* ignore */
  }
  const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const jwt = 'jsonwebtoken' in deps || files.some((f) => /['"]jsonwebtoken['"]/.test(f.content));
  return { typeModule: pkgJson.type === 'module', jwt };
}

export function applyFixes(files, findings) {
  const list = (Array.isArray(files) ? files : []).map((f) => ({ path: normPath(f.path), content: String(f.content ?? '') }));
  const ids = [...new Set((findings ?? []).map((f) => (typeof f === 'string' ? f : f?.id)).filter(Boolean))];
  const fresh = new Map(analyze(list).map((f) => [f.id, f]));
  const results = new Map();
  const byFile = new Map();

  for (const id of ids) {
    const f = fresh.get(id);
    if (!f) results.set(id, { findingId: id, status: 'rejected', reason: 'Finding not present in a fresh scan of these files (already fixed?).' });
    else if (f.fixable !== 'auto' || !f._fix) results.set(id, { findingId: id, status: 'review', reason: reviewReason(f) });
    else {
      if (!byFile.has(f.file)) byFile.set(f.file, []);
      byFile.get(f.file).push(f);
    }
  }

  const env = new EnvRegistry();
  const info = projectInfo(list);
  const mw = middlewarePath(list.map((f) => f.path));
  const patched = [];
  const needsMw = [];
  let jwtEnv = null; // env var that now holds the app's jwt.sign/verify secret

  for (const [path, fs] of byFile) {
    const file = list.find((x) => x.path === path);
    const parsed = parse(file.content);
    if (!parsed) {
      for (const f of fs) results.set(f.id, { findingId: f.id, status: 'rejected', reason: 'File does not parse; nothing was changed.' });
      continue;
    }
    const edits = [];
    const accepted = [];
    const snapshot = new Map(env.vars);
    for (const f of fs) {
      const mine = [];
      const envNames = [];
      for (const p of parts(f._fix)) {
        if (p.type === 'secret') {
          const name = env.claim(p.envName, p.value);
          envNames.push(name);
          if (p.jwt) jwtEnv ??= name;
          mine.push({ start: p.start, end: p.end, text: secretReplacement(file.content, p.start, p.end, name) });
        } else mine.push(...p.edits);
      }
      if (mine.some((e) => edits.some((o) => overlaps(e, o)))) {
        results.set(f.id, { findingId: f.id, status: 'rejected', reason: 'Overlaps another fix on the same code; run Fix again after applying.' });
        continue;
      }
      edits.push(...mine);
      accepted.push({ f, envNames });
    }
    const usesAuth = accepted.some(({ f }) => f.category === 'auth');
    if (usesAuth && !hasRequireAuthBinding(parsed.ast)) {
      edits.push(importEdit(parsed.ast, parsed.esm || /\.mjs$/.test(path), importSpecifier(path, mw.path)));
    }
    const out = applyEdits(file.content, edits);
    const check = parse(out);
    if (!check) {
      env.vars = snapshot;
      for (const { f } of accepted) results.set(f.id, { findingId: f.id, status: 'rejected', reason: 'Patched file failed to parse; patch discarded.' });
      continue;
    }
    if (out !== file.content) patched.push({ path, original: file.content, patched: out });
    if (usesAuth) needsMw.push(parsed.esm || /\.mjs$/.test(path));
    for (const { f, envNames } of accepted) {
      results.set(f.id, { findingId: f.id, status: 'applied', reason: appliedReason(f, envNames, mw.path) });
    }
  }

  if (needsMw.length && !mw.exists) {
    const kind = info.jwt ? 'jwt' : 'token';
    const esm = info.typeModule || needsMw.every(Boolean);
    const envName = kind === 'jwt' && jwtEnv ? jwtEnv : middlewareEnv(kind);
    patched.push({ path: mw.path, original: '', patched: middlewareSource(kind, esm, envName) });
    env.placeholder(envName);
  }

  if (env.size) {
    const existing = list.find((f) => f.path === '.env.example');
    const example = env.envExample(existing?.content ?? '');
    if (example !== (existing?.content ?? '')) patched.push({ path: '.env.example', original: existing?.content ?? '', patched: example });
  }

  return { patched, envFile: env.envFile(), results: ids.map((id) => results.get(id)) };
}
