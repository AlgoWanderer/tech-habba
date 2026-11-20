import { describe, expect, it } from 'vitest';
import { applyIgnores, parseIgnoreFile } from '../lib/ignore.js';

const finding = (file, line, ruleId = 'route-no-auth') => ({ id: `${ruleId}:${file}:${line}`, ruleId, file, line, severity: 'high' });

describe('ignore', () => {
  it('matches path prefixes and globs', () => {
    const pats = parseIgnoreFile('# comment\nweb/src/mocks/\n**/*.fixture.js\n./server/exploit/sandbox.js\n');
    const files = [];
    const { kept, suppressed } = applyIgnores(
      [finding('web/src/mocks/a.ts', 1), finding('x/y/z.fixture.js', 1), finding('server/exploit/sandbox.js', 3), finding('server/index.js', 3), finding('web/src/mocksy.ts', 1)],
      files,
      pats,
    );
    expect(suppressed.map((f) => f.file)).toEqual(['web/src/mocks/a.ts', 'x/y/z.fixture.js', 'server/exploit/sandbox.js']);
    expect(kept.map((f) => f.file)).toEqual(['server/index.js', 'web/src/mocksy.ts']);
  });

  it('honours inline comments only for the named rule, on the same or previous line', () => {
    const content = [
      '// slopstop-ignore route-no-auth: local only',
      'app.get("/a", h);',
      'app.get("/b", h); // slopstop-ignore secret-hardcoded, route-no-auth: demo',
      '// slopstop-ignore secret-hardcoded: wrong rule',
      'app.get("/c", h);',
      '// slopstop-ignore',
      'app.get("/d", h);',
    ].join('\n');
    const files = [{ path: 'app.js', content }];
    const { kept, suppressed } = applyIgnores([finding('app.js', 2), finding('app.js', 3), finding('app.js', 5), finding('app.js', 7)], files);
    expect(suppressed.map((f) => f.line)).toEqual([2, 3]);
    expect(kept.map((f) => f.line)).toEqual([5, 7]);
  });
});
