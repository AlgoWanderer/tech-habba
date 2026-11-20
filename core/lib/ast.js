// Shared AST helpers: parsing with acorn, a tiny walker, request-taint helpers, Finding builder.
import * as acorn from 'acorn';

const BASE = {
  ecmaVersion: 'latest',
  locations: true,
  allowHashBang: true,
  allowReturnOutsideFunction: true,
  allowAwaitOutsideFunction: true,
  allowImportExportEverywhere: true,
};

export const JS_FILE = /\.(?:c|m)?jsx?$/i;

/** Parse JS (module first, then script). Returns {ast, esm} or null if it does not parse. */
export function parse(code) {
  for (const sourceType of ['module', 'script']) {
    try {
      const ast = acorn.parse(code, { ...BASE, sourceType });
      const esm = ast.body.some((n) => /^(Import|Export)/.test(n.type));
      return { ast, esm };
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Depth-first walk in source order. visit(node, ancestors) */
export function walk(node, visit, ancestors = []) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, ancestors);
  ancestors.push(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'type' || key === 'start' || key === 'end') continue;
    const v = node[key];
    if (Array.isArray(v)) for (const c of v) walk(c, visit, ancestors);
    else if (v && typeof v.type === 'string') walk(v, visit, ancestors);
  }
  ancestors.pop();
}

export const isFunction = (n) =>
  n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'FunctionDeclaration');

/** Name of a non-computed member property or a literal key. */
export function propName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

export function calleeProp(call) {
  const c = call.callee;
  return c && c.type === 'MemberExpression' && !c.computed ? c.property.name : null;
}

export function calleeObjectName(call) {
  const o = call.callee?.object;
  if (!o) return null;
  if (o.type === 'Identifier') return o.name;
  if (o.type === 'MemberExpression') return propName(o.property);
  if (o.type === 'CallExpression') return calleeObjectName(o) ?? o.callee?.name ?? null;
  return null;
}

const REQ = new Set(['req', 'request']);

/** 'body' | 'query' | 'params' | ... if node is exactly req.<src>, else null. */
export function reqSource(node) {
  if (node?.type !== 'MemberExpression' || node.computed) return null;
  if (node.object.type !== 'Identifier' || !REQ.has(node.object.name)) return null;
  return node.property.name;
}

/** Returns {src, depth} if node is req.<src>(.x)*, else null. depth 0 = whole object. */
export function reqChain(node) {
  let depth = 0;
  let n = node;
  while (n?.type === 'MemberExpression') {
    const s = reqSource(n);
    if (s) return { src: s, depth };
    n = n.object;
    depth += 1;
  }
  return null;
}

export function stringValue(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

/** Build a contract-exact Finding plus hidden fix data (stripped by scan()). */
export function makeFinding({ ruleId, category, severity, file, node, line, endLine, code, message, snippet, fix, fixPreview }) {
  const l = line ?? node.loc.start.line;
  const e = endLine ?? node?.loc.end.line ?? l;
  const f = {
    id: `${ruleId}:${file}:${l}`,
    ruleId,
    category,
    severity,
    file,
    line: l,
    endLine: e,
    snippet: snippet ?? lineAt(code, l).trim(),
    message,
    fixable: fix ? 'auto' : 'review',
  };
  if (fixPreview) f.fixPreview = fixPreview;
  if (fix) Object.defineProperty(f, '_fix', { value: fix, enumerable: false });
  return f;
}

export function lineAt(code, line) {
  return (code ?? '').split(/\r?\n/)[line - 1] ?? '';
}

/** Apply [{start,end,text}] edits (non-overlapping) to code. */
export function applyEdits(code, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = code;
  for (const e of sorted) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** Patched text of the finding's lines, for fixPreview. Edits must not add newlines. */
export function previewLines(code, edits, line, endLine) {
  const patched = applyEdits(code, edits).split(/\r?\n/);
  return patched.slice(line - 1, endLine).map((s) => s.trim()).join('\n').slice(0, 400);
}
