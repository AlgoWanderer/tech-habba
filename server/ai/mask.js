// Privacy gate: nothing goes to the model until the secrets the rules found are masked.
// Uses core's maskSecrets() (role A) when it exists; until then a conservative fallback masks every
// string literal on a line that has a secret finding, plus well-known key shapes anywhere.
// Line counts never change, so the model's line numbers stay valid.
const KEY_SHAPES = [
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bSG\.[\w-]{16,}\.[\w-]{16,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqps?):\/\/[^\s'"`]*:[^\s'"`@]*@[^\s'"`]+/g,
];
const STRING = /(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g;

export const PLACEHOLDER = '<REDACTED_SECRET_';

export async function maskForModel(core, files) {
  if (typeof core.maskSecrets === 'function') {
    const r = await core.maskSecrets(files);
    return { files: r.files, count: r.count };
  }
  const findings = await core.scan(files);
  let n = 0;
  const next = () => `${PLACEHOLDER}${++n}>`;
  const out = files.map((f) => {
    const secretLines = new Set(findings.filter((x) => x.file === f.path && x.category === 'secret').map((x) => x.line));
    const lines = f.content.split('\n').map((line, i) => {
      let l = secretLines.has(i + 1) ? line.replace(STRING, (s) => (s.length >= 8 ? `${s[0]}${next()}${s[0]}` : s)) : line;
      for (const re of KEY_SHAPES) l = l.replace(re, () => next());
      return l;
    });
    return { path: f.path, content: lines.join('\n') };
  });
  return { files: out, count: n };
}

export const containsPlaceholder = (text) => String(text).includes(PLACEHOLDER);
