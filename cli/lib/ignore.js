// Suppressions, so intentional cases (demo data, fixtures, a local-only dev server) don't block.
//   .slopstopignore   one path prefix or glob per line (`*` = any chars except `/`, `**` = anything); `#` comments
//   inline comment    `// slopstop-ignore <ruleId>[,<ruleId>]: reason`  on the finding's line or the line above.
//                     A bare `slopstop-ignore` without a ruleId is NOT honoured: say what you are ignoring.
// Suppressed findings are still counted and printed in the summary, never silently dropped.
import { existsSync, readFileSync } from 'node:fs';

function globToRegex(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = esc.replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*').replace(/\?/g, '[^/]');
  return new RegExp(`^${body}${glob.endsWith('/') ? '' : '(/|$)'}`);
}

export function parseIgnoreFile(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => globToRegex(l.replace(/^\.?\//, '')));
}

export function loadIgnoreFile(file = '.slopstopignore') {
  return existsSync(file) ? parseIgnoreFile(readFileSync(file, 'utf8')) : [];
}

const INLINE = /slopstop-ignore\s+([\w-]+(?:\s*,\s*[\w-]+)*)/;

function inlineRules(line) {
  const m = INLINE.exec(line ?? '');
  return m ? m[1].split(',').map((s) => s.trim()) : [];
}

/** Split findings into {kept, suppressed}; each suppressed item gets a `suppressedBy` string. */
export function applyIgnores(findings, files, patterns = []) {
  const lines = new Map(files.map((f) => [f.path, f.content.split(/\r?\n/)]));
  const kept = [];
  const suppressed = [];
  for (const f of findings) {
    const p = f.file.replace(/\\/g, '/').replace(/^\.\//, '');
    if (patterns.some((re) => re.test(p))) {
      suppressed.push({ ...f, suppressedBy: '.slopstopignore' });
      continue;
    }
    const src = lines.get(f.file) ?? [];
    const rules = [...inlineRules(src[f.line - 1]), ...inlineRules(src[f.line - 2])];
    if (rules.includes(f.ruleId)) suppressed.push({ ...f, suppressedBy: 'inline comment' });
    else kept.push(f);
  }
  return { kept, suppressed };
}
