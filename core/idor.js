// Rule: idor-suspect. Routes that load a resource by a req.params id with no ownership check.
// Ownership is business logic, so this is always fixable "review": we suggest an ownership check
// as fixPreview (see idorFix.js) but never apply it.
import { walk, isFunction, calleeProp, reqChain, makeFinding, lineAt, previewLines } from './lib/ast.js';
import { extractRoutes } from './scanner/routes.js';
import { ownerField, authProp, suggestOwnershipCall } from './idorFix.js';

const LOOKUPS = new Set([
  'findById', 'findByIdAndUpdate', 'findByIdAndDelete', 'findByIdAndRemove', 'findOne', 'findOneAndUpdate',
  'findOneAndDelete', 'updateOne', 'deleteOne', 'replaceOne', 'findUnique', 'findFirst', 'findByPk', 'update',
  'destroy', 'query', 'execute', 'doc',
]);
const OWNERSHIP = /req\.(?:user|auth|session|userId|currentUser)\b|res\.locals\.(?:user|auth)|currentUser|getServerSession|\bctx\.user\b/;
const ID_PARAM = /:(\w*id)\b/gi;

/** Names bound from req.params inside fn: `const { id } = req.params`, `const id = req.params.id`. */
function paramAliases(fn, params) {
  const names = new Set();
  walk(fn.body, (n) => {
    if (n.type !== 'VariableDeclarator' || !n.init) return;
    const chain = reqChain(n.init);
    if (!chain || chain.src !== 'params') return;
    if (n.id.type === 'Identifier' && chain.depth === 1 && params.has(n.init.property.name)) names.add(n.id.name);
    if (n.id.type === 'ObjectPattern' && chain.depth === 0) {
      for (const p of n.id.properties) {
        const key = p.key?.name ?? p.key?.value;
        if (p.type === 'Property' && params.has(key) && p.value.type === 'Identifier') names.add(p.value.name);
      }
    }
  });
  return names;
}

function usesParam(node, params, aliases) {
  let hit = false;
  walk(node, (n) => {
    if (n.type === 'Identifier' && aliases.has(n.name)) hit = true;
    const chain = reqChain(n);
    if (chain?.src === 'params' && chain.depth === 1 && params.has(n.property.name)) hit = true;
  });
  return hit;
}

export function scanIdor(file, code, parsed) {
  if (!parsed) return [];
  const { routes } = extractRoutes(parsed.ast, code);
  const out = [];
  let hints = null; // owner field + auth prop, computed once per file when first needed
  for (const r of routes) {
    const params = new Set([...r.path.matchAll(ID_PARAM)].map((m) => m[1]));
    if (!params.size || !isFunction(r.handler)) continue;
    const body = code.slice(r.handler.start, r.handler.end);
    if (OWNERSHIP.test(body)) continue;
    const aliases = paramAliases(r.handler, params);
    let lookup = null;
    walk(r.handler.body, (n) => {
      if (lookup || n.type !== 'CallExpression') return;
      const m = calleeProp(n) ?? (n.callee.type === 'Identifier' ? n.callee.name : null);
      if (LOOKUPS.has(m) && n.arguments.some((a) => usesParam(a, params, aliases))) lookup = n;
    });
    if (!lookup) continue;
    const line = r.call.loc.start.line;

    hints ??= { owner: ownerField(parsed.ast), prop: authProp(parsed.ast, code) };
    const req = r.handler.params[0]?.type === 'Identifier' ? r.handler.params[0].name : 'req';
    const suggestion = lookup.callee.type === 'MemberExpression' ? suggestOwnershipCall(lookup, code, { ...hints, req }) : null;
    const l = lookup.loc.start.line;
    const fixPreview = suggestion ? previewLines(code, [{ start: lookup.start, end: lookup.end, text: suggestion }], l, l) : undefined;
    out.push(
      makeFinding({
        ruleId: 'idor-suspect',
        category: 'idor',
        severity: 'medium',
        file,
        node: r.call,
        code,
        snippet: lineAt(code, line).trim(),
        message: 'Resource is looked up by id with no ownership check (possible IDOR). Needs human review.',
        fixPreview,
      }),
    );
  }
  return out;
}
