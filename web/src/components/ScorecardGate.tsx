// Scorecard, organised like the security gate: one tile per stage, then the model comparison chart.
// Every number comes from /api/benchmark, /api/experiment or /api/model-eval; missing -> "not measured".
import React, { useState } from 'react';
import { ScanSearch, BrainCircuit, Globe, Laptop, Zap, CheckCircle2, Info } from 'lucide-react';
import { BenchmarkMetric, ExperimentSummary, ModelEvalResponse, ModelMetricRow } from '../types';
import { Card, CardHeader, cx } from './ui';

const isNum = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);
const pct = (v?: number) => (isNum(v) ? `${Math.round(v * 100)}%` : '—');
const secs = (ms?: number) => (!isNum(ms) ? '—' : ms < 1 ? '<1 ms' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

// Fixed categorical slot per entity (validated palette: blue, orange, aqua, yellow). Colour follows the model.
const ENTITY = [
  { match: /slopstop/i, name: 'SlopStop Qwen 1.5B', tag: 'ours, fine-tuned', color: '#2a78d6', ours: true },
  { match: /^rules$/i, name: 'Static rules', tag: 'deterministic', color: '#eb6834', ours: false },
  { match: /gemini/i, name: 'Gemini 3.1 Flash-Lite', tag: 'cloud', color: '#1baf7a', ours: false },
  { match: /qwen/i, name: 'Qwen 1.5B base', tag: 'not fine-tuned', color: '#eda100', ours: false },
];
const entityOf = (m: ModelMetricRow) => ENTITY.find((e) => e.match.test(m.model)) ?? { match: /./, name: m.model, tag: '', color: '#94a3b8', ours: false };

type Row = { key: string; name: string; tag: string; color: string; ours: boolean; m: ModelMetricRow };

function rowsOf(ev: ModelEvalResponse | null): Row[] {
  const rows = (ev?.models ?? []).map((m) => ({ key: m.model, ...entityOf(m), m }));
  // Fixed order (not by rank): ours first, then rules, Gemini, base.
  return rows.sort((a, b) => ENTITY.findIndex((e) => e.match.test(a.key)) - ENTITY.findIndex((e) => e.match.test(b.key)));
}

const validRate = (m: ModelMetricRow) =>
  isNum(m.snippets) && m.snippets > 0 && isNum(m.invalidOrError) ? (m.snippets - m.invalidOrError) / m.snippets : undefined;
const catAcc = (m: ModelMetricRow) => (typeof m.categoryAccuracy === 'number' ? m.categoryAccuracy : undefined);

// ---------- Stage tiles ----------

const StageTile: React.FC<{ n: number; title: string; icon: React.ReactNode; tint: string; border: string; value: string; label: string; lines: string[] }> = ({
  n, title, icon, tint, border, value, label, lines,
}) => (
  <Card className={cx('p-5 bg-gradient-to-b from-white to-white border-t-4 gate-fade-up', border)}>
    <div className="flex items-center gap-2.5">
      <div className={cx('w-9 h-9 rounded-xl flex items-center justify-center', tint)}>{icon}</div>
      <div>
        <div className="text-[11px] font-medium text-slate-500">Stage {n}</div>
        <div className="text-[15px] font-semibold text-slate-900 leading-5">{title}</div>
      </div>
    </div>
    <div className="mt-4 text-[28px] leading-8 font-semibold tabular-nums text-slate-900">{value}</div>
    <div className="text-xs text-slate-500">{label}</div>
    <ul className="mt-3 space-y-1">
      {lines.map((l) => (
        <li key={l} className="flex items-start gap-1.5 text-xs text-slate-600">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
          {l}
        </li>
      ))}
    </ul>
  </Card>
);

export const GateStages: React.FC<{ bench: BenchmarkMetric | null; ev: ModelEvalResponse | null; exp: ExperimentSummary | null }> = ({ bench, ev, exp }) => {
  const rows = rowsOf(ev);
  const rules = rows.find((r) => /^rules$/i.test(r.key))?.m;
  const ours = rows.find((r) => r.ours)?.m;
  const hybridSets = Object.values(exp?.bySet ?? {}).map((s) => s.hybrid).filter(Boolean);
  const apps = hybridSets.reduce((n, h) => n + (h?.totalApps ?? 0), 0);
  const broken = hybridSets.reduce((n, h) => n + (h?.brokenAppsCount ?? 0), 0);
  const corpus = exp?.bySet?.corpus?.hybrid;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StageTile
        n={1}
        title="Static rules"
        icon={<ScanSearch className="w-5 h-5" />}
        tint="bg-sky-100 text-sky-700"
        border="border-t-sky-300"
        value={isNum(bench?.detectedVulnerabilities) && isNum(bench?.totalVulnerabilities) ? `${bench!.detectedVulnerabilities}/${bench!.totalVulnerabilities}` : '—'}
        label="planted flaws found in the corpus"
        lines={[
          `${pct(rules?.accuracy)} accuracy on 122 unseen snippets`,
          `${isNum(bench?.falsePositivesOnCleanApps) ? bench!.falsePositivesOnCleanApps : '—'} false alarms on clean apps`,
          'Instant and deterministic',
        ]}
      />
      <StageTile
        n={2}
        title="Fine-tuned Qwen"
        icon={<BrainCircuit className="w-5 h-5" />}
        tint="bg-violet-100 text-violet-700"
        border="border-t-violet-300"
        value={pct(ours?.accuracy)}
        label="accuracy on apps it never saw"
        lines={[
          `${isNum(ours?.invalidOrError) ? ours!.invalidOrError : '—'} invalid answers`,
          `${secs(ours?.meanMs)} per snippet on a laptop GPU`,
          'Runs offline; code never leaves the machine',
        ]}
      />
      <StageTile
        n={3}
        title="Live HTTP test + verifier"
        icon={<Globe className="w-5 h-5" />}
        tint="bg-emerald-100 text-emerald-700"
        border="border-t-emerald-300"
        value={apps ? `${broken}/${apps}` : '—'}
        label="apps broken by hybrid fixes (51-app experiment)"
        lines={[
          isNum(corpus?.criticalHighBefore) && isNum(corpus?.criticalHighAfter)
            ? `Corpus critical/high ${corpus!.criticalHighBefore} → ${corpus!.criticalHighAfter}`
            : 'Corpus critical/high: not measured',
          'Every AI patch: syntax, re-scan, names, re-check',
          'Attack must fail and a real user must still work',
        ]}
      />
    </div>
  );
};

// ---------- Model comparison chart (small multiples, one shared 0-100% scale per panel) ----------

type Metric = { id: string; title: string; hint: string; value: (m: ModelMetricRow) => number | undefined; fmt: (v?: number) => string; lowerBetter?: boolean };

const METRICS: Metric[] = [
  { id: 'acc', title: 'Accuracy', hint: 'vulnerable or safe, right answer', value: (m) => m.accuracy, fmt: pct },
  { id: 'cat', title: 'Category correct', hint: 'right kind of flaw', value: catAcc, fmt: pct },
  { id: 'valid', title: 'Usable answers', hint: 'valid JSON the gate can act on', value: validRate, fmt: pct },
];

const Tooltip: React.FC<{ row: Row; at: { x: number; y: number } }> = ({ row, at }) => (
  <div
    className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 text-xs shadow-lg"
    style={{ left: at.x + 12, top: at.y + 12 }}
  >
    <div className="flex items-center gap-1.5 font-semibold text-slate-900">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: row.color }} />
      {row.name}
    </div>
    <div className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-slate-600 tabular-nums">
      <span>Accuracy</span><span className="text-right text-slate-900">{pct(row.m.accuracy)}</span>
      <span>Category</span><span className="text-right text-slate-900">{pct(catAcc(row.m))}</span>
      <span>Invalid</span><span className="text-right text-slate-900">{isNum(row.m.invalidOrError) ? `${row.m.invalidOrError} of ${row.m.snippets}` : '—'}</span>
      <span>Time</span><span className="text-right text-slate-900">{secs(row.m.meanMs)}</span>
    </div>
  </div>
);

const Panel: React.FC<{ metric: Metric; rows: Row[]; onHover: (r: Row | null, e?: React.MouseEvent) => void; max?: number }> = ({ metric, rows, onHover, max = 1 }) => (
  <div>
    <div className="flex items-baseline justify-between mb-2">
      <h3 className="text-sm font-semibold text-slate-900">{metric.title}</h3>
      <span className="text-[11px] text-slate-500">{metric.lowerBetter ? 'lower is better' : 'higher is better'} · {metric.hint}</span>
    </div>
    <div className="space-y-2">
      {rows.map((r, i) => {
        const v = metric.value(r.m);
        const w = isNum(v) && max > 0 ? Math.max(0.01, Math.min(1, v / max)) : 0;
        return (
          <div
            key={r.key}
            className="grid grid-cols-[148px_1fr_56px] items-center gap-3 rounded-md py-0.5 -mx-1 px-1 hover:bg-slate-50 cursor-default"
            onMouseMove={(e) => onHover(r, e)}
            onMouseLeave={() => onHover(null)}
          >
            <span className={cx('text-xs truncate', r.ours ? 'font-semibold text-slate-900' : 'text-slate-600')}>{r.name}</span>
            <span className="relative h-3.5 rounded-r-[4px] bg-slate-100/80">
              {isNum(v) && (
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px] gate-grow-x"
                  style={{ width: `${w * 100}%`, background: r.color, animationDelay: `${i * 90}ms` }}
                />
              )}
            </span>
            <span className={cx('text-xs text-right tabular-nums', r.ours ? 'font-semibold text-slate-900' : 'text-slate-600')}>{metric.fmt(v)}</span>
          </div>
        );
      })}
    </div>
  </div>
);

export const ModelChart: React.FC<{ ev: ModelEvalResponse | null }> = ({ ev }) => {
  const rows = rowsOf(ev);
  const [hover, setHover] = useState<{ row: Row; at: { x: number; y: number } } | null>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const onHover = (row: Row | null, e?: React.MouseEvent) => {
    if (!row || !e || !boxRef.current) return setHover(null);
    const b = boxRef.current.getBoundingClientRect();
    setHover({ row, at: { x: e.clientX - b.left, y: e.clientY - b.top } });
  };

  const ours = rows.find((r) => r.ours)?.m;
  const base = rows.find((r) => /qwen-base|qwen2\.5/i.test(r.key) && !r.ours)?.m;
  const gemini = rows.find((r) => /gemini/i.test(r.key))?.m;
  const rules = rows.find((r) => /^rules$/i.test(r.key))?.m;

  if (!rows.length || !ours) {
    return (
      <Card>
        <CardHeader title="How our model compares" subtitle="Model evaluation not measured yet (run server/eval/models.js)." />
        <div className="p-5" />
      </Card>
    );
  }

  const wins = [
    isNum(ours.accuracy) && isNum(base?.accuracy) && {
      icon: <BrainCircuit className="w-4 h-4" />,
      big: `+${Math.round((ours.accuracy - base!.accuracy!) * 100)} pts`,
      text: `accuracy vs the same model before fine-tuning (${pct(base!.accuracy)} → ${pct(ours.accuracy)})`,
    },
    isNum(ours.invalidOrError) && isNum(base?.invalidOrError) && {
      icon: <CheckCircle2 className="w-4 h-4" />,
      big: `${base!.invalidOrError} → ${ours.invalidOrError}`,
      text: 'unusable answers: fine-tuning taught it to always answer in the gate’s format',
    },
    isNum(ours.meanMs) && isNum(gemini?.meanMs) && gemini!.meanMs! > 0 && ours.meanMs > 0 && {
      icon: <Zap className="w-4 h-4" />,
      big: `${(gemini!.meanMs! / ours.meanMs).toFixed(1)}× faster`,
      text: `than Gemini per snippet (${secs(ours.meanMs)} vs ${secs(gemini!.meanMs)})`,
    },
    {
      icon: <Laptop className="w-4 h-4" />,
      big: 'Offline',
      text: 'runs on a laptop GPU; source code and secrets never leave the machine, no API cost',
    },
  ].filter(Boolean) as { icon: React.ReactNode; big: string; text: string }[];

  const maxMs = Math.max(...rows.map((r) => r.m.meanMs ?? 0), 1);
  const speed: Metric = { id: 'ms', title: 'Time per snippet', hint: 'mean, same 122 snippets', value: (m) => m.meanMs, fmt: secs, lowerBetter: true };

  return (
    <Card>
      <CardHeader
        icon={<BrainCircuit className="w-5 h-5" />}
        title="Why our fine-tuned model"
        subtitle={`Same ${rows[0]?.m.snippets ?? 122} test snippets from 31 apps none of the models were trained on (server/eval/model-eval-qwen.json).`}
      />
      <div className="p-5 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {wins.map((w, i) => (
            <div key={w.big} className="gate-fade-up rounded-xl border border-sky-100 bg-gradient-to-b from-sky-50/70 to-white p-4" style={{ animationDelay: `${i * 90}ms` }}>
              <div className="flex items-center gap-2 text-sky-700">{w.icon}<span className="text-lg font-semibold tabular-nums text-slate-900">{w.big}</span></div>
              <p className="text-xs text-slate-600 mt-1 leading-4">{w.text}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legend">
          {rows.map((r) => (
            <span key={r.key} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: r.color }} />
              <span className={cx(r.ours && 'font-semibold text-slate-900')}>{r.name}</span>
              <span className="text-slate-400">({r.tag})</span>
            </span>
          ))}
        </div>

        <div ref={boxRef} className="relative grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-6">
          {METRICS.map((m) => (
            <Panel key={m.id} metric={m} rows={rows} onHover={onHover} />
          ))}
          <Panel metric={speed} rows={rows} onHover={onHover} max={maxMs} />
          {hover && <Tooltip row={hover.row} at={hover.at} />}
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-900 leading-5">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>
            <strong>Where it is not better:</strong> Gemini is more accurate ({pct(gemini?.accuracy)}) and the static rules are the most accurate
            ({pct(rules?.accuracy)}). That is why SlopStop runs the model as <strong>stage 2, behind the rules</strong>, and
            proves every fix with a live HTTP test, instead of trusting any model on its own.
          </p>
        </div>
      </div>
    </Card>
  );
};
