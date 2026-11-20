// Offline fallback for dep-vuln when no `npm audit --json` output is supplied: a small built-in
// list of well-known advisories, checked against package.json version ranges. A range is only
// flagged when NO version it allows is patched (exact pins, or a fix that needs a major bump).
// npm audit output, when provided, always takes precedence.
import { makeFinding } from '../lib/ast.js';

// [package, first patched version, severity, summary]
const ADVISORIES = [
  ['jsonwebtoken', '9.0.0', 'high', 'Insecure key handling / signature bypass (CVE-2022-23529, CVE-2022-23539, CVE-2022-23540, CVE-2022-23541)'],
  ['lodash', '4.17.12', 'critical', 'Prototype pollution in defaultsDeep/merge (CVE-2019-10744)'],
  ['lodash', '4.17.21', 'high', 'Command injection via template / prototype pollution (CVE-2021-23337, CVE-2020-8203)'],
  ['express', '4.17.3', 'high', 'Bundled qs allows prototype pollution DoS (CVE-2022-24999)'],
  ['express', '4.19.2', 'medium', 'Open redirect in res.location/redirect (CVE-2024-29041)'],
  ['mongoose', '5.13.20', 'high', 'Prototype pollution via update operations (CVE-2023-3696)'],
  ['minimist', '1.2.6', 'critical', 'Prototype pollution (CVE-2021-44906)'],
  ['node-fetch', '2.6.7', 'high', 'Leaks Authorization/Cookie headers on cross-host redirect (CVE-2022-0235)'],
  ['moment', '2.29.4', 'high', 'ReDoS in RFC2822 date parsing (CVE-2022-31129)'],
  ['ejs', '3.1.7', 'critical', 'Template injection leading to RCE (CVE-2022-29078)'],
  ['body-parser', '1.20.3', 'high', 'Denial of service with URL encoding enabled (CVE-2024-45590)'],
  ['axios', '0.21.2', 'high', 'ReDoS in trim (CVE-2021-3749)'],
  ['nodemailer', '6.6.1', 'high', 'Command injection via sendmail transport and header injection (CVE-2020-7769, CVE-2021-23400)'],
];
const RANK = { critical: 4, high: 3, medium: 2, low: 1 };

const parseV = (s) => {
  const m = String(s).match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** {min, upper|null, exact} for "1.2.3", "=1.2.3", "^1.2.3", "~1.2.3"; null if unsupported. */
export function parseRange(spec) {
  const m = String(spec).trim().match(/^(=|\^|~)?v?(\d+\.\d+\.\d+)(?:[-+][\w.-]*)?$/);
  if (!m) return null;
  const v = parseV(m[2]);
  if (!m[1] || m[1] === '=') return { min: v, upper: null, exact: true };
  if (m[1] === '~') return { min: v, upper: [v[0], v[1] + 1, 0], exact: false };
  if (v[0] > 0) return { min: v, upper: [v[0] + 1, 0, 0], exact: false };
  return { min: v, upper: v[1] > 0 ? [0, v[1] + 1, 0] : [0, 0, v[2] + 1], exact: false };
}

/** True if every version the range allows is older than `fixed`. */
export function stuckBelow(range, fixed) {
  if (cmp(range.min, fixed) >= 0) return false;
  return range.exact || cmp(fixed, range.upper) >= 0;
}

export function scanPackageJson(file, content) {
  let pkg;
  try {
    pkg = JSON.parse(content);
  } catch {
    return [];
  }
  const lines = content.split(/\r?\n/);
  const out = [];
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, spec] of Object.entries(pkg?.[section] ?? {})) {
      const range = parseRange(spec);
      if (!range) continue;
      const hits = ADVISORIES.filter(([n, fixed]) => n === name && stuckBelow(range, parseV(fixed)));
      if (!hits.length) continue;
      const worst = hits.reduce((a, b) => (RANK[b[2]] > RANK[a[2]] ? b : a));
      const fixTo = hits.map((h) => h[1]).sort((a, b) => cmp(parseV(b), parseV(a)))[0];
      const idx = lines.findIndex((l) => l.includes(`"${name}"`) && l.includes(':'));
      const line = idx + 1 || 1;
      out.push(
        makeFinding({
          ruleId: 'dep-vuln',
          category: 'dependency',
          severity: worst[2],
          file,
          line,
          endLine: line,
          code: content,
          snippet: lines[idx]?.trim() ?? `"${name}": "${spec}"`,
          message: `${name}@${spec}: ${hits.map((h) => h[3]).join('; ')}. Fix: upgrade to >=${fixTo}. (Built-in advisory list; run npm audit for full coverage.)`,
          fixPreview: `npm install ${name}@^${fixTo}`,
        }),
      );
    }
  }
  return out;
}
