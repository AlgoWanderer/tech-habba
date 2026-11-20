// maskSecrets(files) -> { files: [{path, content}], count }
// Privacy gate for the AI features: before any code is sent to a model, every secret the rules
// find is replaced by "<REDACTED_SECRET_n>". Only the secret LITERAL changes (quotes kept, so the
// code stays valid JS); every other byte is identical and every file keeps its line count, so line
// numbers the model reports still point at the right code.
// The same secret value always gets the same number. `count` = number of literals replaced.
import { analyze } from './scanner/index.js';
import { SHAPES } from './scanner/secrets.js';

const PLACEHOLDER = (n) => `<REDACTED_SECRET_${n}>`;
const QUOTES = new Set(["'", '"', '`']);

const normPath = (p) => String(p ?? '').replace(/\\/g, '/').replace(/^\.\//, '');

/** Replace the inside of a quoted literal, keeping its quotes and newline count. */
function literalReplacement(raw, label) {
  const q = raw[0];
  if (!QUOTES.has(q) || raw[raw.length - 1] !== q) return label;
  const newlines = (raw.match(/\n/g) ?? []).length; // only possible inside a template literal
  return `${q}${label}${'\n'.repeat(newlines)}${q}`;
}

/** Shape regexes extended to the rest of the token, as the regex fallback rule does. */
const SHAPE_TOKENS = SHAPES.map((s) => new RegExp(`${s.re.source}[^\\s'"\`]*`, 'g'));

export function maskSecrets(files) {
  const list = (Array.isArray(files) ? files : []).map((f) => ({ path: normPath(f.path), content: String(f.content ?? '') }));
  const numbers = new Map(); // secret value -> n
  const labelFor = (value) => {
    if (!numbers.has(value)) numbers.set(value, numbers.size + 1);
    return PLACEHOLDER(numbers.get(value));
  };
  let count = 0;

  // 1. Exact literal ranges from the secret rule (AST-backed findings).
  const ranges = new Map(); // path -> [{start, end, value}]
  for (const f of analyze(list)) {
    if (f.category !== 'secret' || !f._fix) continue;
    const parts = f._fix.type === 'multi' ? f._fix.parts : [f._fix];
    for (const p of parts) {
      if (p.type !== 'secret' || p.litStart == null) continue;
      if (!ranges.has(f.file)) ranges.set(f.file, []);
      ranges.get(f.file).push({ start: p.litStart, end: p.litEnd, value: p.value });
    }
  }

  // Number secrets in reading order (files in order, then position), before editing back to front.
  for (const file of list) for (const r of [...(ranges.get(file.path) ?? [])].sort((a, b) => a.start - b.start)) labelFor(r.value);

  const out = list.map((file) => {
    let code = file.content;
    const rs = (ranges.get(file.path) ?? []).sort((a, b) => b.start - a.start);
    let lastStart = Infinity;
    for (const r of rs) {
      if (r.end > lastStart) continue; // overlapping duplicate
      code = code.slice(0, r.start) + literalReplacement(code.slice(r.start, r.end), labelFor(r.value)) + code.slice(r.end);
      lastStart = r.start;
      count += 1;
    }

    // 2. Known key shapes anywhere else (dynamic templates, TS/unparseable files, .env, JSON...).
    for (const re of SHAPE_TOKENS) {
      code = code.replace(re, (m) => {
        count += 1;
        return labelFor(m);
      });
    }
    return { path: file.path, content: code };
  });

  return { files: out, count };
}
