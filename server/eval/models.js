// Model evaluation: rules vs Gemini vs base Qwen vs fine-tuned Qwen on the SAME task role A trained on:
// "given a code snippet, is it vulnerable, and which category?". Snippets are the top-level statements
// (routes, functions, config lines) of the 30 corpus apps (+ DVNA if C added it), labelled from
// ground truth. None of these apps are in A's training data.
//
//   node server/eval/models.js --models rules,gemini,ollama:qwen2.5-coder:1.5b,ollama:slopstop-qwen [--max 120] [--delay 0]
//   (Ollama on another laptop: set OLLAMA_URL=http://<ip>:11434 and start Ollama there with OLLAMA_HOST=0.0.0.0)
import '../env.js';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '../../core/lib/ast.js';
import { loadCore } from '../coreAdapter.js';
import { createGeminiClient, createOllamaClient, DEFAULT_FALLBACKS, DEFAULT_MODEL } from '../ai/client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
export const CATEGORIES = ['secret', 'injection', 'auth', 'idor', 'dependency'];

// Identical to the system prompt in role A's training data (prompt-for-A-train-qwen, step 2).
export const CLASSIFY_SYSTEM = 'You are a security reviewer for Node.js/Express code. Answer with JSON only: {"vulnerable": bool, "category": "secret|injection|auth|idor|dependency|none", "reason": string}.';
export const CLASSIFY_SCHEMA = {
  type: 'OBJECT',
  properties: { vulnerable: { type: 'BOOLEAN' }, category: { type: 'STRING', enum: [...CATEGORIES, 'none'] }, reason: { type: 'STRING' } },
  required: ['vulnerable', 'category', 'reason'],
};

function walkFiles(dir, base = dir) {
  return readdirSync(dir).flatMap((n) => {
    const full = path.join(dir, n);
    if (statSync(full).isDirectory()) return n === 'node_modules' ? [] : walkFiles(full, base);
    return /\.(c|m)?js$|^package\.json$/.test(n) ? [{ path: path.relative(base, full).split(path.sep).join('/'), content: readFileSync(full, 'utf8') }] : [];
  });
}

/** Test sets that have ground truth: the corpus, plus DVNA when role C has added it. */
export function loadSets() {
  const sets = [];
  const gt = JSON.parse(readFileSync(path.join(ROOT, 'corpus/ground-truth.json'), 'utf8'));
  for (const a of gt.apps) sets.push({ set: 'corpus', app: a.app, files: walkFiles(path.join(ROOT, 'corpus/apps', a.app)), flaws: a.flaws });
  const dvnaGt = path.join(ROOT, 'corpus/external/dvna-ground-truth.json');
  const dvnaDir = path.join(ROOT, 'corpus/external/dvna');
  if (existsSync(dvnaGt) && existsSync(dvnaDir)) {
    for (const a of JSON.parse(readFileSync(dvnaGt, 'utf8')).apps) sets.push({ set: 'dvna', app: a.app, files: walkFiles(dvnaDir), flaws: a.flaws });
  }
  return sets;
}

/** Top-level statements of each JS file (imports and app.listen skipped) and each package.json, labelled. */
export function buildSnippets({ set, app, files, flaws }) {
  const out = [];
  for (const f of files) {
    const fileFlaws = flaws.filter((x) => x.file === f.path);
    const ranges = [];
    if (f.path.endsWith('package.json')) ranges.push({ start: 1, end: f.content.split('\n').length });
    else {
      const parsed = parse(f.content);
      if (!parsed) continue;
      for (const n of parsed.ast.body) {
        const text = f.content.slice(n.start, n.end);
        if (n.type === 'ImportDeclaration' || /^\s*\w+\.listen\s*\(/.test(text)) continue;
        ranges.push({ start: n.loc.start.line, end: n.loc.end.line });
      }
    }
    const lines = f.content.split('\n');
    for (const r of ranges) {
      const hit = fileFlaws.filter((x) => x.line >= r.start && x.line <= r.end);
      out.push({ id: `${set}/${app}/${f.path}:${r.start}-${r.end}`, set, app, file: f.path, start: r.start, end: r.end, code: lines.slice(r.start - 1, r.end).join('\n'), vulnerable: hit.length > 0, categories: [...new Set(hit.map((x) => x.category))] });
    }
  }
  return out;
}

/** All vulnerable snippets plus the same number of clean ones (deterministic pick), capped at `max`. */
export function sample(snippets, max = Infinity) {
  const vuln = snippets.filter((s) => s.vulnerable);
  const clean = snippets.filter((s) => !s.vulnerable).sort((a, b) => hash(a.id) - hash(b.id));
  const picked = [...vuln, ...clean.slice(0, vuln.length)];
  return picked.sort((a, b) => hash(a.id) - hash(b.id)).slice(0, max);
}
function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Rules baseline on the same snippets: a snippet is "vulnerable" if the rule scan reports a finding inside it. */
export async function rulesPredictor(core, sets) {
  const byFile = new Map();
  for (const s of sets) for (const f of await core.scan(s.files)) {
    const k = `${s.set}/${s.app}/${f.file}`;
    (byFile.get(k) ?? byFile.set(k, []).get(k)).push(f);
  }
  return async (snip) => {
    const hits = (byFile.get(`${snip.set}/${snip.app}/${snip.file}`) ?? []).filter((f) => f.line >= snip.start && f.line <= snip.end);
    return { vulnerable: hits.length > 0, category: hits[0]?.category ?? 'none', reason: hits[0]?.ruleId ?? '' };
  };
}

export function modelPredictor(client) {
  // The user message is the code only, exactly as in role A's training data (training/prepare_data.py).
  return async (snip) => client.generateJson(CLASSIFY_SYSTEM, snip.code, CLASSIFY_SCHEMA);
}

export function score(rows) {
  const valid = rows.filter((r) => r.pred && typeof r.pred.vulnerable === 'boolean');
  const tp = valid.filter((r) => r.truth.vulnerable && r.pred.vulnerable).length;
  const fp = valid.filter((r) => !r.truth.vulnerable && r.pred.vulnerable).length;
  const fn = valid.filter((r) => r.truth.vulnerable && !r.pred.vulnerable).length;
  const tn = valid.filter((r) => !r.truth.vulnerable && !r.pred.vulnerable).length;
  const catOk = valid.filter((r) => r.truth.vulnerable && r.pred.vulnerable && r.truth.categories.includes(r.pred.category)).length;
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return {
    snippets: rows.length,
    invalidOrError: rows.length - valid.length,
    tp, fp, fn, tn,
    precision: r3(precision),
    recall: r3(recall),
    f1: r3(precision + recall ? (2 * precision * recall) / (precision + recall) : 0),
    accuracy: r3(rows.length ? (tp + tn) / rows.length : 0),
    categoryAccuracy: r3(tp ? catOk / tp : 0),
    meanMs: Math.round(rows.reduce((a, r) => a + (r.ms ?? 0), 0) / Math.max(1, rows.length)),
  };
}

function parseArgs(argv) {
  const opt = { models: ['rules'], max: Infinity, delay: 0, out: path.join(here, 'model-eval.json') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--models') opt.models = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === '--max') opt.max = Number(argv[++i]);
    else if (argv[i] === '--delay') opt.delay = Number(argv[++i]);
    else if (argv[i] === '--out') opt.out = path.resolve(argv[++i]);
  }
  return opt;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const core = await loadCore({ forceMock: false });
  if (core.isMock) throw new Error('core/ engine not found');
  const sets = loadSets();
  const snippets = sample(sets.flatMap(buildSnippets), opt.max);
  console.log(`Test snippets: ${snippets.length} (${snippets.filter((s) => s.vulnerable).length} vulnerable) from ${sets.length} apps [${[...new Set(sets.map((s) => s.set))].join(', ')}]`);

  const results = { method: { task: 'snippet classification: vulnerable? + category', system: CLASSIFY_SYSTEM, snippets: snippets.length, sets: [...new Set(sets.map((s) => s.set))], note: 'Test apps are never in the training data. Rules = deterministic engine on the same snippets.', generatedAt: new Date().toISOString() }, models: {} };
  for (const m of opt.models) {
    let predict;
    let label = m;
    try {
      if (m === 'rules') predict = await rulesPredictor(core, sets);
      else if (m === 'gemini') {
        if (!process.env.GEMINI_API_KEY) { console.log(`- ${m}: skipped (no GEMINI_API_KEY)`); continue; }
        const c = createGeminiClient({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || DEFAULT_MODEL, fallbacks: DEFAULT_FALLBACKS });
        predict = modelPredictor(c);
        label = `gemini (${process.env.GEMINI_MODEL || DEFAULT_MODEL})`;
      } else if (m.startsWith('ollama:')) predict = modelPredictor(createOllamaClient({ model: m.slice(7), baseUrl: process.env.OLLAMA_URL || undefined }));
      else { console.log(`- ${m}: unknown model id`); continue; }
    } catch (e) {
      console.log(`- ${m}: skipped (${e.message})`);
      continue;
    }
    const rows = [];
    for (const [i, snip] of snippets.entries()) {
      const t0 = performance.now();
      let pred = null;
      let error = null;
      try {
        pred = await predict(snip);
        if (pred && !CATEGORIES.includes(pred.category)) pred.category = 'none';
      } catch (e) {
        error = e.message;
        if (i === 0 && /not reachable|HTTP 404/.test(e.message)) { console.log(`- ${m}: skipped (${e.message})`); break; }
      }
      rows.push({ id: snip.id, truth: { vulnerable: snip.vulnerable, categories: snip.categories }, pred, error, ms: Math.round(performance.now() - t0) });
      if (opt.delay && m !== 'rules') await new Promise((r) => setTimeout(r, opt.delay));
      if ((i + 1) % 20 === 0) process.stdout.write(`  ${m}: ${i + 1}/${snippets.length}\r`);
    }
    if (!rows.length) continue;
    results.models[label] = { ...score(rows), rows };
    const s = results.models[label];
    console.log(`- ${label.padEnd(36)} precision ${s.precision}  recall ${s.recall}  F1 ${s.f1}  category ${s.categoryAccuracy}  invalid ${s.invalidOrError}  ${s.meanMs} ms/snippet`);
  }
  writeFileSync(opt.out, JSON.stringify(results, null, 2) + '\n');
  console.log(`Saved ${path.relative(ROOT, opt.out)}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
