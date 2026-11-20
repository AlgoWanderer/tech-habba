import React, { useState } from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { FixResponse, Score } from '../types';
import { RiskMeter } from './RiskMeter';
import {
  FileText,
  KeyRound,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';

interface DiffViewerProps {
  fixResponse: FixResponse;
  originalScore: Score;
  onReset: () => void;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  fixResponse,
  originalScore,
  onReset
}) => {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [copiedEnv, setCopiedEnv] = useState(false);

  const activePatchedFile = fixResponse.patched[activeFileIndex] || fixResponse.patched[0];

  const handleCopyEnv = () => {
    if (fixResponse.envFile) {
      navigator.clipboard.writeText(fixResponse.envFile);
      setCopiedEnv(true);
      setTimeout(() => setCopiedEnv(false), 2000);
    }
  };

  const getStatusBadge = (status: 'applied' | 'rejected' | 'review') => {
    switch (status) {
      case 'applied':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Applied
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Rejected
          </span>
        );
      case 'review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
            Review
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Verification & Safe Staging Notice */}
      <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-sky-600 text-white rounded-md">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-sky-950">
              Verified Auto-Patch Preview (In-Memory Staged)
            </h4>
            <p className="text-xs text-sky-800">
              All fixes were verified with <code className="font-mono bg-sky-100 px-1 py-0.5 rounded">node --check</code> and AST re-scan.
              <strong> Patches are never auto-applied to disk.</strong> You confirm before export.
            </p>
          </div>
        </div>

        <button
          onClick={onReset}
          className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors cursor-pointer"
        >
          Back to Scanner
        </button>
      </div>

      {/* Before / After Risk Score Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            <span>Before Patching</span>
            <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">Pre-Fix</span>
          </div>
          <RiskMeter score={originalScore} label="Pre-Fix Risk" />
        </div>

        <div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            <span>After Rescan Verification</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">Verified</span>
          </div>
          <RiskMeter
            score={fixResponse.rescan.score}
            previousScore={originalScore}
            label="Post-Fix Rescan Risk"
          />
        </div>
      </div>

      {/* Per-Finding Verification Status Chips */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
          Patch Verification Results ({fixResponse.results.length} checks executed)
        </h4>

        <div className="space-y-2">
          {fixResponse.results.map((res, idx) => (
            <div
              key={idx}
              className="p-3 rounded-md border border-slate-100 bg-slate-50 flex items-start gap-3 text-xs"
            >
              <div className="mt-0.5">{getStatusBadge(res.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-mono font-medium text-slate-800">{res.findingId}</div>
                <div className="text-slate-600 mt-0.5">{res.reason}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* File Tabs & Side-by-Side Code Diff */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {/* File Tab Bar */}
        <div className="border-b border-slate-200 bg-slate-100/70 px-4 pt-2 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-x-auto">
            {fixResponse.patched.map((file, idx) => (
              <button
                key={file.path}
                onClick={() => setActiveFileIndex(idx)}
                className={`px-3 py-2 text-xs font-mono font-medium rounded-t-md border-t border-x flex items-center gap-2 transition-colors cursor-pointer ${
                  activeFileIndex === idx
                    ? 'bg-white border-slate-200 text-sky-700 font-bold border-b-transparent'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{file.path}</span>
              </button>
            ))}
          </div>

          <div className="text-[11px] font-mono text-slate-500 pb-2">
            Side-by-Side Diff (Original vs Verified Patch)
          </div>
        </div>

        {/* Diff Component */}
        {activePatchedFile ? (
          <div className="p-0 overflow-x-auto text-xs font-mono">
            <ReactDiffViewer
              oldValue={activePatchedFile.original}
              newValue={activePatchedFile.patched}
              splitView={true}
              leftTitle="Original (Vulnerable)"
              rightTitle="Patched (Verified AST Transformation)"
              styles={{
                variables: {
                  light: {
                    diffViewerBackground: '#ffffff',
                    addedBackground: '#f0fdf4',
                    addedColor: '#166534',
                    removedBackground: '#fef2f2',
                    removedColor: '#991b1b',
                    wordAddedBackground: '#bbf7d0',
                    wordRemovedBackground: '#fecaca'
                  }
                },
                line: {
                  fontSize: '12px',
                  lineHeight: '18px',
                  fontFamily: 'monospace'
                }
              }}
            />
          </div>
        ) : (
          <div className="p-6 text-center text-slate-500 text-xs">No patched files returned.</div>
        )}
      </div>

      {/* Generated .env Section */}
      {fixResponse.envFile && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-600" />
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Generated .env Template
              </h4>
            </div>

            <button
              onClick={handleCopyEnv}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 transition-colors cursor-pointer"
            >
              {copiedEnv ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-medium">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy .env</span>
                </>
              )}
            </button>
          </div>

          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded mb-3 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Security Protocol Notice:</strong> Secret values are <strong>NOT included</strong> in the template. Fill them locally in your private environment file.
            </div>
          </div>

          <pre className="p-3 bg-slate-900 text-sky-300 font-mono text-xs rounded overflow-x-auto">
            <code>{fixResponse.envFile}</code>
          </pre>
        </div>
      )}
    </div>
  );
};
