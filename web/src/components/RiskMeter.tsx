import React from 'react';
import { Score } from '../types';
import { ShieldAlert, ShieldCheck, ArrowDown } from 'lucide-react';
import { Badge, Card, SEVERITY, cx } from './ui';

interface RiskMeterProps {
  score: Score;
  previousScore?: Score;
  label?: string;
  /** Stack gauge above the counts (for narrow, side-by-side use). */
  compact?: boolean;
}

const LEVELS = [
  { max: 20, label: 'Low risk', tone: 'success' as const, stroke: '#059669' },
  { max: 50, label: 'Moderate risk', tone: 'warning' as const, stroke: '#d97706' },
  { max: 75, label: 'High risk', tone: 'orange' as const, stroke: '#ea580c' },
  { max: 100, label: 'Critical risk', tone: 'danger' as const, stroke: '#e11d48' },
];

const ARC = 'M 12 84 A 72 72 0 0 1 156 84';
const ARC_LEN = Math.PI * 72;

export const RiskMeter: React.FC<RiskMeterProps> = ({ score, previousScore, label = 'Security risk', compact = false }) => {
  const risk = Math.max(0, Math.min(100, 100 - score.safety));
  const prevRisk = previousScore ? Math.max(0, Math.min(100, 100 - previousScore.safety)) : null;
  const level = LEVELS.find((l) => risk <= l.max) ?? LEVELS[3];
  const severities = ['critical', 'high', 'medium', 'low'] as const;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {risk <= 20 ? <ShieldCheck className="w-5 h-5 text-emerald-600" /> : <ShieldAlert className="w-5 h-5 text-rose-600" />}
          <h2 className="text-[15px] font-semibold">{label}</h2>
        </div>
        <Badge tone={level.tone}>{level.label}</Badge>
      </div>

      <div className={cx('mt-4 grid grid-cols-1 items-center', compact ? 'gap-4' : 'sm:grid-cols-[auto_1fr] gap-6')}>
        <div className="relative w-[168px] h-[96px] mx-auto">
          <svg viewBox="0 0 168 96" className="w-full h-full" role="img" aria-label={`Risk ${risk} percent`}>
            <path d={ARC} fill="none" stroke="#e2e8f0" strokeWidth={12} strokeLinecap="round" />
            <path
              d={ARC}
              fill="none"
              stroke={level.stroke}
              strokeWidth={12}
              strokeLinecap="round"
              strokeDasharray={ARC_LEN}
              strokeDashoffset={ARC_LEN - (risk / 100) * ARC_LEN}
              className="transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-x-0 bottom-0 text-center">
            <div className="text-[32px] font-semibold leading-none tabular-nums">{risk}%</div>
            {prevRisk !== null ? (
              <div className="mt-1 text-xs font-medium text-emerald-700 inline-flex items-center gap-1">
                <ArrowDown className="w-3 h-3" />
                from {prevRisk}%
              </div>
            ) : (
              <div className="mt-1 text-xs text-slate-500 tabular-nums">Safety {score.safety}/100</div>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-4 gap-2">
          {severities.map((s) => (
            <div key={s} className="rounded-lg border border-slate-200 px-3 py-2.5">
              <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className={cx('w-2 h-2 rounded-full flex-shrink-0', SEVERITY[s].dot)} />
                {SEVERITY[s].label}
              </dt>
              <dd className={cx('mt-1 text-xl font-semibold tabular-nums', score.counts[s] ? SEVERITY[s].text : 'text-slate-400')}>
                {score.counts[s]}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
};
