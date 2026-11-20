// Suggested ownership check for idor-suspect findings (Phase 2 A1b).
// Produces a fixPreview only; IDOR stays fixable "review" and is never auto-applied, because which
// field holds the owner is business logic. Example:
//   Loan.findById(req.params.id) -> Loan.findOne({ _id: req.params.id, memberId: req.member.id })
import { walk, isFunction, calleeProp, propName } from './lib/ast.js';
import { AUTH_NAME, isAuthMiddlewareFn } from './scanner/routes.js';

const OWNER_FIELD = /^(user|owner|member|author|customer|patient|account)Id$/i;
const BY_ID = { findById: 'findOne', findByIdAndUpdate: 'findOneAndUpdate', findByIdAndDelete: 'findOneAndDelete', findByIdAndRemove: 'findOneAndDelete' };
const FILTER_FIRST = new Set(['findOne', 'findOneAndUpdate', 'findOneAndDelete', 'updateOne', 'deleteOne', 'replaceOne', 'findFirst', 'findUnique']);

/** First field of any `new Schema({...})` / `mongoose.Schema({...})` in the file that names an owner. */
export function ownerField(ast) {
  let found = null;
  walk(ast, (n) => {
    if (found || (n.type !== 'NewExpression' && n.type !== 'CallExpression')) return;
    const name = n.callee.type === 'Identifier' ? n.callee.name : propName(n.callee.property);
    if (name !== 'Schema' || n.arguments[0]?.type !== 'ObjectExpression') return;
    for (const p of n.arguments[0].properties) {
      const key = p.type === 'Property' && !p.computed ? propName(p.key) : null;
      if (key && OWNER_FIELD.test(key)) {
        found = key;
        return;
      }
    }
  });
  return found ?? 'ownerId';
}

/** What the same-file auth middleware puts on req (req.member = ... -> "member"); default "user". */
export function authProp(ast, code) {
  const fns = [];
  walk(ast, (n) => {
    const named = (name, fn) => isFunction(fn) && (isAuthMiddlewareFn(fn, code) || AUTH_NAME.test(name ?? '')) && fns.push(fn);
    if (n.type === 'FunctionDeclaration') named(n.id?.name, n);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') named(n.id.name, n.init);
  });
  for (const fn of fns) {
    const req = fn.params[0]?.type === 'Identifier' ? fn.params[0].name : null;
    if (!req) continue;
    let prop = null;
    walk(fn.body, (n) => {
      if (prop || n.type !== 'AssignmentExpression' || n.left.type !== 'MemberExpression') return;
      if (n.left.object.type === 'Identifier' && n.left.object.name === req && !n.left.computed) prop = n.left.property.name;
    });
    if (prop) return prop;
  }
  return 'user';
}

/**
 * Rewritten source of one lookup call with an ownership condition, or null when there is no
 * obvious single-filter form to suggest (raw SQL, Prisma `where`, Firestore refs...).
 */
export function suggestOwnershipCall(call, code, { owner, prop, req = 'req' }) {
  const method = calleeProp(call);
  const src = (n) => code.slice(n.start, n.end);
  const cond = `${owner}: ${req}.${prop}.id`;
  const target = src(call.callee.object);
  const [first, ...rest] = call.arguments;
  if (!first) return null;
  const tail = rest.length ? `, ${rest.map(src).join(', ')}` : '';

  if (BY_ID[method]) return `${target}.${BY_ID[method]}({ _id: ${src(first)}, ${cond} }${tail})`;

  if (FILTER_FIRST.has(method) && first.type === 'ObjectExpression') {
    if (first.properties.some((p) => p.type === 'Property' && propName(p.key) === 'where')) return null;
    const obj = src(first);
    const close = obj.lastIndexOf('}');
    const body = obj.slice(1, close).trim().replace(/,\s*$/, '');
    const filter = body ? `{ ${body}, ${cond} }` : `{ ${cond} }`;
    return `${target}.${method}(${filter}${tail})`;
  }
  return null;
}
