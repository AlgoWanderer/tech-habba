// Rule: secret-hardcoded. Known key shapes, credentialed DB URIs, jwt.sign/verify literal secrets,
// and string literals assigned to secret-looking names.
import { walk, propName, calleeProp, calleeObjectName, makeFinding, previewLines, lineAt } from '../lib/ast.js';

export const SHAPES = [
  { re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, env: 'AWS_ACCESS_KEY_ID', msg: 'Hard-coded AWS access key. Move it to an environment variable.' },
  { re: /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{10,}/, env: 'STRIPE_SECRET_KEY', msg: 'Hard-coded API key. Move it to an environment variable.' },
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,}/, env: 'ANTHROPIC_API_KEY', msg: 'Hard-coded API key. Move it to an environment variable.' },
  { re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/, env: 'OPENAI_API_KEY', msg: 'Hard-coded API key. Move it to an environment variable.' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36,}/, env: 'GITHUB_TOKEN', msg: 'Hard-coded GitHub token. Move it to an environment variable.' },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, env: 'SLACK_TOKEN', msg: 'Hard-coded Slack token. Move it to an environment variable.' },
  { re: /\bAIza[0-9A-Za-z_-]{35}/, env: 'GOOGLE_API_KEY', msg: 'Hard-coded Google API key. Move it to an environment variable.' },
  { re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, env: 'PRIVATE_KEY', msg: 'Hard-coded private key. Move it to an environment variable.' },
  { re: /\bmongodb(?:\+srv)?:\/\/[^\s:/@]+:[^\s@/]+@/, env: 'MONGODB_URI', msg: 'Database URI with an embedded password.' },
  { re: /\b(?:postgres(?:ql)?|mysql|mariadb|mssql):\/\/[^\s:/@]+:[^\s@/]+@/, env: 'DATABASE_URL', msg: 'Database URI with an embedded password.' },
  { re: /\b(?:rediss?|amqps?):\/\/[^\s:/@]*:[^\s@/]+@/, env: 'REDIS_URL', msg: 'Service URI with an embedded password.' },
];

const STRONG_NAME = /secret|passw(?:or)?d|passwd|pwd|private/i;
const WEAK_NAME = /key|token|uri|auth|credential/i;
const NOT_SECRET_NAME = /public|publishable|header|field|label|path|expir|ttl|length|prefix|placeholder|storage|cookie_?name|event|type|algorithm|^keys?$/i;
const PLACEHOLDER = /^(?:x+|\*+|\.+|-+|changeme|change[-_ ]?me|password|secret|test|example|dummy|todo|null|undefined|none|redacted)$|your[-_ ]|example|placeholder|<[^>]*>|\$\{|^process\.env/i;
const GENERIC_ENV = new Set(['KEY', 'TOKEN', 'SECRET', 'URI', 'URL', 'PASSWORD', 'PASS', 'PWD', 'AUTH', 'CONFIG', 'VALUE']);

export function entropy(s) {
  const freq = {};
  for (const ch of s) freq[ch] = (freq[ch] ?? 0) + 1;
  let h = 0;
  for (const n of Object.values(freq)) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

export function toEnvName(name) {
  if (!name) return null;
  const snake = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  if (!snake) return null;
  return /^[0-9]/.test(snake) ? `_${snake}` : snake;
}

export function matchShape(value) {
  return SHAPES.find((s) => s.re.test(value)) ?? null;
}

/** Mask a secret for display: keep a short prefix only. */
export function redact(text, value) {
  if (!value || value.length < 4) return text;
  const keep = Math.min(6, Math.floor(value.length / 4));
  return text.split(value).join(`${value.slice(0, keep)}…[redacted]`);
}

function isProcessEnv(node) {
  return (
    node?.type === 'MemberExpression' &&
    node.object.type === 'MemberExpression' &&
    node.object.object.type === 'Identifier' &&
    node.object.object.name === 'process' &&
    propName(node.object.property) === 'env'
  );
}

/** Work out the name the literal is bound to, plus hints from its call site. */
function context(node, ancestors) {
  const parent = ancestors[ancestors.length - 1];
  const out = { name: null, envHint: null, jwt: false, skip: false, range: null };
  if (!parent) return out;
  switch (parent.type) {
    case 'VariableDeclarator':
      if (parent.init === node && parent.id.type === 'Identifier') out.name = parent.id.name;
      break;
    case 'Property':
      if (parent.key === node && !parent.computed) out.skip = true;
      else if (parent.value === node) out.name = propName(parent.key);
      break;
    case 'AssignmentExpression':
    case 'AssignmentPattern':
      if (parent.right === node) out.name = parent.left.type === 'MemberExpression' ? propName(parent.left.property) : parent.left.name;
      break;
    case 'LogicalExpression':
      if (parent.right === node && isProcessEnv(parent.left)) {
        out.envHint = propName(parent.left.property);
        out.range = parent; // replace the whole `process.env.X || 'literal'` fallback
        // A literal fallback for a secret-named env var is a hard-coded secret, whatever the
        // variable it is assigned to is called (`const a = process.env.JWT_SECRET || 'x'`).
        const bound = context(parent, ancestors.slice(0, -1)).name;
        const envIsSecret = out.envHint && (STRONG_NAME.test(out.envHint) || WEAK_NAME.test(out.envHint));
        out.name = envIsSecret ? out.envHint : (bound ?? out.envHint);
      }
      break;
    case 'ImportDeclaration':
    case 'ExportAllDeclaration':
    case 'ExportNamedDeclaration':
    case 'ImportExpression':
      out.skip = true;
      break;
    case 'CallExpression': {
      const prop = calleeProp(parent);
      const obj = calleeObjectName(parent) ?? '';
      if (parent.callee.type === 'Identifier' && parent.callee.name === 'require') out.skip = true;
      if ((prop === 'sign' || prop === 'verify') && /jwt|jsonwebtoken/i.test(obj) && parent.arguments[1] === node) {
        out.jwt = true;
        out.envHint = 'JWT_SECRET';
      }
      break;
    }
    default:
  }
  return out;
}

function classify(value, ctx) {
  const shape = matchShape(value);
  if (shape) return { env: shape.env, msg: shape.msg };
  if (/\s/.test(value) || PLACEHOLDER.test(value) || value.length < 6) return null;
  if (ctx.jwt) return { env: 'JWT_SECRET', msg: 'Hard-coded JWT signing secret. Move it to an environment variable.' };
  const name = ctx.name ?? '';
  if (!name || NOT_SECRET_NAME.test(name)) return null;
  if (/:\/\//.test(value)) return null; // URLs without credentials are not secrets
  if (STRONG_NAME.test(name)) return { env: null, msg: `Hard-coded secret in "${name}". Move it to an environment variable.` };
  if (WEAK_NAME.test(name) && value.length >= 16 && entropy(value) >= 3.5) {
    return { env: null, msg: `High-entropy string in "${name}" looks like a credential. Move it to an environment variable.` };
  }
  return null;
}

/** Pick the env var name: an existing process.env.X fallback, then the binding name, then the shape default. */
function envNameFor(cls, ctx) {
  if (ctx.envHint) return ctx.envHint;
  const fromName = toEnvName(ctx.name);
  if (fromName && fromName.length >= 3 && !GENERIC_ENV.has(fromName)) return fromName;
  return cls.env ?? fromName ?? 'APP_SECRET';
}

export function scanSecrets(file, code, parsed) {
  if (!parsed) return scanSecretsRegex(file, code);
  const findings = [];
  walk(parsed.ast, (node, ancestors) => {
    let value = null;
    if (node.type === 'Literal' && typeof node.value === 'string') value = node.value;
    else if (node.type === 'TemplateLiteral') {
      if (node.expressions.length === 0) value = node.quasis[0].value.cooked;
      else {
        const text = node.quasis.map((q) => q.value.cooked).join('${}');
        const shape = matchShape(text);
        if (shape) findings.push(make(file, code, node, shape.msg, null, text));
        return;
      }
    }
    if (value == null) return;
    const ctx = context(node, ancestors);
    if (ctx.skip) return;
    const cls = classify(value, ctx);
    if (!cls) return;
    const envName = envNameFor(cls, ctx);
    const r = ctx.range ?? node;
    findings.push(make(file, code, node, cls.msg, { type: 'secret', start: r.start, end: r.end, litStart: node.start, litEnd: node.end, envName, value, jwt: ctx.jwt }, value));
  });
  return findings;
}

/** Replacement text for a literal; pads with a comment so line numbers never shift. */
export function secretReplacement(code, start, end, envName) {
  const nl = (code.slice(start, end).match(/\n/g) ?? []).length;
  return `process.env.${envName}${nl ? ` /*${'\n'.repeat(nl)}*/` : ''}`;
}

function make(file, code, node, message, fix, value) {
  const line = node.loc.start.line;
  const endLine = node.loc.end.line;
  const snippet = redact(lineAt(code, line).trim(), value).slice(0, 300);
  const fixPreview = fix
    ? previewLines(code, [{ start: fix.start, end: fix.end, text: `process.env.${fix.envName}` }], line, line)
    : undefined;
  return makeFinding({ ruleId: 'secret-hardcoded', category: 'secret', severity: 'critical', file, node, line, endLine, code, message, snippet, fix, fixPreview });
}

/** Fallback for files acorn cannot parse (TS, JSX, broken JS): known shapes only, review. */
export function scanSecretsRegex(file, code) {
  const out = [];
  code.split(/\r?\n/).forEach((text, i) => {
    for (const s of SHAPES) {
      const m = text.match(new RegExp(`${s.re.source}[^\\s'"\`]*`));
      if (!m) continue;
      out.push(
        makeFinding({ ruleId: 'secret-hardcoded', category: 'secret', severity: 'critical', file, line: i + 1, endLine: i + 1, code, message: s.msg, snippet: redact(text.trim(), m[0]).slice(0, 300) }),
      );
      break;
    }
  });
  return out;
}
