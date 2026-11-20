import React, { useState } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { FixResponse, FixResultStatus, Score } from '../types';
import { RiskMeter } from './RiskMeter';
import { FileText, KeyRound, CheckCircle2, XCircle, CircleHelp, Copy, Check, ShieldCheck, ArrowLeft, Info } from 'lucide-react';
import { Badge, Button, Callout, Card, CardHeader, CodeBlock, cx } from './ui';

interface DiffViewerProps {
  fixResponse: FixResponse;
  originalScore: Score;
  onReset: () => void;
}

const STATUS: Record<FixResultStatus, { label: string; tone: 'success' | 'danger' | 'warning'; icon: React.ReactNode }> = {
  applied: { label: 'Applied', tone: 'success', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  rejected: { label: 'Rejected', tone: 'danger', icon: <XCircle className="w-3.5 h-3.5" /> },
  review: { label: 'Review', tone: 'warning', icon: <CircleHelp className="w-3.5 h-3.5" /> },
};

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

export const DiffViewer: React.FC<DiffViewerProps> = ({ fixResponse, originalScore, onReset }) => {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [copiedEnv, setCopiedEnv] = useState(false);
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
        <Button variant="secondary" onClick={onReset} icon={<ArrowLeft className="w-4 h-4" />} className="flex-shrink-0">
          Back to findings
        </Button>
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
          {fixResponse.results.map((r) => (
            <li key={r.findingId} className="px-4 py-3 flex items-start gap-3">
              <Badge tone={STATUS[r.status].tone} icon={STATUS[r.status].icon} className="w-[88px] justify-center flex-shrink-0">
                {STATUS[r.status].label}
              </Badge>
              <div className="min-w-0">
                <div className="font-mono text-[13px] text-slate-800 break-all">{r.findingId}</div>
                {r.reason && <div className="text-sm text-slate-500 mt-0.5 leading-5">{r.reason}</div>}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <h2 className="text-[15px] font-semibold">Changes</h2>
          <span className="text-xs text-slate-500">
            {fixResponse.patched.length} {fixResponse.patched.length === 1 ? 'file' : 'files'}
          </span>
        </div>
        <div className="flex gap-1 px-4 mt-3 border-b border-slate-200 overflow-x-auto overflow-y-hidden">
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
