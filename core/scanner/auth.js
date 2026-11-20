// Rule: route-no-auth. Express routes on non-public paths with no auth middleware, no earlier
// router-level x.use(auth), and no inline 401/403 check.
import { makeFinding, previewLines, lineAt } from '../lib/ast.js';
import { extractRoutes, isPublicPath, isProtected, MUTATING } from './routes.js';

export function scanAuth(file, code, parsed) {
  if (!parsed) return [];
  const { routes, uses } = extractRoutes(parsed.ast, code);
  const out = [];
  for (const r of routes) {
    if (isPublicPath(r.path) || isProtected(r, uses, code)) continue;
    const insert = { start: r.pathArg.end, end: r.pathArg.end, text: ', requireAuth' };
    const line = r.call.loc.start.line;
    out.push(
      makeFinding({
        ruleId: 'route-no-auth',
        category: 'auth',
        severity: 'high',
        file,
        node: r.call,
        code,
        snippet: lineAt(code, line).trim(),
        message: MUTATING.has(r.verb)
          ? `${r.verb.toUpperCase()} ${r.path} changes data but has no authentication middleware.`
          : 'Data-returning route has no authentication middleware.',
        fix: { type: 'auth', edits: [insert] },
        fixPreview: previewLines(code, [insert], line, line),
      }),
    );
  }
  return out;
}
