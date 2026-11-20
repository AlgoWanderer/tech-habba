// Fails if any API response drifts from contract/finding.schema.json: renamed keys, extra or
// missing fields, or wrong enum values. Runs against both the mock core and a fake real core.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { createApp } from '../index.js';
import { loadCore, loadHardener, loadSample } from '../coreAdapter.js';
import { makeFakeCore, SAMPLE_FILES } from './fakeCore.js';

const schema = JSON.parse(readFileSync(new URL('../../contract/finding.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ allErrors: true });
ajv.addSchema(schema, 'contract');
const validator = (name) => ajv.getSchema(`contract#/definitions/${name}`);

const TOP_KEYS = {
  scan: ['findings', 'score'],
  fix: ['patched', 'envFile', 'results', 'rescan', 'timingMs'],
  exploit: ['after', 'before'],
  harden: ['hardened', 'redactions', 'rules'],
};

function expectValid(name, data) {
  const v = validator(name);
  const ok = v(data);
  expect(ok, JSON.stringify(v.errors, null, 2)).toBe(true);
}
const expectOnlyKeys = (obj, allowed) => Object.keys(obj).forEach((k) => expect(allowed).toContain(k));

async function serve(core) {
  const app = await createApp({ core, hardener: await loadHardener({ forceMock: true }) });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body) => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };
  return { server, post };
}

it('contract samples are themselves valid', () => {
  expectValid('ScanResponse', loadSample('sample-scan.json'));
  expectValid('FixResponse', loadSample('sample-fix.json'));
});

for (const [label, makeCore] of [['mock core', () => loadCore({ forceMock: true })], ['fake real core', async () => makeFakeCore()]]) {
  describe(`API responses match the contract (${label})`, () => {
    let ctx;
    beforeAll(async () => { ctx = await serve(await makeCore()); });
    afterAll(() => new Promise((r) => ctx.server.close(r)));

    it('POST /api/scan', async () => {
      const { status, json } = await ctx.post('/api/scan', { files: SAMPLE_FILES });
      expect(status).toBe(200);
      expectValid('ScanResponse', json);
      expectOnlyKeys(json, TOP_KEYS.scan);
    });

    it('POST /api/fix', async () => {
      const scan = await ctx.post('/api/scan', { files: SAMPLE_FILES });
      const { status, json } = await ctx.post('/api/fix', { files: SAMPLE_FILES, findingIds: scan.json.findings.map((f) => f.id) });
      expect(status).toBe(200);
      expectValid('FixResponse', json);
      expectOnlyKeys(json, TOP_KEYS.fix);
      json.patched.forEach((p) => expectOnlyKeys(p, ['path', 'original', 'patched']));
      json.results.forEach((r) => expectOnlyKeys(r, ['findingId', 'status', 'reason']));
    });

    it('POST /api/exploit', async () => {
      const { status, json } = await ctx.post('/api/exploit', {});
      expect(status).toBe(200);
      expectOnlyKeys(json, TOP_KEYS.exploit);
      expect(json.before.status).toBe(200);
      expect(json.after.status).toBe(401);
    });

    it('POST /api/harden-prompt', async () => {
      const { status, json } = await ctx.post('/api/harden-prompt', { prompt: 'Build a todo API. My key is sk_live_ABCDEFGH12345678' });
      expect(status).toBe(200);
      expectOnlyKeys(json, TOP_KEYS.harden);
      expect(json.hardened).not.toContain('sk_live_ABCDEFGH12345678');
      expect(json.redactions[0]).toEqual({ type: 'API_KEY', original: 'sk_live_ABCDEFGH12345678' });
      expect(Array.isArray(json.rules)).toBe(true);
    });

    it('rejects bad input with 400', async () => {
      expect((await ctx.post('/api/scan', { files: [] })).status).toBe(400);
      expect((await ctx.post('/api/fix', { files: SAMPLE_FILES, findingIds: 'x' })).status).toBe(400);
      expect((await ctx.post('/api/harden-prompt', {})).status).toBe(400);
    });
  });
}
