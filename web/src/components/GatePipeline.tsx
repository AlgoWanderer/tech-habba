// Three-stage security gate: 1. Static rules -> 2. QwenSkuld -> 3. Live HTTP test.
// Each card animates while its real API call runs and settles on the measured result.
import React, { useEffect, useRef } from 'react';
import { ScanSearch, BrainCircuit, Globe, Check, Minus, X, Loader2 } from 'lucide-react';
import { LogLine, StageId, StageState, Stages } from '../gate/pipeline';
import { cx } from './ui';

const META: Record<StageId, { n: number; title: string; sub: string; icon: React.ReactNode; tint: string; soft: string; ring: string; flow: string; text: string }> = {
  rules: {
    n: 1,
    title: 'Static rules',
    sub: 'Deterministic AST scan',
    icon: <ScanSearch className="w-5 h-5" />,
    tint: 'bg-sky-100 text-sky-700',
    soft: 'from-sky-50 to-white border-sky-200',
    ring: 'rgba(14,165,233,0.35)',
    flow: '#7dd3fc',
    text: 'text-sky-700',
  },
  qwen: {
    n: 2,
    title: 'QwenSkuld',
    sub: 'Fine-tuned, runs locally',
    icon: <BrainCircuit className="w-5 h-5" />,
    tint: 'bg-violet-100 text-violet-700',
    soft: 'from-violet-50 to-white border-violet-200',
    ring: 'rgba(139,92,246,0.35)',
    flow: '#c4b5fd',
    text: 'text-violet-700',
  },
  http: {
    n: 3,
    title: 'Live HTTP test',
    sub: 'Real attack + real user',
    icon: <Globe className="w-5 h-5" />,
    tint: 'bg-emerald-100 text-emerald-700',
    soft: 'from-emerald-50 to-white border-emerald-200',
    ring: 'rgba(16,185,129,0.35)',
    flow: '#6ee7b7',
    text: 'text-emerald-700',
  },
};

const ORDER: StageId[] = ['rules', 'qwen', 'http'];

const StatusIcon: React.FC<{ s: StageState['status'] }> = ({ s }) => {
  if (s === 'running') return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
  if (s === 'done') return <Check className="w-3.5 h-3.5" />;
  if (s === 'failed') return <X className="w-3.5 h-3.5" />;
  if (s === 'skipped') return <Minus className="w-3.5 h-3.5" />;
  return null;
};

const STATUS_LABEL: Record<StageState['status'], string> = {
  idle: 'Waiting',
  running: 'Running',
  done: 'Done',
  skipped: 'Skipped',
  failed: 'Failed',
};

const StageCard: React.FC<{ id: StageId; st: StageState }> = ({ id, st }) => {
  const m = META[id];
  const active = st.status === 'running';
  const settled = st.status === 'done' || st.status === 'failed';
  return (
    <div
      className={cx(
        'relative flex-1 min-w-0 rounded-2xl border bg-gradient-to-b p-4 transition-all duration-500',
        st.status === 'idle' ? 'from-white to-white border-slate-200 opacity-80' : m.soft,
        st.status === 'skipped' && 'opacity-60',
        active && 'shadow-[0_6px_24px_-12px_rgba(99,102,241,0.45)] -translate-y-0.5',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cx('relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden', m.tint, active && 'gate-pulse gate-shimmer')}
          style={{ ['--ring' as string]: m.ring }}
        >
          {m.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-500 whitespace-nowrap">
            <span className="tabular-nums">Stage {m.n}</span>
            <span className={cx('inline-flex items-center gap-1', settled || active ? m.text : 'text-slate-400')}>
              <StatusIcon s={st.status} />
              {STATUS_LABEL[st.status]}
            </span>
          </div>
          <div className="text-[15px] font-semibold text-slate-900 leading-5 mt-0.5 truncate">{m.title}</div>
          <div className="text-xs text-slate-500 truncate">{m.sub}</div>
        </div>
      </div>
      <div className="mt-3 min-h-[40px]">
        {st.metric ? (
          <div key={st.metric} className="gate-fade-up">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cx('text-lg font-semibold leading-6 tabular-nums', settled ? 'text-slate-900' : 'text-slate-500')}>{st.metric}</span>
              {st.ms !== undefined && <span className="text-[11px] text-slate-400 tabular-nums whitespace-nowrap">{fmtMs(st.ms)}</span>}
            </div>
            {st.detail && <div className="text-xs text-slate-500 leading-4 mt-0.5 line-clamp-2">{st.detail}</div>}
          </div>
        ) : active ? (
          <div className="space-y-1.5 pt-1" aria-hidden>
            <div className="relative h-2.5 w-3/4 rounded-full bg-slate-100 overflow-hidden gate-shimmer" />
            <div className="relative h-2.5 w-1/2 rounded-full bg-slate-100 overflow-hidden gate-shimmer" />
          </div>
        ) : (
          <div className="text-xs text-slate-400 pt-1">{st.detail ?? (id === 'http' ? 'Runs when you auto-fix' : 'Not run yet')}</div>
        )}
      </div>
    </div>
  );
};

const Connector: React.FC<{ from: StageState; to: StageState; color: string }> = ({ from, to, color }) => {
  const flowing = to.status === 'running';
  const filled = from.status === 'done' && (to.status === 'done' || to.status === 'failed');
  return (
    <div className="hidden md:flex items-center w-8 flex-shrink-0" aria-hidden>
      <div className="relative h-1 w-full rounded-full bg-slate-200 overflow-hidden">
        {flowing && <div className="absolute inset-0 gate-flow" style={{ ['--flow' as string]: color }} />}
        {filled && <div className="absolute inset-0 rounded-full gate-grow-x" style={{ background: color }} />}
      </div>
    </div>
  );
};

const LOG_TONE: Record<NonNullable<LogLine['tone']>, string> = {
  info: 'text-slate-700',
  good: 'text-emerald-700',
  bad: 'text-rose-700',
  muted: 'text-slate-400',
};

export const GatePipeline: React.FC<{ stages: Stages; log: LogLine[] }> = ({ stages, log }) => {
  const feed = useRef<HTMLOListElement>(null);
  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' });
  }, [log.length]);
  return (
  <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-[15px] font-semibold text-slate-900">Security gate pipeline</h2>
      <span className="text-xs text-slate-500">Every step below is a real request, shown as it happens</span>
    </div>
    <div className="flex flex-col md:flex-row md:items-stretch gap-3 md:gap-0">
      {ORDER.map((id, i) => (
        <React.Fragment key={id}>
          {i > 0 && <Connector from={stages[ORDER[i - 1]]} to={stages[id]} color={META[id].flow} />}
          <StageCard id={id} st={stages[id]} />
        </React.Fragment>
      ))}
    </div>

    {log.length > 0 && (
      <ol ref={feed} className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 space-y-1.5 max-h-48 overflow-y-auto font-mono text-[12.5px] leading-5" aria-live="polite">
        {log.map((l) => (
          <li key={l.id} className="gate-fade-up flex gap-2">
            <span className={cx('flex-shrink-0 w-1.5 h-1.5 rounded-full mt-[7px]', l.stage === 'rules' ? 'bg-sky-400' : l.stage === 'qwen' ? 'bg-violet-400' : 'bg-emerald-400')} />
            <span className={LOG_TONE[l.tone ?? 'info']}>{l.text}</span>
          </li>
        ))}
      </ol>
    )}
  </section>
  );
};

export function fmtMs(ms: number) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
