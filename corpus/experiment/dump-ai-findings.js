// Collects the AI detector's findings (hybrid mode, one run) on the sets without full ground truth
// (raw, hardened) plus dvna, with the code line, so each one can be labelled true/false by hand
// in labels.json. Run AFTER run.js (both use the local QwenSkuld model):
//   node corpus/experiment/dump-ai-findings.js            -> corpus/experiment/ai-findings.json
import '../../server/env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCore } from '../../server/coreAdapter.js';
import { getAiClient } from '../../server/ai/client.js';
import { scanWithMode } from '../../server/ai/hybrid.js';
import { loadAppSet } from './run.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const core = await loadCore({ forceMock: false });
const client = getAiClient();
if (!client) {
  console.error('No AI model: set OLLAMA_MODEL=QwenSkuld in server/.env');
  process.exit(1);
}

const out = [];
for (const set of ['raw', 'hardened', 'dvna']) {
  for (const { app, files } of loadAppSet(set)) {
    let findings = [];
    try {
      findings = (await scanWithMode(core, files, 'hybrid', client)).findings;
    } catch (e) {
      console.log(`${set}/${app}: ${e.message}`);
      continue;
    }
    for (const f of findings.filter((x) => x.source === 'ai')) {
      out.push({ set, app, findingId: f.id, category: f.category, severity: f.severity, confidence: f.confidence, file: f.file, line: f.line, code: f.snippet, message: f.message });
    }
    process.stdout.write(`${set}/${app}: ${findings.filter((x) => x.source === 'ai').length} AI finding(s)\n`);
  }
}
const file = path.join(here, 'ai-findings.json');
fs.writeFileSync(file, JSON.stringify({ model: `${client.name} (last answered: ${client.lastModel})`, generatedAt: new Date().toISOString(), findings: out }, null, 2) + '\n');
console.log(`${out.length} AI findings -> ${path.relative(process.cwd(), file)}`);
