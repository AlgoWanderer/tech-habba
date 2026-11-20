// Rule: dep-vuln. Parses `npm audit --json` output (npm 7+ "vulnerabilities" or npm 6 "advisories").
// Input is the JSON (string or object) so it is testable without running npm.
import { makeFinding } from '../lib/ast.js';

const SEV = { critical: 'critical', high: 'high', moderate: 'medium', medium: 'medium', low: 'low', info: 'low' };
const RANK = { critical: 4, high: 3, medium: 2, low: 1 };

/** True if a submitted file looks like npm audit output. */
export function isAuditFile(path, content) {
  if (/(?:^|\/)(?:npm-)?audit(?:-report)?\.json$/i.test(path)) return true;
  if (!/\.json$/i.test(path) || /(?:^|\/)package(?:-lock)?\.json$/i.test(path)) return false;
  return /"auditReportVersion"|"advisories"\s*:/.test(content.slice(0, 2000));
}

function lineOfDep(pkgJson, name) {
  if (!pkgJson) return null;
  const lines = pkgJson.split(/\r?\n/);
  const i = lines.findIndex((l) => l.includes(`"${name}"`) && l.includes(':'));
  return i === -1 ? null : i + 1;
}

function fromV7(report) {
  return Object.values(report.vulnerabilities ?? {}).map((v) => {
    const advisories = (v.via ?? []).filter((x) => typeof x === 'object');
    const titles = advisories.map((a) => a.title).filter(Boolean);
    const via = (v.via ?? []).filter((x) => typeof x === 'string');
    const fix = v.fixAvailable;
    return {
      name: v.name,
      severity: SEV[v.severity] ?? 'low',
      range: v.range ?? '',
      direct: Boolean(v.isDirect),
      title: titles[0] ?? (via.length ? `Depends on vulnerable ${via.join(', ')}` : 'Known vulnerability'),
      more: Math.max(0, titles.length - 1),
      url: advisories[0]?.url ?? '',
      fix: fix === true ? 'npm audit fix' : fix && typeof fix === 'object' ? `npm install ${fix.name}@${fix.version}${fix.isSemVerMajor ? ' (major version bump)' : ''}` : null,
    };
  });
}

function fromV6(report) {
  const byName = new Map();
  for (const a of Object.values(report.advisories ?? {})) {
    const prev = byName.get(a.module_name);
    const sev = SEV[a.severity] ?? 'low';
    if (prev && RANK[prev.severity] >= RANK[sev]) {
      prev.more += 1;
      continue;
    }
    byName.set(a.module_name, {
      name: a.module_name,
      severity: sev,
      range: a.vulnerable_versions ?? '',
      direct: true,
      title: a.title ?? 'Known vulnerability',
      more: prev ? prev.more + 1 : 0,
      url: a.url ?? '',
      fix: a.patched_versions && a.patched_versions !== '<0.0.0' ? `upgrade to ${a.patched_versions}` : null,
    });
  }
  return [...byName.values()];
}

/**
 * parseAudit(auditJson, packageJsonContent?, file = 'package.json') -> Finding[]
 * Findings point at the dependency's line in package.json when it is supplied.
 */
export function parseAudit(audit, pkgJson = null, file = 'package.json') {
  let report = audit;
  if (typeof audit === 'string') {
    try {
      report = JSON.parse(audit);
    } catch {
      return [];
    }
  }
  if (!report || typeof report !== 'object') return [];
  const vulns = (report.vulnerabilities ? fromV7(report) : fromV6(report)).sort((a, b) => a.name.localeCompare(b.name));
  const used = new Set();
  let next = 1;
  return vulns.map((v) => {
    let line = lineOfDep(pkgJson, v.name);
    if (line == null || used.has(line)) {
      while (used.has(next)) next += 1;
      line = next;
    }
    used.add(line);
    const extra = v.more ? ` (+${v.more} more advisories)` : '';
    const how = v.fix ? ` Fix: ${v.fix}.` : ' No fix available yet; consider replacing the package.';
    return makeFinding({
      ruleId: 'dep-vuln',
      category: 'dependency',
      severity: v.severity,
      file,
      line,
      endLine: line,
      code: pkgJson ?? '',
      snippet: `${v.name}@${v.range}${v.direct ? '' : ' (transitive)'}`,
      message: `${v.name}: ${v.title}${extra}.${how}${v.url ? ` ${v.url}` : ''}`,
      fixPreview: v.fix ?? undefined,
    });
  });
}
