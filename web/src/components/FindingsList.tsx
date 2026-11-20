import React, { useState } from 'react';
import { Finding, FindingSeverity, FindingCategory } from '../types';
import { KeyRound, ShieldOff, Syringe, Package, UserX, Wand2, ChevronDown, CheckCircle2, Loader2, Info } from 'lucide-react';
import { Badge, Button, Callout, Card, CardHeader, CodeBlock, Label, SEVERITY, SeverityBadge, cx } from './ui';

interface FindingsListProps {
  findings: Finding[];
  onFixAll?: () => void;
  isFixing?: boolean;
}

const CATEGORY: Record<FindingCategory, { label: string; icon: React.ReactNode }> = {
  secret: { label: 'Hard-coded secret', icon: <KeyRound className="w-4 h-4" /> },
  injection: { label: 'Injection', icon: <Syringe className="w-4 h-4" /> },
  auth: { label: 'Missing auth', icon: <ShieldOff className="w-4 h-4" /> },
  dependency: { label: 'Vulnerable dependency', icon: <Package className="w-4 h-4" /> },
  idor: { label: 'IDOR / ownership', icon: <UserX className="w-4 h-4" /> },
};

const REVIEW_NOTE: Partial<Record<FindingCategory, string>> = {
  idor: 'Ownership checks are business logic, so SlopStop flags this for a human instead of guessing a patch.',
  dependency: 'Upgrading a package can change behaviour. Run the suggested install command and re-test.',
  injection: 'This query uses a whole request object, an operator value, $where or concatenated SQL, which cannot be fixed safely without knowing the intent.',
  secret: 'The secret sits in a dynamic template or a file that could not be parsed. Move it to an environment variable by hand.',
};

const ORDER: FindingSeverity[] = ['critical', 'high', 'medium', 'low'];

export const FindingsList: React.FC<FindingsListProps> = ({ findings, onFixAll, isFixing = false }) => {
  const [expandedId, setExpandedId] = useState<string | null>(findings[0]?.id ?? null);
  const autoCount = findings.filter((f) => f.fixable === 'auto').length;
  const reviewCount = findings.length - autoCount;
  const groups = ORDER.map((sev) => ({ sev, items: findings.filter((f) => f.severity === sev) })).filter((g) => g.items.length);

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            Findings <Badge>{findings.length}</Badge>
          </span>
        }
        subtitle={`${autoCount} auto-fixable · ${reviewCount} need review`}
        action={
          onFixAll && autoCount > 0 ? (
            <Button onClick={onFixAll} disabled={isFixing} icon={isFixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}>
              {isFixing ? 'Verifying patches…' : `Fix ${autoCount} automatically`}
            </Button>
          ) : undefined
        }
      />

      <div className="p-5 space-y-6">
        {findings.length === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
            <p className="font-medium">No issues found</p>
            <p className="text-sm text-slate-500 mt-1">Nothing matched SlopStop's rules in these files.</p>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.sev}>
              <div className="flex items-center gap-2 mb-2">
                <span className={cx('w-2 h-2 rounded-full flex-shrink-0', SEVERITY[g.sev].dot)} />
                <span className="text-sm font-medium text-slate-700">{SEVERITY[g.sev].label}</span>
                <span className="text-sm text-slate-400 tabular-nums">{g.items.length}</span>
              </div>

              <ul className="border border-slate-200 rounded-lg divide-y divide-slate-200 overflow-hidden">
                {g.items.map((f) => {
                  const open = expandedId === f.id;
                  return (
                    <li key={f.id} className={cx(open && 'bg-slate-50/70')}>
                      <button
                        onClick={() => setExpandedId(open ? null : f.id)}
                        aria-expanded={open}
                        className="w-full text-left px-4 py-3 flex items-start gap-3 cursor-pointer hover:bg-slate-50 transition-colors"
                      >
                        <span className="mt-0.5 text-slate-500 flex-shrink-0" title={CATEGORY[f.category]?.label}>
                          {CATEGORY[f.category]?.icon}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-slate-900 leading-5">{f.message}</span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span className="font-mono text-slate-700">
                              {f.file}:{f.line}
                            </span>
                            <span>{CATEGORY[f.category]?.label ?? f.category}</span>
                            <span className="font-mono">{f.ruleId}</span>
                          </span>
                        </span>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          <SeverityBadge severity={f.severity} />
                          {f.fixable === 'auto' ? <Badge tone="success">Auto-fix</Badge> : <Badge tone="warning">Review</Badge>}
                          <ChevronDown className={cx('w-4 h-4 text-slate-400 transition-transform', open && 'rotate-180')} />
                        </span>
                      </button>

                      {open && (
                        <div className="px-4 pb-4 pl-11 space-y-3">
                          <div>
                            <Label className="mb-1.5">Current code</Label>
                            <CodeBlock tone="bad">{f.snippet}</CodeBlock>
                          </div>
                          {f.fixPreview && (
                            <div>
                              <Label className="mb-1.5">{f.fixable === 'auto' ? 'After the fix' : 'Suggested action'}</Label>
                              <CodeBlock tone={f.fixable === 'auto' ? 'good' : 'plain'}>{f.fixPreview}</CodeBlock>
                            </div>
                          )}
                          {f.fixable === 'review' && REVIEW_NOTE[f.category] && (
                            <Callout tone="warning" icon={<Info className="w-4 h-4" />}>
                              {REVIEW_NOTE[f.category]}
                            </Callout>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};
