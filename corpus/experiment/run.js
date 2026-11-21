// SlopStop three-way experiment: RULES only vs AI only vs HYBRID (rules + AI + verifier)
// Hypothesis: "An LLM finds and fixes flaws that rules miss, but only a deterministic verifier makes its output safe to ship: rules + LLM + verifier (hybrid) finds more flaws than rules alone and breaks no apps, while the LLM alone breaks some."
//
// Usage:
//   node corpus/experiment/run.js [--sets corpus,raw,hardened] [--runs 3] [--arms rules,ai,hybrid]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import '../../server/env.js';
import { loadCore } from '../../server/coreAdapter.js';
import { runFix, runScan } from '../../server/pipeline.js';
import { getAiClient } from '../../server/ai/client.js';
import { fixHybrid, scanWithMode } from '../../server/ai/hybrid.js';
import { aiDetect } from '../../server/ai/detect.js';
import { maskForModel } from '../../server/ai/mask.js';
import { checkSyntax } from '../../server/verify.js';

export const LLM_SYSTEM_PROMPT =
  'You are an automated code fixing assistant. You are given a Node.js/Express file with potential security vulnerabilities. Return ONLY the complete corrected file. Do not wrap in markdown or add explanations.';

export const HYPOTHESIS =
  'An LLM finds and fixes flaws that rules miss, but only a deterministic verifier makes its output safe to ship: rules + LLM + verifier (hybrid) finds more flaws than rules alone and breaks no apps, while the LLM alone breaks some.';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(__dirname, '..');
const appsDir = path.join(corpusDir, 'apps');
const rawDir = path.join(corpusDir, 'wild/raw');
const hardenedDir = path.join(corpusDir, 'wild/hardened');
const groundTruthPath = path.join(corpusDir, 'ground-truth.json');
const dvnaDir = path.join(corpusDir, 'external/dvna');
const dvnaGroundTruthPath = path.join(corpusDir, 'external/dvna-ground-truth.json');
// External code is scanned and shown to the model, but never executed (no HTTP sandbox test).
const NEVER_EXECUTE = new Set(['dvna']);
const resultsPath = path.join(__dirname, 'results.json');

const HIGH = new Set(['critical', 'high']);
const LINE_TOLERANCE = 1;

export function routeCount(code) {
  if (typeof code !== 'string') return 0;
  return (code.match(/\b(app|router)\.(get|post|put|delete|patch)\s*\(/g) || []).length;
}

export function stripFences(text) {
  if (typeof text !== 'string') return '';
  const m = text.match(/```(?:[a-z0-9_-]+)?\r?\n([\s\S]*?)```/i);
  return m ? m[1].trim() : text.trim();
}

export function matchGroundTruth(findings, flaws) {
  if (!Array.isArray(flaws) || flaws.length === 0) return 0;
  const used = new Set();
  let matched = 0;
  for (const gt of flaws) {
    const idx = findings.findIndex(
      (f, i) =>
        !used.has(i) &&
        f.category === gt.category &&
        f.file === gt.file &&
        Math.abs(f.line - gt.line) <= LINE_TOLERANCE,
    );
    if (idx >= 0) {
      used.add(idx);
      matched++;
    }
  }
  return matched;
}

export function parseArgs(args = process.argv.slice(2)) {
  let sets = ['corpus', 'raw', 'hardened'];
  let runs = 3;
  let arms = ['rules', 'ai', 'hybrid'];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--sets' && args[i + 1]) sets = args[++i].split(',').map((s) => s.trim().toLowerCase());
    else if (a.startsWith('--sets=')) sets = a.slice(7).split(',').map((s) => s.trim().toLowerCase());
    else if (a === '--runs' && args[i + 1]) runs = Math.max(1, parseInt(args[++i], 10) || 3);
    else if (a.startsWith('--runs=')) runs = Math.max(1, parseInt(a.slice(7), 10) || 3);
    else if (a === '--arms' && args[i + 1]) arms = args[++i].split(',').map((s) => s.trim().toLowerCase());
    else if (a.startsWith('--arms=')) arms = a.slice(7).split(',').map((s) => s.trim().toLowerCase());
  }
  return { sets, runs, arms };
}

function walkFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'node_modules' ? [] : walkFiles(full, base);
    return /\.(c|m)?js$/.test(d.name) || d.name === 'package.json'
      ? [{ path: path.relative(base, full).split(path.sep).join('/'), content: fs.readFileSync(full, 'utf-8') }]
      : [];
  });
}

export function loadAppSet(setName) {
  if (setName === 'dvna') return fs.existsSync(dvnaDir) ? [{ set: 'dvna', app: 'dvna', files: walkFiles(dvnaDir) }] : [];
  let baseDir = '';
  if (setName === 'corpus') baseDir = appsDir;
  else if (setName === 'raw') baseDir = rawDir;
  else if (setName === 'hardened') baseDir = hardenedDir;
  else throw new Error(`Unknown app set: ${setName}`);

  if (!fs.existsSync(baseDir)) return [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^app\d+$/.test(d.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  return entries.map((e) => {
    const dir = path.join(baseDir, e.name);
    const files = fs.readdirSync(dir)
      .filter((f) => /\.(c|m)?js$/.test(f) || f === 'package.json')
      .sort()
      .map((f) => ({ path: f, content: fs.readFileSync(path.join(dir, f), 'utf-8') }));
    return { set: setName, app: e.name, files };
  });
}

function checkFilesSyntax(files, tmpDir) {
  for (const f of files) {
    if (/\.(c|m)?js$/.test(f.path)) {
      const syn = checkSyntax(f.content, tmpDir, f.path);
      if (!syn.ok) return { ok: false, error: syn.error };
    }
  }
  return { ok: true };
}

function computeRoutes(files) {
  return files
    .filter((f) => /\.(c|m)?js$/.test(f.path))
    .reduce((sum, f) => sum + routeCount(f.content), 0);
}

export async function runRulesArm(core, files, flaws, tmpDir) {
  const t0 = performance.now();
  const before = await runScan(core, files);
  const chBefore = before.findings.filter((f) => HIGH.has(f.severity)).length;
  const gtFound = matchGroundTruth(before.findings, flaws);

  const fix = await runFix(core, files, before.findings.map((f) => f.id));
  const current = files.map((f) => {
    const p = fix.patched.find((x) => x.path === f.path);
    return p ? { path: f.path, content: p.patched } : { ...f };
  });

  const durationMs = Math.round(performance.now() - t0);
  const syn = checkFilesSyntax(current, tmpDir);
  const chAfter = fix.rescan.findings.filter((f) => HIGH.has(f.severity)).length;
  const routesBefore = computeRoutes(files);
  const routesAfter = computeRoutes(current);

  return {
    findingsCount: before.findings.length,
    groundTruthFound: flaws ? gtFound : null,
    criticalHighBefore: chBefore,
    criticalHighAfter: chAfter,
    syntaxPass: syn.ok,
    syntaxError: syn.error ?? null,
    routesBefore,
    routesAfter,
    routesDeleted: Math.max(0, routesBefore - routesAfter),
    aiPatchesApplied: 0,
    aiPatchesRejected: 0,
    durationMs,
    modelCalls: 0,
  };
}

export async function runAiArm(core, files, flaws, client, tmpDir) {
  const t0 = performance.now();
  const initialCalls = client.calls;

  // 1. Detection via model
  const aiFindings = await aiDetect(core, files, client);
  const gtFound = matchGroundTruth(aiFindings, flaws);

  // 2. Whole-file rewrite with NO verifier
  const { files: masked } = await maskForModel(core, files);
  const current = [];
  for (const f of files) {
    if (/\.(c|m)?js$/.test(f.path)) {
      const mf = masked.find((m) => m.path === f.path) ?? f;
      const res = await client.generateJson(
        LLM_SYSTEM_PROMPT,
        mf.content,
        { type: 'OBJECT', properties: { code: { type: 'STRING' } } },
      );
      const rawCode = res?.code ?? (typeof res === 'string' ? res : mf.content);
      current.push({ path: f.path, content: stripFences(rawCode) });
    } else {
      current.push({ ...f });
    }
  }

  const durationMs = Math.round(performance.now() - t0);
  const modelCalls = client.calls - initialCalls;

  // Re-scan with RULES scanner as judge
  const judgeBefore = await runScan(core, files);
  const judgeAfter = await runScan(core, current);
  const syn = checkFilesSyntax(current, tmpDir);
  const routesBefore = computeRoutes(files);
  const routesAfter = computeRoutes(current);

  return {
    findingsCount: aiFindings.length,
    groundTruthFound: flaws ? gtFound : null,
    criticalHighBefore: judgeBefore.findings.filter((f) => HIGH.has(f.severity)).length,
    criticalHighAfter: judgeAfter.findings.filter((f) => HIGH.has(f.severity)).length,
    syntaxPass: syn.ok,
    syntaxError: syn.error ?? null,
    routesBefore,
    routesAfter,
    routesDeleted: Math.max(0, routesBefore - routesAfter),
    aiPatchesApplied: current.filter((c, i) => c.content !== files[i].content).length,
    aiPatchesRejected: 0, // No verifier in AI-only arm
    durationMs,
    modelCalls,
  };
}

export async function runHybridArm(core, files, flaws, client, tmpDir, { httpTest = true } = {}) {
  const t0 = performance.now();
  const initialCalls = client.calls;

  // Hybrid scan
  const scan = await scanWithMode(core, files, 'hybrid', client);
  const gtFound = matchGroundTruth(scan.findings, flaws);
  const aiFindings = scan.findings.filter((f) => f.source === 'ai');

  // Hybrid fix (deterministic rule patches + verified AI patches, including the two-mode HTTP test)
  const fix = await fixHybrid(core, files, scan.findings.map((f) => f.id), client, { aiFindings, httpTest });
  const current = files.map((f) => {
    const p = fix.patched.find((x) => x.path === f.path);
    return p ? { path: f.path, content: p.patched } : { ...f };
  });

  const durationMs = Math.round(performance.now() - t0);
  const modelCalls = client.calls - initialCalls;

  // Re-scan with RULES scanner as judge
  const judgeBefore = await runScan(core, files);
  const judgeAfter = await runScan(core, current);
  const syn = checkFilesSyntax(current, tmpDir);
  const routesBefore = computeRoutes(files);
  const routesAfter = computeRoutes(current);

  const applied = fix.results.filter((r) => r.source === 'ai' && r.status === 'applied').length;
  const rejected = fix.results.filter((r) => r.source === 'ai' && r.status === 'rejected').length;

  return {
    findingsCount: scan.findings.length,
    groundTruthFound: flaws ? gtFound : null,
    criticalHighBefore: judgeBefore.findings.filter((f) => HIGH.has(f.severity)).length,
    criticalHighAfter: judgeAfter.findings.filter((f) => HIGH.has(f.severity)).length,
    syntaxPass: syn.ok,
    syntaxError: syn.error ?? null,
    routesBefore,
    routesAfter,
    routesDeleted: Math.max(0, routesBefore - routesAfter),
    aiPatchesApplied: applied,
    aiPatchesRejected: rejected,
    durationMs,
    modelCalls,
  };
}

function stats(nums) {
  if (!nums.length) return { mean: 0, min: 0, max: 0 };
  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    mean: Math.round((sum / nums.length) * 100) / 100,
    min: Math.min(...nums),
    max: Math.max(...nums),
  };
}

function aggregateRuns(runList) {
  if (runList.length === 1) return { ...runList[0], runs: runList };
  return {
    findingsCount: stats(runList.map((r) => r.findingsCount)),
    groundTruthFound: runList[0].groundTruthFound !== null ? stats(runList.map((r) => r.groundTruthFound)) : null,
    criticalHighBefore: runList[0].criticalHighBefore,
    criticalHighAfter: stats(runList.map((r) => r.criticalHighAfter)),
    syntaxPassRate: Math.round((runList.filter((r) => r.syntaxPass).length / runList.length) * 100) / 100,
    routesDeleted: stats(runList.map((r) => r.routesDeleted)),
    aiPatchesApplied: stats(runList.map((r) => r.aiPatchesApplied)),
    aiPatchesRejected: stats(runList.map((r) => r.aiPatchesRejected)),
    durationMs: stats(runList.map((r) => r.durationMs)),
    modelCalls: stats(runList.map((r) => r.modelCalls)),
    runs: runList,
  };
}

function buildArmSummary(armName, perAppRows, totalGtFlaws, gtSet = 'corpus') {
  const rows = perAppRows.map((r) => r[armName]).filter(Boolean);
  if (!rows.length) return { status: 'skipped' };

  const totalApps = rows.length;
  const syntaxPassCount = rows.filter((r) => (r.syntaxPassRate !== undefined ? r.syntaxPassRate === 1 : r.syntaxPass)).length;
  const brokenApps = rows.filter((r) => {
    const synOk = r.syntaxPassRate !== undefined ? r.syntaxPassRate === 1 : r.syntaxPass;
    const delRoutes = r.routesDeleted?.max !== undefined ? r.routesDeleted.max > 0 : r.routesDeleted > 0;
    return !synOk || delRoutes;
  }).length;

  const getNum = (r, key, stat = 'mean') => (r[key]?.[stat] !== undefined ? r[key][stat] : (r[key] ?? 0));
  const totalFindings = Math.round(rows.reduce((sum, r) => sum + getNum(r, 'findingsCount'), 0) * 100) / 100;
  const chBefore = rows.reduce((sum, r) => sum + getNum(r, 'criticalHighBefore'), 0);
  const chAfter = Math.round(rows.reduce((sum, r) => sum + getNum(r, 'criticalHighAfter'), 0) * 100) / 100;
  const chReduct = chBefore === 0 ? 0 : Math.round(((chBefore - chAfter) / chBefore) * 1000) / 10;
  const totalDeletedRoutes = Math.round(rows.reduce((sum, r) => sum + getNum(r, 'routesDeleted'), 0) * 100) / 100;
  const totalCalls = Math.round(rows.reduce((sum, r) => sum + getNum(r, 'modelCalls'), 0));
  const meanDuration = Math.round((rows.reduce((sum, r) => sum + getNum(r, 'durationMs'), 0) / totalApps) * 100) / 100;

  const corpusRows = perAppRows.filter((p) => p.set === gtSet && p[armName]).map((p) => p[armName]);
  const gtDetected = corpusRows.length ? Math.round(corpusRows.reduce((sum, r) => sum + getNum(r, 'groundTruthFound'), 0) * 100) / 100 : null;
  const gtRecall = gtDetected !== null && totalGtFlaws > 0 ? Math.round((gtDetected / totalGtFlaws) * 1000) / 1000 : null;

  return {
    status: 'completed',
    totalApps,
    totalFindings,
    criticalHighBefore: chBefore,
    criticalHighAfter: chAfter,
    criticalHighReductionPercent: chReduct,
    syntaxPassRate: Math.round((syntaxPassCount / totalApps) * 100) / 100,
    routesDeletedTotal: totalDeletedRoutes,
    brokenAppsCount: brokenApps,
    groundTruthFlawsDetected: gtDetected,
    groundTruthRecall: gtRecall,
    meanDurationMsPerApp: meanDuration,
    totalModelCalls: totalCalls,
  };
}

export async function runExperiment({ sets, runs, arms } = parseArgs()) {
  console.log(`Starting SlopStop Three-Way Experiment...`);
  console.log(`Hypothesis: "${HYPOTHESIS}"`);
  console.log(`Sets: ${sets.join(', ')} | Runs for AI arms: ${runs} | Arms: ${arms.join(', ')}`);

  const core = await loadCore({ forceMock: false });
  if (core.isMock) {
    console.error('Real core engine not found; aborting experiment.');
    process.exit(1);
  }

  const client = getAiClient();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopstop-exp-'));

  const groundTruth = fs.existsSync(groundTruthPath)
    ? JSON.parse(fs.readFileSync(groundTruthPath, 'utf-8'))
    : { apps: [] };
  const totalGtFlaws = groundTruth.apps.reduce((sum, a) => sum + a.flaws.length, 0);
  const dvnaTruth = fs.existsSync(dvnaGroundTruthPath) ? JSON.parse(fs.readFileSync(dvnaGroundTruthPath, 'utf-8')) : { apps: [] };
  const truthFor = (set, app) => (set === 'corpus' ? groundTruth : set === 'dvna' ? dvnaTruth : null)?.apps.find((a) => a.app === app)?.flaws ?? null;
  const gtTotalFor = (set) => (set === 'corpus' ? totalGtFlaws : set === 'dvna' ? dvnaTruth.apps.reduce((s, a) => s + a.flaws.length, 0) : 0);

  const allApps = [];
  for (const s of sets) {
    const loaded = loadAppSet(s);
    allApps.push(...loaded);
  }
  console.log(`Loaded ${allApps.length} total app(s) across selected set(s).`);

  const perApp = [];
  const runRules = arms.includes('rules');
  const runAi = arms.includes('ai');
  const runHybrid = arms.includes('hybrid');

  if ((runAi || runHybrid) && !client) {
    console.warn('\n[!] skipped: no AI model, set OLLAMA_MODEL=QwenSkuld in server/.env (AI arms skipped; RULES running end to end)\n');
  }

  for (let idx = 0; idx < allApps.length; idx++) {
    const { set, app, files } = allApps[idx];
    const flaws = truthFor(set, app);

    const row = { set, app };
    process.stdout.write(`[${idx + 1}/${allApps.length}] ${set}/${app}... `);

    // 1. RULES ARM
    if (runRules) {
      row.rules = await runRulesArm(core, files, flaws, tmpDir);
    }

    // 2. AI ARM
    if (runAi) {
      if (!client) {
        row.ai = { status: 'skipped', reason: 'no AI model (OLLAMA_MODEL)' };
      } else {
        const aiRuns = [];
        for (let r = 0; r < runs; r++) {
          aiRuns.push(await runAiArm(core, files, flaws, client, tmpDir));
        }
        row.ai = aggregateRuns(aiRuns);
      }
    }

    // 3. HYBRID ARM
    if (runHybrid) {
      if (!client) {
        row.hybrid = { status: 'skipped', reason: 'no AI model (OLLAMA_MODEL)' };
      } else {
        const hybridRuns = [];
        for (let r = 0; r < runs; r++) {
          hybridRuns.push(await runHybridArm(core, files, flaws, client, tmpDir, { httpTest: !NEVER_EXECUTE.has(set) }));
        }
        row.hybrid = aggregateRuns(hybridRuns);
      }
    }

    perApp.push(row);
    console.log('done');
  }

  const summary = {};
  if (runRules) summary.rules = buildArmSummary('rules', perApp, totalGtFlaws);
  if (runAi) {
    summary.ai = client
      ? buildArmSummary('ai', perApp, totalGtFlaws)
      : { status: 'skipped', reason: 'no AI model (OLLAMA_MODEL)' };
  }
  if (runHybrid) {
    summary.hybrid = client
      ? buildArmSummary('hybrid', perApp, totalGtFlaws)
      : { status: 'skipped', reason: 'no AI model (OLLAMA_MODEL)' };
  }

  // Per-set summaries, so outside code (dvna) and AI-written apps (raw, hardened) are not blended with the corpus.
  const bySet = {};
  for (const s of sets) {
    const rows = perApp.filter((p) => p.set === s);
    if (!rows.length) continue;
    bySet[s] = {};
    for (const arm of ['rules', 'ai', 'hybrid']) {
      if (!arms.includes(arm)) continue;
      bySet[s][arm] = arm !== 'rules' && !client ? { status: 'skipped', reason: 'no AI model (OLLAMA_MODEL)' } : buildArmSummary(arm, rows, gtTotalFor(s), s);
    }
  }

  const result = {
    method: {
      hypothesis: HYPOTHESIS,
      generatedAt: new Date().toISOString(),
      runs,
      sets,
      arms,
      model: client ? `${client.name} (last answered: ${client.lastModel ?? 'n/a'})` : 'none (no OLLAMA_MODEL)',
      totalApps: allApps.length,
      groundTruth: 'corpus: corpus/ground-truth.json; dvna: corpus/external/dvna-ground-truth.json (documented flaws only); raw/hardened: no ground truth',
      httpTest: `hybrid arm runs the two-mode HTTP test except on ${[...NEVER_EXECUTE].join(', ')} (never executed)`,
    },
    summary,
    bySet,
    perApp,
  };

  fs.writeFileSync(resultsPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\nExperiment finished! Results saved to: corpus/experiment/results.json`);

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}

  return result;
}

// Run directly from CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runExperiment().catch((err) => {
    console.error('Experiment failed:', err);
    process.exit(1);
  });
}
