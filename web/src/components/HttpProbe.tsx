// Live HTTP exploit probes: turns the verifier's HTTP-test reasons into before/after attack cards.
// Parses the exact sentences server/exploit/httpTest.js writes; anything it can't parse is not shown.
import React from 'react';
import { FixResult } from '../types';
import { cx } from './ui';
import { Radar, Lock, Unlock, UserCheck, UserX, ShieldX } from 'lucide-react';

type Line = { kind: 'leak' | 'blocked' | 'works' | 'broken'; who: string; text: string; status: string };
type Probe = { id: string; route: string; passed: boolean; lines: Line[] };

const PASSED = /HTTP test passed on (\S+) (\S+): before the fix (.+?\(\d{1,3}[^)]*\)); after it (.+?\(\d{1,3}[^)]*\)), and (.+?(?:\(\d{1,3}[^)]*\)|crashed))/;
const FAILED = /HTTP (normal|attack) mode FAILED on (\S+) (\S+): ([^;]+)/;
const code = (s: string) => s.match(/\((\d{1,3}[^)]*)\)/)?.[1].replace(', ', ' · ') ?? '—';
const clean = (s: string) => s.replace(/\s*\(\d{1,3}[^)]*\)\s*$/, '');

export function parseProbes(results: FixResult[]): Probe[] {
  const out: Probe[] = [];
  for (const r of results) {
    const p = r.reason.match(PASSED);
    if (p) {
      out.push({
        id: r.findingId, route: `${p[1]} ${p[2]}`, passed: true,
        lines: [
          { kind: 'leak', who: 'Attack · before fix', text: clean(p[3]), status: code(p[3]) },
          { kind: 'blocked', who: 'Attack · after fix', text: clean(p[4]), status: code(p[4]) },
          { kind: 'works', who: 'Real user · after fix', text: clean(p[5]), status: code(p[5]) },
        ],
      });
      continue;
    }
    const f = r.reason.match(FAILED);
    if (f) {
      out.push({
        id: r.findingId, route: `${f[2]} ${f[3]}`, passed: false,
        lines: [{ kind: f[1] === 'normal' ? 'broken' : 'leak', who: f[1] === 'normal' ? 'Real user · after AI fix' : 'Attack · after AI fix', text: clean(f[4]), status: code(f[4]) }],
      });
    }
  }
  return out;
}

const KIND: Record<Line['kind'], { icon: React.ReactNode; chip: string; word: string }> = {
  leak: { icon: <Unlock className="w-3.5 h-3.5 text-rose-500" />, chip: 'bg-rose-50 text-rose-700 border-rose-200', word: 'Exploited' },
  blocked: { icon: <Lock className="w-3.5 h-3.5 text-emerald-600" />, chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', word: 'Blocked' },
  works: { icon: <UserCheck className="w-3.5 h-3.5 text-emerald-600" />, chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', word: 'Still works' },
  broken: { icon: <UserX className="w-3.5 h-3.5 text-rose-500" />, chip: 'bg-rose-50 text-rose-700 border-rose-200', word: 'Broken' },
};

export const HttpProbe: React.FC<{ results: FixResult[] }> = ({ results }) => {
  const probes = parseProbes(results);
  if (!probes.length) return null;
  let delay = 0;
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 ss-fade-up">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center"><Radar className="w-4 h-4" /></span>
        <h2 className="text-[15px] font-semibold text-slate-900">Live HTTP exploit probes</h2>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Each fix was attacked for real in a sandbox: the exploit must work before, be blocked after, and the real user must still get in.
      </p>
      <div className="space-y-3">
        {probes.map((p) => (
          <div key={p.id} className={cx('rounded-lg border overflow-hidden', p.passed ? 'border-slate-200' : 'border-rose-200')}>
            <div className={cx('flex items-center justify-between gap-2 px-3.5 py-2 font-mono text-[12px]', p.passed ? 'bg-slate-50 text-slate-700' : 'bg-rose-50/70 text-rose-800')}>
              <span className="truncate"><span className="text-slate-400">$ </span>{p.route}</span>
              <span className={cx('inline-flex items-center gap-1 h-5 px-2 rounded-full border text-[11px] font-sans font-semibold flex-shrink-0', p.passed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-100 text-rose-700 border-rose-200')}>
                {p.passed ? 'Proven' : <><ShieldX className="w-3 h-3" />AI fix rejected</>}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {p.lines.map((l) => {
                delay += 120;
                return (
                  <div key={l.who} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3.5 py-2 ss-fade-up" style={{ animationDelay: `${delay}ms` }}>
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 w-[150px]">{KIND[l.kind].icon}{l.who}</span>
                    <span className="text-xs text-slate-700 min-w-0">{l.text}</span>
                    <span className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="font-mono text-[12px] text-slate-500">{l.status}</span>
                      <span className={cx('h-5 px-2 rounded-md border text-[11px] font-semibold inline-flex items-center', KIND[l.kind].chip)}>{KIND[l.kind].word}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
