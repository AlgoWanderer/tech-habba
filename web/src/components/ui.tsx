// Shared UI primitives so every screen uses the same spacing, type scale and colours.
// Type scale: 12px (meta), 13px (mono/code), 14px (body), 16-18px (titles), 28-32px (KPIs).
import React from 'react';
import { FindingSeverity } from '../types';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <section className={cx('bg-white border border-slate-200 rounded-xl', className)}>{children}</section>
);

export const CardHeader: React.FC<{
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, subtitle, action, className }) => (
  <div className={cx('flex flex-wrap items-start justify-between gap-3 px-5 pt-5', className)}>
    <div className="flex items-start gap-3 min-w-0">
      {icon && <div className="mt-0.5 text-slate-500 flex-shrink-0">{icon}</div>}
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-slate-900 leading-6">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 leading-5 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {action && <div className="flex-shrink-0">{action}</div>}
  </div>
);

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: React.ReactNode }
> = ({ variant = 'primary', icon, className, children, ...rest }) => (
  <button
    {...rest}
    className={cx(
      'inline-flex items-center justify-center gap-2 h-9 px-4 rounded-lg text-sm font-medium transition-colors',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer whitespace-nowrap',
      variant === 'primary' && 'bg-sky-700 text-white hover:bg-sky-800',
      variant === 'secondary' && 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
      variant === 'ghost' && 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3',
      className,
    )}
  >
    {icon}
    {children}
  </button>
);

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'orange';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-rose-50 text-rose-800 border-rose-200',
  orange: 'bg-orange-50 text-orange-800 border-orange-200',
};

export const Badge: React.FC<{ tone?: Tone; icon?: React.ReactNode; className?: string; children: React.ReactNode }> = ({
  tone = 'neutral',
  icon,
  className,
  children,
}) => (
  <span className={cx('inline-flex items-center gap-1 h-6 px-2 rounded-md border text-xs font-medium whitespace-nowrap', TONES[tone], className)}>
    {icon}
    {children}
  </span>
);

export const SEVERITY: Record<FindingSeverity, { label: string; tone: Tone; dot: string; text: string }> = {
  critical: { label: 'Critical', tone: 'danger', dot: 'bg-rose-600', text: 'text-rose-700' },
  high: { label: 'High', tone: 'orange', dot: 'bg-orange-500', text: 'text-orange-700' },
  medium: { label: 'Medium', tone: 'warning', dot: 'bg-amber-500', text: 'text-amber-700' },
  low: { label: 'Low', tone: 'neutral', dot: 'bg-slate-400', text: 'text-slate-600' },
};

export const SeverityBadge: React.FC<{ severity: FindingSeverity }> = ({ severity }) => (
  <Badge tone={SEVERITY[severity].tone}>{SEVERITY[severity].label}</Badge>
);

/** Small grey section label used inside cards. */
export const Label: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={cx('text-xs font-medium text-slate-500', className)}>{children}</div>
);

export const CodeBlock: React.FC<{ tone?: 'plain' | 'bad' | 'good'; className?: string; children: React.ReactNode }> = ({
  tone = 'plain',
  className,
  children,
}) => (
  <pre
    className={cx(
      'px-3.5 py-3 rounded-lg font-mono text-[13px] leading-5 overflow-x-auto border',
      tone === 'plain' && 'bg-slate-50 text-slate-800 border-slate-200',
      tone === 'bad' && 'bg-rose-50/60 text-rose-900 border-rose-200',
      tone === 'good' && 'bg-emerald-50/60 text-emerald-900 border-emerald-200',
      className,
    )}
  >
    <code>{children}</code>
  </pre>
);

export const Callout: React.FC<{ tone?: Tone; icon?: React.ReactNode; className?: string; children: React.ReactNode }> = ({
  tone = 'info',
  icon,
  className,
  children,
}) => (
  <div className={cx('flex items-start gap-2.5 px-3.5 py-3 rounded-lg border text-sm leading-5', TONES[tone], className)}>
    {icon && <span className="mt-0.5 flex-shrink-0">{icon}</span>}
    <div className="min-w-0">{children}</div>
  </div>
);

export { cx };
