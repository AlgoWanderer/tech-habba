import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import { BenchmarkMetric } from '../types';
import { RefreshCw, ShieldAlert, ShieldCheck, Timer, Ban, ListChecks, Target } from 'lucide-react';
import { Badge, Button, Card, CardHeader, cx } from './ui';

const isNum = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);

const NotMeasured = () => <span className="text-base font-normal text-slate-400">Not measured</span>;

export const ScorecardView: React.FC = () => {
  const [data, setData] = useState<BenchmarkMetric | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setData(await apiClient.getBenchmarkResults());
    } catch (err) {
      console.error('Failed loading benchmark data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const before = data?.baselineVulnerabilities;
  const after = data?.slopstopVulnerabilities;
  const reduction = isNum(before) && isNum(after) && before > 0 ? Math.round(((before - after) / before) * 1000) / 10 : null;
  const failures = [...(data?.failureAnalysis ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const reviewTotal = failures.reduce((s, f) => s + (f.count ?? 0), 0);

  const kpis = [
    {
      label: 'Critical + high before',
      icon: <ShieldAlert className="w-4 h-4 text-rose-600" />,
      value: isNum(before) ? before : null,
      hint: isNum(data?.totalApps)
        ? isNum(data?.cleanApps)
          ? `Across ${data!.totalApps} corpus apps (${data!.totalApps! - data!.cleanApps!} with planted flaws)`
          : `Across ${data!.totalApps} corpus apps`
        : 'Unpatched corpus',
    },
    {
      label: 'Critical + high after',
      icon: <ShieldCheck className="w-4 h-4 text-emerald-600" />,
      value: isNum(after) ? after : null,
      hint: reduction !== null ? `${reduction}% fewer after verified fixes` : 'After fix and re-scan',
      accent: 'text-emerald-700',
    },
    {
      label: 'Time per app',
      icon: <Timer className="w-4 h-4 text-slate-500" />,
      value: isNum(data?.msPerFile) ? `${Math.round(data!.msPerFile!)} ms` : null,
      hint: 'Scan, fix, verify and re-scan',
    },
    {
      label: 'Patches rejected',
      icon: <Ban className="w-4 h-4 text-slate-500" />,
      value: isNum(data?.rejectionRate) ? `${(data!.rejectionRate! * 100).toFixed(1)}%` : null,
      hint: 'Failed node --check or re-scan',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Benchmark</h1>
          <p className="text-sm text-slate-500 mt-1">
            Measured on the team corpus (<code className="font-mono text-[13px]">corpus/benchmark/results.json</code>). Missing values
            are shown as not measured, never estimated.
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading} icon={<RefreshCw className={cx('w-4 h-4', loading && 'animate-spin')} />}>
          Reload
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-5">
            <div className="flex items-center justify-between text-sm text-slate-500">
              {k.label}
              {k.icon}
            </div>
            <div className={cx('mt-3 text-[28px] leading-8 font-semibold tabular-nums', k.accent ?? 'text-slate-900')}>
              {k.value ?? <NotMeasured />}
            </div>
            <div className="mt-1.5 text-xs text-slate-500">{k.hint}</div>
          </Card>
        ))}
      </div>

      <DetectionCard data={data} />

      <Card>
        <CardHeader title="Before and after" subtitle="Critical and high findings across the whole corpus" />
        <div className="p-5 space-y-5">
          <Bar label="Unpatched" value={before} max={before} color="bg-rose-500" />
          <Bar label="After SlopStop" value={after} max={before} color="bg-emerald-500" />
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<ListChecks className="w-5 h-5" />}
          title="Left for human review"
          subtitle="SlopStop never guesses at business logic. These findings are reported, not patched."
          action={reviewTotal ? <Badge>{reviewTotal} findings</Badge> : undefined}
        />
        <div className="p-5">
          {failures.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Not measured</p>
          ) : (
            <ul className="border border-slate-200 rounded-lg divide-y divide-slate-200">
              {failures.map((f, i) => (
                <li key={i} className="px-4 py-3 flex items-center gap-4">
                  <span className="w-36 flex-shrink-0 font-mono text-[13px] text-slate-800 whitespace-nowrap">{f.category}</span>
                  <span className="flex-1 min-w-0 text-sm text-slate-500">{f.reason}</span>
                  {isNum(f.count) && <span className="text-sm font-medium tabular-nums text-slate-700">{f.count}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
};

const DetectionCard: React.FC<{ data: BenchmarkMetric | null }> = ({ data }) => {
  const found = data?.detectedVulnerabilities;
  const total = data?.totalVulnerabilities;
  const clean = data?.cleanApps;
  const falseAlarms = data?.falsePositivesOnCleanApps;
  const rows = data?.comparison ?? [];
  const cell = (v?: number) => (isNum(v) ? v : <span className="text-slate-400">not measured</span>);

  return (
    <Card>
      <CardHeader
        icon={<Target className="w-5 h-5" />}
        title="Detection"
        subtitle="Planted flaws found in the corpus, compared with an existing scanner on the same apps."
      />
      <div className="p-5 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6 items-start">
        <div className="space-y-4">
          <div>
            <div className="text-[28px] leading-8 font-semibold tabular-nums">
              {isNum(found) && isNum(total) ? (
                <>
                  Found {found} <span className="text-slate-400 font-normal">/ {total}</span>
                </>
              ) : (
                <NotMeasured />
              )}
            </div>
            <div className="mt-1 text-sm text-slate-500">planted flaws detected</div>
          </div>
          <div>
            <div className="text-[28px] leading-8 font-semibold tabular-nums">{isNum(falseAlarms) ? falseAlarms : <NotMeasured />}</div>
            <div className="mt-1 text-sm text-slate-500">
              false alarms on {isNum(clean) ? `${clean} clean apps` : 'the clean apps'}
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Tool comparison not measured</p>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Tool</th>
                  <th className="text-right font-medium px-4 py-2.5">Flaws found</th>
                  <th className="text-right font-medium px-4 py-2.5" title="Verified patches applied across all findings">
                    Patches applied
                  </th>
                  <th className="text-right font-medium px-4 py-2.5">Alarms on clean apps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((r, i) => (
                  <tr key={r.tool} className={cx(i === 0 && 'font-medium')}>
                    <td className="px-4 py-3 whitespace-nowrap">{r.tool}</td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      {isNum(r.detected) && isNum(r.total) ? `${r.detected} / ${r.total}` : cell(r.detected)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{cell(r.fixed)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{cell(r.findingsOnCleanApps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
};

const Bar: React.FC<{ label: string; value?: number; max?: number; color: string }> = ({ label, value, max, color }) => {
  const pct = isNum(value) && isNum(max) && max > 0 ? Math.max(1, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm mb-2">
        <span className="text-slate-700">{label}</span>
        <span className="font-medium tabular-nums">{isNum(value) ? value : '—'}</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={cx('h-full rounded-full transition-[width] duration-700', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};
