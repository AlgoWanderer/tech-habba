import React, { useState } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { FixResponse, FixResult, Score, Finding } from '../types';
import { RiskMeter } from './RiskMeter';
import {
  FileText,
  KeyRound,
  CheckCircle2,
  XCircle,
  CircleHelp,
  Copy,
  Check,
  ShieldCheck,
  ArrowLeft,
  Info,
  Code
} from 'lucide-react';
import { Badge, Button, Callout, Card, CardHeader, CodeBlock, cx } from './ui';

interface DiffViewerProps {
  fixResponse: FixResponse;
  originalScore: Score;
  originalFindings?: Finding[];
  onReset: () => void;
  onApplyToEditor?: () => void;
}

const CATEGORY_PLAIN_ENGLISH: Record<string, string> = {
  secret: 'Your secret key was written in the code. It now comes from a private .env file.',
  auth: 'Anyone could open this page without logging in. Now only logged-in users can.',
  injection: 'Someone could trick the database with crafted input. Input is now treated as plain text.',
  idor: "Users could open other people's records by changing the id. Now they only see their own.",
  dependency: 'A package has a known security hole. Upgrade it (we cannot do this safely for you).',
};

function getFindingCategory(findingId: string, originalFindings?: Finding[]): string {
  const match = originalFindings?.find((f) => f.id === findingId);
  if (match?.category) return match.category;

  const idLower = findingId.toLowerCase();
  if (idLower.includes('secret')) return 'secret';
  if (idLower.includes('auth')) return 'auth';
  if (idLower.includes('injection') || idLower.includes('nosql') || idLower.includes('sql') || idLower.includes('xss')) return 'injection';
  if (idLower.includes('idor') || idLower.includes('ownership')) return 'idor';
  if (idLower.includes('dep') || idLower.includes('vuln') || idLower.includes('package')) return 'dependency';
  return 'injection';
}

function getVerificationBadge(r: FixResult): {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  icon: React.ReactNode;
} {
  if (r.status === 'applied') {
    // GREEN "Proven" -> status applied and reason mentions HTTP test passing
    const isProven = /http.*(pass|attack|test|200|401|ok)/i.test(r.reason) || /proven|http test passed/i.test(r.reason);
    if (isProven) {
      return {
        label: 'Proven',
        tone: 'success',
        icon: <ShieldCheck className="w-3.5 h-3.5" />,
      };
    }
    // AMBER "Verified" -> status applied (passed node --check + re-scan)
    return {
      label: 'Verified',
      tone: 'warning',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    };
  }
  if (r.status === 'rejected') {
    // RED "Rejected"
    return {
      label: 'Rejected',
      tone: 'danger',
      icon: <XCircle className="w-3.5 h-3.5" />,
    };
  }
  return {
    label: 'Needs review',
    tone: 'neutral',
    icon: <CircleHelp className="w-3.5 h-3.5" />,
  };
}

function getPlainEnglishRejection(reason: string): string {
  const r = (reason || '').toLowerCase();
  if (r.includes('syntax') || r.includes('node --check') || r.includes('parse')) {
    return 'The patch had a syntax error that would crash the server, so SlopStop blocked it.';
  }
  if (r.includes('undo') || r.includes('drop') || r.includes('requireauth')) {
    return 'The patch removed an authentication check that was just added, so SlopStop blocked it.';
  }
  if (r.includes('deleted route') || r.includes('missing route') || r.includes('route')) {
    return 'The patch deleted an existing route, which would break the app, so SlopStop rejected it.';
  }
  if (r.includes('placeholder')) {
    return 'The patch left incomplete placeholder code, so SlopStop rejected it.';
  }
  if (r.includes('re-scan') || r.includes('critical') || r.includes('high') || r.includes('new finding')) {
    return 'The patch introduced a new security vulnerability, so SlopStop blocked it.';
  }
  if (r.includes('not provided') || r.includes('no longer in the code')) {
    return 'The target code was modified or not found, so this patch was safely skipped.';
  }
  return 'The patch did not pass verification and was safely blocked to protect your app.';
}

const DIFF_STYLES = {
  variables: {
    light: {
      diffViewerBackground: '#ffffff',
      gutterBackground: '#f8fafc',
      gutterColor: '#94a3b8',
      addedBackground: '#ecfdf5',
      addedColor: '#065f46',
      addedGutterBackground: '#d1fae5',
      removedBackground: '#fff1f2',
      removedColor: '#9f1239',
      removedGutterBackground: '#ffe4e6',
      wordAddedBackground: '#a7f3d0',
      wordRemovedBackground: '#fecdd3',
      emptyLineBackground: '#f8fafc',
      diffViewerTitleBackground: '#f8fafc',
      diffViewerTitleColor: '#475569',
      diffViewerTitleBorderColor: '#e2e8f0',
    },
  },
  line: { fontSize: '13px', lineHeight: '20px' },
  contentText: { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '13px', lineHeight: '20px' },
  gutter: { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '12px', minWidth: '36px', padding: '0 8px' },
  titleBlock: { fontFamily: 'Inter, ui-sans-serif, sans-serif', fontSize: '12px', fontWeight: 500, padding: '8px 12px' },
};

export const DiffViewer: React.FC<DiffViewerProps> = ({ fixResponse, originalScore, originalFindings, onReset, onApplyToEditor }) => {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const active = fixResponse.patched[activeFileIndex] || fixResponse.patched[0];
  const counts = fixResponse.results.reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
  // Findings the re-scan still reports as needing a human (e.g. IDOR), not just the ids sent to /api/fix.
  const stillReview = fixResponse.rescan.findings.filter((f) => f.fixable === 'review').length;
  const timing = typeof fixResponse.timingMs === 'number' ? Math.round(fixResponse.timingMs) : null;

  const handleCopyEnv = () => {
    if (!fixResponse.envFile) return;
    navigator.clipboard.writeText(fixResponse.envFile);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold">Verified patch preview</h2>
            <p className="text-sm text-slate-500 leading-5">
              Each applied patch passed <code className="font-mono text-[13px] text-slate-700 whitespace-nowrap">node --check</code> and a
              re-scan. Nothing has been written to disk.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onApplyToEditor && (
            <Button variant="primary" onClick={onApplyToEditor} icon={<Check className="w-4 h-4" />}>
              Apply to editor
            </Button>
          )}
          <Button variant="secondary" onClick={onReset} icon={<ArrowLeft className="w-4 h-4" />}>
            Back to findings
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <RiskMeter score={originalScore} label="Before" compact />
        <RiskMeter score={fixResponse.rescan.score} previousScore={originalScore} label="After re-scan" compact />
      </div>

      <Card>
        <CardHeader
          title="Patch results"
          subtitle={
            <span className="tabular-nums">
              {counts.applied ?? 0} applied · {counts.rejected ?? 0} rejected · {stillReview}{' '}
              {stillReview === 1 ? 'still needs' : 'still need'} human review
              {timing !== null && ` · fixed and verified in ${timing} ms`}
            </span>
          }
        />
        <ul className="m-5 border border-slate-200 rounded-lg divide-y divide-slate-200">
          {fixResponse.results.map((r) => {
            const isAi = r.source === 'ai';
            const isRejected = r.status === 'rejected';
            const badge = getVerificationBadge(r);
            const category = getFindingCategory(r.findingId, originalFindings);
            const plainExplanation = CATEGORY_PLAIN_ENGLISH[category] || CATEGORY_PLAIN_ENGLISH.injection;
            const plainRejection = isRejected ? getPlainEnglishRejection(r.reason) : null;

            return (
              <li key={r.findingId} className="px-4 py-3.5 flex items-start gap-3">
                <div className="flex flex-col gap-1.5 flex-shrink-0 pt-0.5">
                  <Badge tone={badge.tone} icon={badge.icon} className="w-[96px] justify-center font-medium">
                    {badge.label}
                  </Badge>
                  {isAi && (
                    <Badge tone="violet" className="w-[96px] justify-center text-[11px]">
                      AI patch
                    </Badge>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[13px] text-slate-800 break-all font-medium">{r.findingId}</div>
                  
                  {/* Plain English explanation for vibe coders */}
                  <p className="text-sm text-slate-700 mt-1 leading-5">
                    {isRejected ? (
                      <span className="text-rose-700 font-medium">{plainRejection}</span>
                    ) : (
                      <span>{plainExplanation}</span>
                    )}
                  </p>

                  {/* Technical details toggle for rejection or specifics */}
                  {r.reason && (
                    <details className="mt-2 text-xs">
                      <summary className="text-slate-500 hover:text-slate-800 cursor-pointer font-medium select-none">
                        {isRejected ? 'Technical reason for rejection' : 'Verification details'}
                      </summary>
                      <div className="mt-1 font-mono text-[12px] bg-slate-50 text-slate-700 p-2 rounded border border-slate-200 leading-4 break-all">
                        {r.reason}
                      </div>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold">Changes</h2>
            <span className="text-xs text-slate-500">
              ({fixResponse.patched.length} {fixResponse.patched.length === 1 ? 'file' : 'files'})
            </span>
          </div>
          <Button
            variant="secondary"
            onClick={() => setShowCode(!showCode)}
            icon={<Code className="w-4 h-4" />}
          >
            {showCode ? 'Hide code diff' : 'Show code diff'}
          </Button>
        </div>

        {showCode ? (
          <div>
            <div className="flex gap-1 px-4 mt-2 border-b border-slate-200 overflow-x-auto overflow-y-hidden">
              {fixResponse.patched.map((file, idx) => (
                <button
                  key={file.path}
                  onClick={() => setActiveFileIndex(idx)}
                  className={cx(
                    'flex items-center gap-2 h-9 px-3 -mb-px border-b-2 font-mono text-[13px] whitespace-nowrap cursor-pointer transition-colors',
                    activeFileIndex === idx ? 'border-sky-700 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
                  )}
                >
                  <FileText className="w-4 h-4" />
                  {file.path}
                  {!file.original && <Badge tone="info">new</Badge>}
                </button>
              ))}
            </div>
            {active ? (
              <div className="overflow-x-auto">
                <ReactDiffViewer
                  oldValue={active.original}
                  newValue={active.patched}
                  splitView={false}
                  compareMethod={DiffMethod.WORDS}
                  styles={DIFF_STYLES}
                />
              </div>
            ) : (
              <p className="p-6 text-center text-sm text-slate-500">No files were changed.</p>
            )}
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-slate-500 bg-slate-50/50">
            <p className="font-medium text-slate-700">Code diff is hidden to keep things simple for vibe-coding.</p>
            <p className="text-xs text-slate-500 mt-1">
              Click <strong>Show code diff</strong> above if you'd like to inspect line-by-line syntax transformations.
            </p>
          </div>
        )}
      </Card>

      {fixResponse.envFile && (
        <Card>
          <CardHeader
            icon={<KeyRound className="w-5 h-5" />}
            title="Environment variables"
            subtitle="Add these to your local .env file. Keep it out of git."
            action={
              <Button
                variant="secondary"
                onClick={handleCopyEnv}
                icon={copiedEnv ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              >
                {copiedEnv ? 'Copied' : 'Copy'}
              </Button>
            }
          />
          <div className="p-5 space-y-3">
            <Callout tone="info" icon={<Info className="w-4 h-4" />}>
              Secret values are not shown here. Fill each one in locally.
            </Callout>
            <CodeBlock>{fixResponse.envFile}</CodeBlock>
          </div>
        </Card>
      )}
    </div>
  );
};
