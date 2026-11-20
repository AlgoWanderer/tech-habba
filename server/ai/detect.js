// AI detector: the model reads secret-masked, line-numbered code and reports flaws. Its output is
// treated as untrusted: unknown files, out-of-range lines and low-confidence items are dropped, and
// the snippet always comes from the real file, never from the model's text.
import { maskForModel } from './mask.js';

export const CATEGORIES = ['secret', 'injection', 'auth', 'dependency', 'idor'];
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const CODE_FILE = /\.(?:c|m)?[jt]sx?$/i;
export const MIN_CONFIDENCE = 0.5;
const MAX_LINES = 1500;

export const DETECT_SYSTEM = `You are a security reviewer for Node.js / Express / MongoDB backends written by AI tools.
Report only REAL, exploitable security flaws, each with the exact line number shown at the start of the line.
Categories (use exactly these words):
- secret: credentials, API keys, tokens or passwords written in the code (values shown as <REDACTED_SECRET_n> are already-known secrets: still report them).
- injection: NoSQL/SQL injection, command injection (exec/spawn with user input), path traversal (fs/sendFile with user input), XSS (user input in HTML), eval of user input.
- auth: a route that returns or changes private data with no authentication check. Do NOT report routes that are clearly meant to be public (login, signup, health, public listings) unless they expose private data.
- idor: a record loaded or changed by an id from the request with no check that it belongs to the current user.
- dependency: only if a package.json pins a version you are sure has a known vulnerability.
Ignore style, performance and missing validation that is not exploitable. If there are no real flaws, return [].
confidence: 0.9+ only when the line is clearly exploitable; below 0.5 when unsure.`;

export const DETECT_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      file: { type: 'STRING' },
      line: { type: 'INTEGER' },
      category: { type: 'STRING', enum: CATEGORIES },
      severity: { type: 'STRING', enum: SEVERITIES },
      title: { type: 'STRING' },
      explanation: { type: 'STRING' },
      confidence: { type: 'NUMBER' },
    },
    required: ['file', 'line', 'category', 'severity', 'title', 'explanation', 'confidence'],
  },
};

const kebab = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'issue';

export function numbered(content) {
  return content
    .split('\n')
    .map((l, i) => `${String(i + 1).padStart(4)}| ${l}`)
    .join('\n');
}

/** Turns raw model items into contract Findings, dropping anything that does not check out. */
export function toFindings(items, files) {
  const byPath = new Map(files.map((f) => [f.path, f.content.split('\n')]));
  const seen = new Set();
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    const lines = byPath.get(it?.file);
    const line = Number(it?.line);
    const confidence = Number(it?.confidence);
    if (!lines || !Number.isInteger(line) || line < 1 || line > lines.length) continue;
    if (!CATEGORIES.includes(it.category) || !(confidence >= MIN_CONFIDENCE && confidence <= 1)) continue;
    const snippet = lines[line - 1].trim();
    if (!snippet) continue;
    const id = `ai-${it.category}:${it.file}:${line}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const title = String(it.title ?? '').trim() || 'Possible security flaw';
    out.push({
      id,
      ruleId: `ai-${kebab(title)}`,
      category: it.category,
      severity: SEVERITIES.includes(it.severity) ? it.severity : 'medium',
      file: it.file,
      line,
      endLine: line,
      snippet,
      message: `${title}: ${String(it.explanation ?? '').trim()}`.slice(0, 200),
      fixable: 'review',
      source: 'ai',
      confidence: Math.round(confidence * 100) / 100,
    });
  }
  return out;
}

/**
 * aiDetect(core, files, client) -> Finding[] (source "ai"). One model call per code file.
 * The original files are used for snippets; only masked copies are sent.
 */
export async function aiDetect(core, files, client) {
  const codeFiles = files.filter((f) => CODE_FILE.test(f.path) && f.content.split('\n').length <= MAX_LINES);
  if (!codeFiles.length) return [];
  const { files: masked } = await maskForModel(core, codeFiles);
  const out = [];
  for (const f of masked) {
    const items = await client.generateJson(DETECT_SYSTEM, `File: ${f.path}\n\n${numbered(f.content)}`, DETECT_SCHEMA);
    out.push(...toFindings(items, codeFiles));
  }
  return out;
}
