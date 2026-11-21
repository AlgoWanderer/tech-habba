// Ship-gate verdict: blocked / needs review / ready to ship, with the auto-fix + HTTP verify action.
import React from 'react';
import { ShieldAlert, ShieldCheck, ShieldQuestion, Wand2, Loader2 } from 'lucide-react';
import { Finding } from '../types';
import { Verdict, verdictOf, plural } from '../gate/pipeline';
import { Button, cx } from './ui';

const LOOK: Record<Verdict, { label: string; sub: string; icon: React.ReactNode; card: string; pill: string }> = {
  blocked: {
    label: 'Blocked · do not ship',
    sub: 'Critical or high findings must be fixed first.',
    icon: <ShieldAlert className="w-6 h-6" />,
    card: 'from-rose-50 to-white border-rose-200 text-rose-700',
    pill: 'bg-rose-100 text-rose-700 border-rose-200',
  },
  review: {
    label: 'Needs human review',
    sub: 'No critical or high findings left; the rest need a person to decide.',
    icon: <ShieldQuestion className="w-6 h-6" />,
    card: 'from-amber-50 to-white border-amber-200 text-amber-700',
    pill: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  ship: {
    label: 'Ready to ship',
    sub: 'Nothing left for the gate to flag.',
    icon: <ShieldCheck className="w-6 h-6" />,
    card: 'from-emerald-50 to-white border-emerald-200 text-emerald-700',
    pill: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
};

export const ShipGate: React.FC<{
  findings: Finding[];
  onFix?: () => void;
  isFixing?: boolean;
  fixLabel?: string;
}> = ({ findings, onFix, isFixing, fixLabel }) => {
  const v = verdictOf(findings);
  const look = LOOK[v];
  const auto = findings.filter((f) => f.fixable === 'auto').length;
  const ai = findings.filter((f) => f.source === 'ai').length;
  return (
    <section key={v} className={cx('gate-fade-up rounded-2xl border bg-gradient-to-br p-5 flex flex-wrap items-center gap-4', look.card)}>
      <div className="gate-pop w-12 h-12 rounded-2xl bg-white/80 border border-white flex items-center justify-center shadow-sm">{look.icon}</div>
      <div className="flex-1 min-w-[200px]">
        <div className="text-xs font-medium text-slate-500">Ship gate status</div>
        <span className={cx('inline-flex mt-1 items-center h-7 px-3 rounded-full border text-sm font-semibold', look.pill)}>{look.label}</span>
        <p className="text-xs text-slate-600 mt-1.5">
          {look.sub} {plural(findings.length, 'finding')}
          {ai > 0 && ` (${ai} from fine-tuned Qwen)`}, {auto} auto-fixable.
        </p>
      </div>
      {onFix && v !== 'ship' && (
        <Button onClick={onFix} disabled={isFixing} icon={isFixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}>
          {isFixing ? 'Fixing and testing…' : fixLabel ?? 'Auto-fix & HTTP verify'}
        </Button>
      )}
    </section>
  );
};
