// Express route extraction shared by the auth and idor rules.
import { walk, isFunction, calleeProp, propName, stringValue } from '../lib/ast.js';

export const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all']);
export const MUTATING = new Set(['post', 'put', 'patch', 'delete', 'all']);

// Names that indicate an authentication / authorization middleware.
export const AUTH_NAME =
  /auth|protect|verify(?!captcha)|jwt|passport|ensure|logged|guard|admin|require(?:User|Login|Session|Role)|checkToken|isUser|bearer|clerk|firebase|apikey|\bacl\b|permission|(?:has|check)Role|(?:check|is|must|needs?)Log(?:ged)?In/i;

const PUBLIC = [
  /^\*$/,
  /^\/$/,
  /^\/(?:api\/)?(?:v\d+\/)?(?:health|healthz|status|ping|ready|readyz|live|livez|version|metrics)\/?$/,
  /(?:^|\/)(?:login|signin|sign-in|signup|sign-up|register|logout|forgot-password|reset-password|verify-email|refresh|refresh-token|oauth|callback|csrf-token)(?:\/|$)/,
  /^\/(?:api\/)?(?:v\d+\/)?auth(?:\/|$)/,
  /^\/(?:api\/)?(?:v\d+\/)?(?:public|static|assets|docs|swagger|openapi(?:\.json)?|favicon\.ico|robots\.txt)(?:\/|$)/,
  /webhooks?(?:\/|$)/,
];

export const isPublicPath = (p) => PUBLIC.some((re) => re.test(p.toLowerCase()));

const DENY = /\.status\(\s*40[13]\s*\)|\.sendStatus\(\s*40[13]\s*\)|\.statusCode\s*=\s*40[13]\b/;

/**
 * A function is auth middleware by behaviour if it takes (req, res, next), can answer 401/403,
 * and calls next() - whatever it is named (checkLogin, gate, mustBeSignedIn, ...).
 */
export function isAuthMiddlewareFn(fn, code) {
  if (!isFunction(fn) || fn.params.length < 3 || fn.params[2].type !== 'Identifier') return false;
  if (!DENY.test(code.slice(fn.body.start, fn.body.end))) return false;
  const next = fn.params[2].name;
  let calls = false;
  walk(fn.body, (n) => {
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === next) calls = true;
  });
  return calls;
}

/** Names of same-file functions that behave like auth middleware. */
export function collectAuthMiddleware(ast, code) {
  const names = new Set();
  walk(ast, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id && isAuthMiddlewareFn(n, code)) names.add(n.id.name);
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && isAuthMiddlewareFn(n.init, code)) names.add(n.id.name);
    if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && isAuthMiddlewareFn(n.right, code)) names.add(n.left.name);
  });
  return names;
}

/** Does a middleware argument look like auth (by name, or by behaviour for same-file code)? */
export function looksLikeAuth(node, code, authFns = new Set()) {
  if (!node) return false;
  if (isFunction(node)) return isAuthMiddlewareFn(node, code);
  if (node.type === 'Identifier' && authFns.has(node.name)) return true;
  return AUTH_NAME.test(code.slice(node.start, node.end));
}

/** Inline auth inside the final handler: 401/403 responses or req.isAuthenticated(). */
export function inlineAuth(fn, code) {
  if (!isFunction(fn)) return false;
  const body = code.slice(fn.start, fn.end);
  return /status\(\s*40[13]\s*\)|sendStatus\(\s*40[13]\s*\)|isAuthenticated\s*\(|getServerSession|verifyToken|jwt\.verify/.test(body);
}

function receiverName(call) {
  const o = call.callee.object;
  if (o.type === 'Identifier') return o.name;
  if (o.type === 'MemberExpression') return propName(o.property);
  return null;
}

/**
 * Returns {routes, uses}. route: {call, verb, path, receiver, handlers, handler, pathArg, authFns}.
 * use: {call, receiver, path|null, auth:boolean}.
 */
export function extractRoutes(ast, code) {
  const routes = [];
  const uses = [];
  const authFns = collectAuthMiddleware(ast, code);
  walk(ast, (node) => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || node.callee.computed) return;
    const verb = calleeProp(node);
    const receiver = receiverName(node);
    if (!receiver) return;
    const args = node.arguments;
    if (verb === 'use') {
      const path = stringValue(args[0]);
      const mws = path == null ? args : args.slice(1);
      uses.push({ call: node, receiver, path, auth: mws.some((m) => looksLikeAuth(m, code, authFns)) });
      return;
    }
    if (!VERBS.has(verb) || args.length < 2) return;
    const path = stringValue(args[0]);
    if (path == null || !(path.startsWith('/') || path === '*')) return;
    const handler = args[args.length - 1];
    if (!isFunction(handler) && handler.type !== 'Identifier' && handler.type !== 'MemberExpression' && handler.type !== 'CallExpression') return;
    routes.push({ call: node, verb, path, receiver, handlers: args.slice(1), handler, pathArg: args[0], authFns });
  });
  return { routes, uses };
}

/** Is this route protected by a router-level `x.use(auth)` registered before it? */
export function coveredByUse(route, uses) {
  return uses.some(
    (u) =>
      u.auth &&
      u.receiver === route.receiver &&
      u.call.start < route.call.start &&
      (u.path == null || u.path === '/' || route.path.startsWith(u.path)),
  );
}

export function isProtected(route, uses, code) {
  const mws = route.handlers.slice(0, -1);
  if (mws.some((m) => looksLikeAuth(m, code, route.authFns))) return true;
  if (coveredByUse(route, uses)) return true;
  return inlineAuth(route.handler, code);
}
