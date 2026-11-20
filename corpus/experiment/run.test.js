import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCore } from '../../server/coreAdapter.js';
import { createFakeClient } from '../../server/ai/client.js';
import {
  HYPOTHESIS,
  loadAppSet,
  matchGroundTruth,
  parseArgs,
  routeCount,
  runAiArm,
  runHybridArm,
  runRulesArm,
  stripFences,
} from './run.js';

describe('corpus experiment harness', () => {
  it('exports the exact required hypothesis text', () => {
    expect(HYPOTHESIS).toBe(
      'An LLM finds and fixes flaws that rules miss, but only a deterministic verifier makes its output safe to ship: rules + LLM + verifier (hybrid) finds more flaws than rules alone and breaks no apps, while the LLM alone breaks some.',
    );
  });

  it('correctly counts express route handlers', () => {
    const code = `
      app.get('/api/users', (req, res) => {});
      app.post('/api/users', (req, res) => {});
      router.delete('/api/users/:id', (req, res) => {});
      const x = app.listen(3000);
    `;
    expect(routeCount(code)).toBe(3);
    expect(routeCount('')).toBe(0);
    expect(routeCount(null)).toBe(0);
  });

  it('strips markdown code fences from model output', () => {
    expect(stripFences('```javascript\nconst a = 1;\n```')).toBe('const a = 1;');
    expect(stripFences('```js\nconst b = 2;\n```')).toBe('const b = 2;');
    expect(stripFences('const c = 3;')).toBe('const c = 3;');
  });

  it('matches findings against ground truth with line tolerance', () => {
    const flaws = [
      { category: 'secret', file: 'index.js', line: 10, severity: 'critical' },
      { category: 'auth', file: 'index.js', line: 20, severity: 'high' },
    ];
    const findings = [
      { category: 'secret', file: 'index.js', line: 11 }, // within 1
      { category: 'auth', file: 'index.js', line: 25 },   // not within 1
    ];
    expect(matchGroundTruth(findings, flaws)).toBe(1);
  });

  it('parses command line arguments', () => {
    const args = parseArgs(['--sets', 'raw,hardened', '--runs', '5', '--arms', 'rules,ai']);
    expect(args).toEqual({
      sets: ['raw', 'hardened'],
      runs: 5,
      arms: ['rules', 'ai'],
    });
  });

  it('loads valid app sets', () => {
    const raw = loadAppSet('raw');
    expect(raw.length).toBe(10);
    expect(raw[0].app).toBe('app01');
    expect(raw[0].files.some((f) => f.path === 'index.js')).toBe(true);
  });

  describe('three-way arms execution', () => {
    const sampleFiles = [
      {
        path: 'index.js',
        content: `import express from 'express';
const app = express();
const JWT_SECRET = 'secret123';
app.get('/api/data', (req, res) => res.json({ secret: JWT_SECRET }));
app.listen(3000);`,
      },
    ];

    it('runs the rules arm end to end', async () => {
      const core = await loadCore({ forceMock: false });
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopstop-test-'));
      try {
        const r = await runRulesArm(core, sampleFiles, null, tmpDir);
        expect(r.findingsCount).toBeGreaterThanOrEqual(1);
        expect(r.syntaxPass).toBe(true);
        expect(r.routesDeleted).toBe(0);
        expect(r.modelCalls).toBe(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('runs the AI arm with fake client and whole-file rewrite', async () => {
      const core = await loadCore({ forceMock: false });
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopstop-test-'));
      const fakeClient = createFakeClient((sys, user) => {
        if (sys.includes('Return ONLY the complete corrected file')) {
          return {
            code: `import express from 'express';
const app = express();
const JWT_SECRET = process.env.JWT_SECRET;
app.get('/api/data', (req, res) => res.json({ ok: true }));
app.listen(3000);`,
          };
        }
        return []; // detection response
      });

      try {
        const r = await runAiArm(core, sampleFiles, null, fakeClient, tmpDir);
        expect(r.syntaxPass).toBe(true);
        expect(r.routesDeleted).toBe(0);
        expect(r.modelCalls).toBeGreaterThanOrEqual(1);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('runs the hybrid arm with fake client', async () => {
      const core = await loadCore({ forceMock: false });
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slopstop-test-'));
      const fakeClient = createFakeClient(() => []);

      try {
        const r = await runHybridArm(core, sampleFiles, null, fakeClient, tmpDir);
        expect(r.syntaxPass).toBe(true);
        expect(r.routesDeleted).toBe(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
