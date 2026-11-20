import { describe, it, expect } from 'vitest';
import { parseAudit } from '../scanner/deps.js';
import { scan } from '../index.js';

const v7 = {
  auditReportVersion: 2,
  vulnerabilities: {
    lodash: {
      name: 'lodash',
      severity: 'critical',
      isDirect: true,
      range: '<4.17.21',
      via: [{ title: 'Prototype Pollution', url: 'https://github.com/advisories/GHSA-x' }],
      fixAvailable: { name: 'lodash', version: '4.17.21', isSemVerMajor: false },
    },
    qs: { name: 'qs', severity: 'moderate', isDirect: false, range: '<6.10.3', via: ['express'], fixAvailable: true },
  },
};
const pkg = '{\n  "dependencies": {\n    "express": "^4.0.0",\n    "lodash": "4.17.0"\n  }\n}\n';

describe('dep-vuln', () => {
  it('parses npm 7+ audit JSON into findings', () => {
    const fs = parseAudit(JSON.stringify(v7), pkg);
    expect(fs[0]).toMatchObject({
      id: 'dep-vuln:package.json:4',
      category: 'dependency',
      severity: 'critical',
      fixable: 'review',
      snippet: 'lodash@<4.17.21',
      fixPreview: 'npm install lodash@4.17.21',
    });
    expect(fs[1]).toMatchObject({ severity: 'medium', snippet: 'qs@<6.10.3 (transitive)' });
    expect(new Set(fs.map((f) => f.id)).size).toBe(2);
  });

  it('parses npm 6 advisories', () => {
    const fs = parseAudit({
      advisories: { 1: { module_name: 'minimist', severity: 'high', title: 'Proto', vulnerable_versions: '<1.2.6', patched_versions: '>=1.2.6' } },
    });
    expect(fs[0]).toMatchObject({ severity: 'high', message: expect.stringContaining('minimist: Proto') });
  });

  it('tolerates bad input', () => {
    expect(parseAudit('not json')).toEqual([]);
  });

  it('scan() picks up a submitted npm-audit.json file', () => {
    const fs = scan([
      { path: 'package.json', content: pkg },
      { path: 'npm-audit.json', content: JSON.stringify(v7) },
    ]);
    expect(fs.map((f) => f.ruleId)).toEqual(['dep-vuln', 'dep-vuln']);
  });
});
