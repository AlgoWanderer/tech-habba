// Security Gate pipeline: Static rules -> AI model -> Live HTTP test, with a ship/no-ship verdict.
// Step states come from the real scan/fix responses; the log while busy narrates what the server does.
import React, { useEffect, useState } from 'react';
import { FixResponse, FixResult, ScanMode, ScanResponse, Score } from '../types';
import { cx } from './ui';
import { ScanSearch, BrainCircuit, Radar, Check, AlertTriangle, Loader2, Minus, ShieldAlert, ShieldCheck, ShieldQuestion, Shield } from 'lucide-react';

type StepState = 'idle' | 'running' | 'done' | 'warn' | 'skipped';

const STYLE: Record<StepState, { card: string; icon: string }> = {
  idle: { card: 'bg-white border-slate-200', icon: 'bg-slate-100 text-slate-400' },
  running: { card: 'bg-sky-50/70 border-sky-200 shadow-sm shadow-sky-100', icon: 'bg-sky-100 text-sky-600 ss-ring' },
  done: { card: 'bg-emerald-50/60 border-emerald-200', icon: 'bg-emerald-100 text-emerald-600' },
  warn: { card: 'bg-amber-50/60 border-amber-200', icon: 'bg-amber-100 text-amber-600' },
  skipped: { card: 'bg-slate-50 border-dashed border-slate-200 opacity-70', icon: 'bg-slate-100 text-slate-400' },
};

const STATUS_ICON: Record<StepState, React.ReactNode> = {
  idle: null,
  running: <Loader2 className="w-4 h-4 text-sky-500 animate-spin" />,
  done: <Check className="w-4 h-4 text-emerald-600 ss-pop" />,
  warn: <AlertTriangle className="w-4 h-4 text-amber-500 ss-pop" />,
  skipped: <Minus className="w-4 h-4 text-slate-400" />,
};

/** "ollama:slopstop-qwen" -> Fine-Tuned Qwen; "gemini:a>b" -> the first Gemini model in the chain. */
export function modelLabel(aiModel: string | null | undefined): { title: string; sub: string } {
  if (!aiModel) return { title: 'AI Model', sub: 'not configured' };
  const [provider, rest = ''] = aiModel.split(':');
  if (/qwen/i.test(rest)) return { title: 'Fine-Tuned Qwen', sub: `${rest} · runs locally` };
  if (provider === 'gemini') {
    const first = rest.split('>')[0].replace(/^gemini-/, '').split('-').map((w) => (/^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ');
    return { title: 'AI Model', sub: `Gemini ${first}` };
  }
  return { title: 'AI Model', sub: rest || provider };
}

const Step: React.FC<{ n: number; icon: React.ReactNode; title: string; sub: string; state: StepState; detail: string }> = ({ n, icon, title, sub, state, detail }) => (
  <div className={cx('relative flex-1 min-w-0 rounded-xl border p-3.5 overflow-hidden transition-all duration-500', STYLE[state].card)}>
    <div className="flex items-center gap-2.5">
      <span className={cx('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors duration-500', STYLE[state].icon)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Step {n}</div>
        <div className="text-sm font-semibold text-slate-800 truncate">{title}</div>
      </div>
      <span className="ml-auto flex-shrink-0">{STATUS_ICON[state]}</span>
    </div>
    <div className="text-[11px] text-slate-400 mt-1.5 truncate">{sub}</div>
    <p key={detail} className="text-xs text-slate-600 mt-1 leading-4 min-h-[32px] ss-fade-up">{detail}</p>
    {state === 'running' && <div className="absolute inset-x-0 bottom-0 h-1 ss-shimmer" />}
  </div>
);

const Connector: React.FC<{ active: boolean; done: boolean }> = ({ active, done }) => (
  <div className="hidden sm:flex items-center w-6 flex-shrink-0" aria-hidden>
    <div className={cx('h-1 w-full rounded-full transition-colors duration-500', active ? 'ss-flow' : done ? 'bg-emerald-200' : 'bg-slate-200')} />
  </div>
);

function verdict(score: Score | null) {
  if (!score) return { label: 'Waiting for code', tone: 'bg-slate-100 text-slate-600 border-slate-200', icon: <Shield className="w-4 h-4" /> };
  const { critical, high, medium, low } = score.counts;
  if (critical + high > 0) return { label: 'Blocked · do not ship', tone: 'bg-rose-50 text-rose-700 border-rose-200', icon: <ShieldAlert className="w-4 h-4" /> };
  if (medium + low > 0) return { label: 'Needs review', tone: 'bg-amber-50 text-amber-800 border-amber-200', icon: <ShieldQuestion className="w-4 h-4" /> };
  return { label: 'Ready to ship', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <ShieldCheck className="w-4 h-4" /> };
}

function useTicker(active: boolean, count: number, ms: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (!active) return;
    const t = setInterval(() => setI((x) => Math.min(x + 1, count - 1)), ms);
    return () => clearInterval(t);
  }, [active, count, ms]);
  return i;
}

export const GatePipeline: React.FC<{
  mode: ScanMode;
  aiModel: string | null;
  isScanning: boolean;
  isFixing: boolean;
  scan: ScanResponse | null;
  fix: FixResponse | null;
  /** Verifier results of an already-applied fix (kept after "Apply to editor"). */
  proof?: FixResult[] | null;
}> = ({ mode, aiModel, isScanning, isFixing, scan, fix, proof }) => {
  const model = modelLabel(aiModel);
  const usesAi = mode !== 'rules';
  const scanLog = [
    'Parsing the code into a syntax tree (acorn)…',
    'Rules: secrets, injection, missing auth, IDOR, dependencies…',
    ...(usesAi ? ['Masking secrets before any code leaves this machine…', `Asking ${model.sub} for flaws the rules miss…`, 'Validating every AI finding against the real file…'] : []),
  ];
  const fixLog = [
    'Applying rule fixes (secrets → env, auth middleware, input casting)…',
    ...(mode === 'hybrid' ? [`${model.sub} is writing patches for the review items…`] : []),
    'node --check on every patched file…',
    'Re-scanning the patched code: flaw gone, nothing new…',
    'Starting the app in a locked sandbox (no disk writes, no child processes)…',
    'Attack mode: calling protected routes without logging in…',
    "Attack mode: user B asks for user A's record…",
    'Attack mode: sending {"$ne": null} operator payloads…',
    'Normal mode: logging in as the real owner, checking it still works…',
  ];
  const busy = isScanning || isFixing;
  const log = isFixing ? fixLog : scanLog;
  const tick = useTicker(busy, log.length, isFixing ? 2200 : 900);

  const ruleCount = scan?.findings.filter((f) => f.source !== 'ai').length ?? 0;
  const aiCount = scan?.findings.filter((f) => f.source === 'ai').length ?? 0;
  const aiResults = fix?.results.filter((r) => r.source === 'ai') ?? [];
  const aiApplied = aiResults.filter((r) => r.status === 'applied').length;
  const aiRejected = aiResults.filter((r) => r.status === 'rejected').length;
  const verified = fix?.results ?? proof ?? null;
  const proven = verified?.filter((r) => /HTTP test passed/.test(r.reason)).length ?? 0;
  const httpBlocked = verified?.filter((r) => /HTTP (normal|attack) mode FAILED/.test(r.reason)).length ?? 0;

  // Step 1: static rules
  const s1: [StepState, string] =
    mode === 'ai' ? ['skipped', 'Off in AI-only mode (the unverified baseline)']
      : isScanning ? (usesAi && tick >= 2 ? ['done', 'Rules finished in milliseconds'] : ['running', 'Walking the syntax tree…'])
        : scan ? ['done', `${ruleCount} finding${ruleCount === 1 ? '' : 's'} from deterministic rules`]
          : ['idle', 'Secrets, injection, auth, IDOR, dependencies'];
  // Step 2: AI model
  const s2: [StepState, string] =
    !usesAi ? ['skipped', 'Off in Rules mode: switch to Hybrid to use the model']
      : isFixing && mode === 'hybrid' ? ['running', 'Writing patches for what rules leave to review…']
        : isScanning ? (tick >= 2 ? ['running', 'Looking for flaws rules miss…'] : ['idle', 'Waiting for the rules…'])
          : fix && mode === 'hybrid' ? [aiRejected ? 'warn' : 'done', `${aiApplied} AI fix${aiApplied === 1 ? '' : 'es'} passed · ${aiRejected} rejected by the verifier`]
            : scan ? ['done', `${aiCount} extra finding${aiCount === 1 ? '' : 's'} the rules missed`]
              : ['idle', 'Finds what rules miss; never trusted blind'];
  // Step 3: live HTTP test
  const s3: [StepState, string] =
    isFixing ? ['running', 'Attacking the fixed app in a sandbox…']
      : verified ? (proven + httpBlocked ? [httpBlocked ? 'warn' : 'done', `${proven} fix${proven === 1 ? '' : 'es'} proven by real attacks${httpBlocked ? ` · ${httpBlocked} unsafe fix${httpBlocked === 1 ? '' : 'es'} blocked` : ''}${!fix ? ' · applied' : ''}`] : ['skipped', 'No route here the sandbox could attack'])
        : scan ? ['idle', 'Runs when you click Fix']
          : ['idle', 'Real attacks + a real-user check'];

  const score = fix?.rescan.score ?? scan?.score ?? null;
  const v = verdict(busy ? null : score);

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">Ship gate</h2>
          <p className="text-xs text-slate-500">AI proposes, deterministic checks prove{fix ? ' · verdict after fixes' : ''}</p>
        </div>
        <span key={v.label} className={cx('inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-semibold uppercase tracking-wide ss-fade-up', busy ? 'bg-sky-50 text-sky-700 border-sky-200' : v.tone)}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : v.icon}
          {busy ? (isFixing ? 'Verifying…' : 'Scanning…') : v.label}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-0">
        <Step n={1} icon={<ScanSearch className="w-5 h-5" />} title="Static Rules" sub="acorn AST · deterministic" state={s1[0]} detail={s1[1]} />
        <Connector active={s2[0] === 'running'} done={s1[0] === 'done'} />
        <Step n={2} icon={<BrainCircuit className="w-5 h-5" />} title={model.title} sub={model.sub} state={s2[0]} detail={s2[1]} />
        <Connector active={s3[0] === 'running'} done={s2[0] === 'done' || s2[0] === 'warn'} />
        <Step n={3} icon={<Radar className="w-5 h-5" />} title="Live HTTP Test" sub="attack mode + normal mode" state={s3[0]} detail={s3[1]} />
      </div>

      {busy && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 font-mono text-[12px] leading-5" aria-live="polite">
          {log.slice(Math.max(0, tick - 3), tick + 1).map((line, i, arr) => {
            const current = i === arr.length - 1;
            return (
              <div key={line} className={cx('flex items-center gap-2 ss-fade-up', current ? 'text-slate-800' : 'text-slate-400')}>
                {current ? <Loader2 className="w-3 h-3 animate-spin text-sky-500 flex-shrink-0" /> : <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                <span className="truncate">{line}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
