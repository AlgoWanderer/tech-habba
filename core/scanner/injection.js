// Rules: nosql-injection and sql-injection.
// NoSQL: req.body/req.query values (directly or via simple variables) placed into Mongo query
// filters. req.params is always a string in Express, so it cannot carry $ operators and is not a
// NoSQL taint source (it IS for SQL and for $where).
// SQL: query/execute/raw calls whose SQL text is built with template strings or concatenation.
import { walk, isFunction, calleeProp, calleeObjectName, reqChain, propName, makeFinding, previewLines } from '../lib/ast.js';

const MONGO_STRICT = new Set([
  'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'findOneAndRemove',
  'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'replaceOne', 'countDocuments',
]);
const MONGO_LOOSE = new Set(['update', 'remove', 'count', 'exists', 'where', 'distinct']);
const SQL_SINKS = new Set(['query', 'execute', 'raw', 'run', 'all', 'get', 'exec', 'prepare', 'unsafe']);
const SQL_TEXT = /\b(select\s.+\sfrom|insert\s+into|update\s+\S+\s+set|delete\s+from|where\s|values\s*\()/i;
const NOSQL_SRC = new Set(['body', 'query', 'cookies', 'headers']);

/** Collect tainted variable names per function: name -> 'whole' | 'field' | src for SQL. */
function collectTaint(ast) {
  const scopes = new Map(); // fnNode|null -> Map(name -> {kind, src})
  walk(ast, (node, ancestors) => {
    if (node.type !== 'VariableDeclarator' || !node.init) return;
    const chain = reqChain(node.init);
    if (!chain) return;
    const fn = [...ancestors].reverse().find(isFunction) ?? null;
    if (!scopes.has(fn)) scopes.set(fn, new Map());
    const m = scopes.get(fn);
    if (node.id.type === 'Identifier') m.set(node.id.name, { kind: chain.depth === 0 ? 'whole' : 'field', src: chain.src });
    if (node.id.type === 'ObjectPattern') {
      for (const p of node.id.properties) {
        const target = p.type === 'RestElement' ? p.argument : p.value?.type === 'AssignmentPattern' ? p.value.left : p.value;
        if (target?.type === 'Identifier') m.set(target.name, { kind: p.type === 'RestElement' ? 'whole' : 'field', src: chain.src });
      }
    }
  });
  return (name, ancestors) => {
    for (let i = ancestors.length - 1; i >= -1; i -= 1) {
      const fn = i === -1 ? null : ancestors[i];
      if (i !== -1 && !isFunction(fn)) continue;
      const hit = scopes.get(fn)?.get(name);
      if (hit) return hit;
    }
    return null;
  };
}

/** Taint of an expression: {kind, src} or null. */
function taintOf(node, lookup, ancestors) {
  if (!node) return null;
  if (node.type === 'Identifier') return lookup(node.name, ancestors);
  const chain = reqChain(node);
  if (chain) return { kind: chain.depth === 0 ? 'whole' : 'field', src: chain.src };
  if (node.type === 'MemberExpression') {
    const base = taintOf(node.object, lookup, ancestors);
    return base ? { kind: 'field', src: base.src } : null;
  }
  return null;
}

function containsTaint(node, lookup, ancestors, srcs) {
  let hit = false;
  walk(node, (n) => {
    const t = (n.type === 'Identifier' || n.type === 'MemberExpression') && taintOf(n, lookup, ancestors);
    if (t && (!srcs || srcs.has(t.src))) hit = true;
  });
  return hit;
}

/** Walk a Mongo filter object; returns {edits, review, any}. */
function inspectFilter(node, lookup, ancestors, code, state, parentKey = null) {
  if (!node) return;
  if (node.type === 'ArrayExpression') {
    for (const el of node.elements) inspectFilter(el, lookup, ancestors, code, state, parentKey);
    return;
  }
  if (node.type !== 'ObjectExpression') {
    const t = taintOf(node, lookup, ancestors);
    if (!t || !NOSQL_SRC.has(t.src)) return;
    state.any = true;
    // A whole request object, or an operator argument whose type we cannot safely force.
    state.review = true;
    return;
  }
  for (const p of node.properties) {
    if (p.type === 'SpreadElement') {
      if (containsTaint(p.argument, lookup, ancestors, NOSQL_SRC)) Object.assign(state, { any: true, review: true });
      continue;
    }
    const key = p.computed ? null : propName(p.key);
    if (p.computed && containsTaint(p.key, lookup, ancestors, null)) Object.assign(state, { any: true, review: true });
    if (key === '$where' || key === '$function' || key === '$accumulator') {
      if (p.value.type !== 'Literal' && p.value.type !== 'FunctionExpression') {
        Object.assign(state, { any: true, review: true, where: true });
      }
      continue;
    }
    const v = p.value;
    if (v.type === 'ObjectExpression' || v.type === 'ArrayExpression') {
      inspectFilter(v, lookup, ancestors, code, state, key);
      continue;
    }
    const t = taintOf(v, lookup, ancestors);
    if (!t || !NOSQL_SRC.has(t.src)) continue;
    state.any = true;
    const operatorValue = key?.startsWith('$') || parentKey?.startsWith('$');
    if (operatorValue && key !== '$eq') {
      state.review = true;
      continue;
    }
    const src = code.slice(v.start, v.end);
    if (p.shorthand) state.edits.push({ start: p.start, end: p.end, text: `${src}: String(${src})` });
    else state.edits.push({ start: v.start, end: v.end, text: `String(${src})` });
  }
}

function nosql(file, code, call, lookup, ancestors) {
  const method = calleeProp(call);
  if (!MONGO_STRICT.has(method) && !MONGO_LOOSE.has(method)) return null;
  if (MONGO_LOOSE.has(method) && /hash|hmac|cipher|crypto|digest|sign|map|set|cache/i.test(calleeObjectName(call) ?? '')) return null;
  const state = { edits: [], review: false, any: false, where: false };
  call.arguments.forEach((arg, i) => {
    if (arg.type === 'ObjectExpression') inspectFilter(arg, lookup, ancestors, code, state);
    else if (i === 0 && MONGO_STRICT.has(method)) {
      const t = taintOf(arg, lookup, ancestors);
      if (t && NOSQL_SRC.has(t.src)) Object.assign(state, { any: true, review: true });
    }
  });
  if (!state.any) return null;
  const line = call.loc.start.line;
  const auto = !state.review && state.edits.length > 0;
  const fix = auto ? { type: 'edits', edits: state.edits } : null;
  const message = state.where
    ? 'User input reaches a MongoDB $where / server-side JavaScript clause. Needs human review.'
    : auto
      ? 'Request body is passed straight into a MongoDB query (operator injection).'
      : 'Request data is used as a whole MongoDB filter or operator value (operator injection). Needs human review.';
  return makeFinding({
    ruleId: 'nosql-injection', category: 'injection', severity: state.where ? 'critical' : 'high', file, node: call, code, message, fix,
    fixPreview: fix ? previewLines(code, state.edits, line, call.loc.end.line) : undefined,
  });
}

/** Flatten a + concatenation into its operands. */
function concatParts(node) {
  if (node.type === 'BinaryExpression' && node.operator === '+') return [...concatParts(node.left), ...concatParts(node.right)];
  return [node];
}

function sqlText(node) {
  if (node.type === 'TemplateLiteral' && node.expressions.length) return node.quasis.map((q) => q.value.cooked ?? '').join(' ? ');
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const parts = concatParts(node);
    if (parts.every((p) => p.type === 'Literal')) return null;
    return parts.map((p) => (p.type === 'Literal' ? String(p.value) : ' ? ')).join('');
  }
  return null;
}

/** Convert `...${a}...` to a parameterised query. Returns edits or null when not safely possible. */
function parameterise(code, call, tpl, pg) {
  if (call.arguments.length > 2) return null;
  const second = call.arguments[1];
  if (second && second.type !== 'FunctionExpression' && second.type !== 'ArrowFunctionExpression') return null;
  if (/sequelize/i.test(calleeObjectName(call) ?? '')) return null;
  let text = '';
  const params = [];
  for (let i = 0; i < tpl.quasis.length; i += 1) {
    let raw = tpl.quasis[i].value.raw;
    if (i > 0) {
      const prev = text.at(-1);
      if ((prev === "'" || prev === '"') && raw.startsWith(prev)) {
        text = text.slice(0, -1);
        raw = raw.slice(1);
      }
      text += pg ? `$${params.length}` : '?';
    }
    text += raw;
    if (i < tpl.expressions.length) params.push(code.slice(tpl.expressions[i].start, tpl.expressions[i].end));
  }
  // Every placeholder must sit outside a quoted string literal in the SQL.
  const holder = pg ? /\$\d+/g : /\?/g;
  for (const m of text.matchAll(holder)) {
    const quotes = (text.slice(0, m.index).match(/'/g) ?? []).length;
    if (quotes % 2 === 1) return null;
  }
  if (/`/.test(text)) return null;
  return [{ start: tpl.start, end: tpl.end, text: `\`${text}\`, [${params.join(', ')}]` }];
}

function resolveSqlArg(arg, ancestors, decls) {
  if (arg.type !== 'Identifier') return { node: arg, direct: true };
  const d = decls.get(arg.name);
  return d ? { node: d, direct: false } : null;
}

function sql(file, code, call, lookup, ancestors, decls, pg) {
  if (!SQL_SINKS.has(calleeProp(call)) || !call.arguments.length) return null;
  const resolved = resolveSqlArg(call.arguments[0], ancestors, decls);
  if (!resolved) return null;
  const text = sqlText(resolved.node);
  if (!text || !SQL_TEXT.test(text)) return null;
  const tainted = containsTaint(resolved.node, lookup, ancestors, null);
  const edits = resolved.direct && resolved.node.type === 'TemplateLiteral' ? parameterise(code, call, resolved.node, pg) : null;
  const line = call.loc.start.line;
  return makeFinding({
    ruleId: 'sql-injection', category: 'injection', severity: tainted ? 'critical' : 'high', file, node: call, code,
    message: tainted
      ? 'SQL is built from request data with string concatenation / template strings. Use parameterised queries.'
      : 'SQL is built with string concatenation / template strings. Use parameterised queries.',
    fix: edits ? { type: 'edits', edits } : null,
    fixPreview: edits ? previewLines(code, edits, line, call.loc.end.line) : undefined,
  });
}

export function scanInjection(file, code, parsed) {
  if (!parsed) return [];
  const lookup = collectTaint(parsed.ast);
  const decls = new Map();
  walk(parsed.ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) decls.set(n.id.name, n.init);
  });
  const pg = /require\(\s*['"]pg['"]\s*\)|from\s+['"]pg['"]|postgres/i.test(code);
  const out = [];
  walk(parsed.ast, (node, ancestors) => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return;
    const f = nosql(file, code, node, lookup, ancestors) ?? sql(file, code, node, lookup, ancestors, decls, pg);
    if (f) out.push(f);
  });
  return out;
}
