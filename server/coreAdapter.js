// The ONLY place the server touches role A's core/ and role D's core/promptHardener.js.
// If those files exist they are used; otherwise contract-shaped mock data is returned so the
// dashboard (role D) can be built before the engine lands. Set SLOPSTOP_MOCK_CORE=1 to force mocks.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// SLOPSTOP_CORE=<path to a module> swaps in another engine (tests, benchmarks).
const CORE_INDEX = process.env.SLOPSTOP_CORE ? path.resolve(process.env.SLOPSTOP_CORE) : path.resolve(here, '../core/index.js');
const HARDENER = path.resolve(here, '../core/promptHardener.js');
const CONTRACT = path.resolve(here, '../contract');

const WEIGHTS = { critical: 25, high: 15, medium: 8, low: 3 };

/** Score formula from the contract. Used by the mock core only. */
export function contractScore(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) if (f.severity in counts) counts[f.severity] += 1;
  const penalty = Object.entries(counts).reduce((sum, [k, n]) => sum + WEIGHTS[k] * n, 0);
  return { safety: Math.max(0, 100 - penalty), counts };
}

export function loadSample(name) {
  return JSON.parse(readFileSync(path.join(CONTRACT, name), 'utf8'));
}

function mockCore() {
  return {
    isMock: true,
    scan: async () => loadSample('sample-scan.json').findings,
    computeScore: async (findings) => contractScore(findings),
    applyFixes: async () => {
      const { patched, envFile, results } = loadSample('sample-fix.json');
      return { patched, envFile, results };
    },
    sampleFix: () => loadSample('sample-fix.json'),
  };
}

export async function loadCore({ forceMock = process.env.SLOPSTOP_MOCK_CORE === '1' } = {}) {
  if (forceMock || !existsSync(CORE_INDEX)) return mockCore();
  const m = await import(pathToFileURL(CORE_INDEX).href);
  for (const fn of ['scan', 'computeScore', 'applyFixes']) {
    if (typeof m[fn] !== 'function') throw new Error(`core/index.js must export ${fn}() (see contract)`);
  }
  return {
    isMock: false,
    scan: async (files) => m.scan(files),
    computeScore: async (findings) => m.computeScore(findings),
    applyFixes: async (files, findings) => m.applyFixes(files, findings),
    // Phase 2 (role A): passed through when core exports them; server/ai uses its fallbacks otherwise.
    ...(typeof m.maskSecrets === 'function' ? { maskSecrets: async (files) => m.maskSecrets(files) } : {}),
    ...(typeof m.mergeFindings === 'function' ? { mergeFindings: (rules, ai) => m.mergeFindings(rules, ai) } : {}),
  };
}

// ---- prompt hardener (role D owns the real one) ----

const MOCK_RULES = [
  'Read every secret (API keys, tokens, passwords, database URIs) from environment variables; never hard-code them.',
  'Validate and sanitise all user input; reject objects containing MongoDB $ operators.',
  'Use parameterised queries; never build SQL or NoSQL queries by string concatenation.',
  'Protect every non-public route with authentication middleware.',
  'Check that the logged-in user owns any resource fetched by id.',
  'Pin dependency versions and use packages with no known vulnerabilities.',
];

const MOCK_PATTERNS = [
  ['MONGODB_URI', /mongodb(?:\+srv)?:\/\/[^\s:@/]+:[^\s@/]+@[^\s"'`]+/g],
  ['API_KEY', /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g],
  ['API_KEY', /\bsk-[A-Za-z0-9_-]{16,}\b/g],
  ['AWS_KEY', /\bAKIA[0-9A-Z]{16}\b/g],
  ['JWT', /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g],
];

function mockHarden(prompt) {
  const redactions = [];
  const counters = {};
  let text = prompt;
  for (const [type, re] of MOCK_PATTERNS) {
    text = text.replace(re, (original) => {
      counters[type] = (counters[type] ?? 0) + 1;
      redactions.push({ type, original });
      return `<${type}_${counters[type]}>`;
    });
  }
  const hardened = [
    'You are writing production code. Follow these security rules strictly:',
    ...MOCK_RULES.map((r, i) => `${i + 1}. ${r}`),
    '',
    'Task:',
    text,
  ].join('\n');
  return { hardened, redactions, rules: [...MOCK_RULES] };
}

export async function loadHardener({ forceMock = process.env.SLOPSTOP_MOCK_CORE === '1' } = {}) {
  if (forceMock || !existsSync(HARDENER)) return { isMock: true, harden: async (p) => mockHarden(p) };
  const m = await import(pathToFileURL(HARDENER).href);
  const fn = m.harden ?? m.default;
  if (typeof fn !== 'function') throw new Error('core/promptHardener.js must export harden(prompt)');
  return { isMock: false, harden: async (p) => fn(p) };
}
