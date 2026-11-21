// Live HTTP probe: for every fix the server tested, the real attack before/after and a real user after.
import React from 'react';
import { ArrowRight, UserCheck, Bug, ShieldCheck, ShieldX } from 'lucide-react';
import { HttpCheck } from '../gate/pipeline';
import { cx } from './ui';

const ok = (s?: number) => s !== undefined && s >= 200 && s < 300;

const StatusChip: React.FC<{ code?: number; good: boolean; label: string; delay: number }> = ({ code, good, label, delay }) => (
  <span
    className={cx(
      'gate-pop inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border font-mono text-xs font-semibold tabular-nums',
      good ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200',
    )}
    style={{ animationDelay: `${delay}ms` }}
  >
    {code ?? '—'}
    <span className="font-sans font-medium">{label}</span>
  </span>
);

export const HttpProbe: React.FC<{ checks: HttpCheck[]; tested: number }> = ({ checks, tested }) => {
  if (checks.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        <div className="font-semibold text-slate-900 text-[15px] mb-1">Live HTTP test</div>
        No fix in this app could be exercised over HTTP in the sandbox (for example, secrets have no HTTP attack, or the
        app needs a real database). The static checks still ran. Try the <strong>Library API</strong> sample to see the live test.
      </section>
    );
  }
  const passed = checks.filter((c) => c.passed).length;
  return (
    <section className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">Live HTTP test</h2>
          <p className="text-xs text-slate-500">The app ran in a sandbox: the same attack before and after the fix, then a real user.</p>
        </div>
        <span
          className={cx(
            'gate-pop inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-xs font-semibold',
            passed === checks.length ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-rose-100 text-rose-700 border-rose-200',
          )}
        >
          {passed === checks.length ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldX className="w-3.5 h-3.5" />}
          {passed} of {checks.length} proven{tested > checks.length ? ` · ${tested - checks.length} not HTTP-testable` : ''}
        </span>
      </div>

      <ul className="space-y-3">
        {checks.map((c, i) => (
          <li key={c.findingId} className="gate-fade-up rounded-xl border border-slate-200 bg-white px-4 py-3" style={{ animationDelay: `${i * 140}ms` }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[13px] text-slate-800">{c.route || c.findingId}</span>
              <span className="font-mono text-[11px] text-slate-400">{c.findingId}</span>
            </div>
            {c.passed ? (
              <div className="mt-2.5 grid gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <Bug className="w-4 h-4 text-rose-500 flex-shrink-0" />
                  <span className="min-w-0">Attack: {c.attackText}</span>
                  <span className="flex items-center gap-2 ml-auto">
                    <StatusChip code={c.attackBefore} good={false} label="before: got in" delay={i * 140 + 150} />
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <StatusChip code={c.attackAfter} good label="after: blocked" delay={i * 140 + 450} />
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <UserCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="min-w-0">Real user: {c.normalText}</span>
                  <span className="ml-auto">
                    <StatusChip code={c.normal} good={ok(c.normal)} label={ok(c.normal) ? 'still works' : 'broken'} delay={i * 140 + 700} />
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-rose-700">{c.failure}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
