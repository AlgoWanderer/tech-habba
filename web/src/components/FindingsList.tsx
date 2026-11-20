import React, { useState } from 'react';
import { Finding, FindingSeverity, FindingCategory } from '../types';
import {
  Key,
  ShieldOff,
  Bug,
  Package,
  EyeOff,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Code2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface FindingsListProps {
  findings: Finding[];
  onFixAll?: () => void;
  isFixing?: boolean;
}

const getCategoryIcon = (category: FindingCategory) => {
  switch (category) {
    case 'secret':
      return (
        <span title="Hardcoded Secret">
          <Key className="w-4 h-4 text-rose-600" />
        </span>
      );
    case 'injection':
      return (
        <span title="Injection Sink">
          <Bug className="w-4 h-4 text-orange-600" />
        </span>
      );
    case 'auth':
      return (
        <span title="Missing Auth">
          <ShieldOff className="w-4 h-4 text-indigo-600" />
        </span>
      );
    case 'dependency':
      return (
        <span title="Vulnerable Dependency">
          <Package className="w-4 h-4 text-amber-600" />
        </span>
      );
    case 'idor':
      return (
        <span title="IDOR / BOLA Logic">
          <EyeOff className="w-4 h-4 text-purple-600" />
        </span>
      );
    default:
      return (
        <span title="Vulnerability">
          <AlertCircle className="w-4 h-4 text-slate-500" />
        </span>
      );
  }
};

const getSeverityBadge = (severity: FindingSeverity) => {
  switch (severity) {
    case 'critical':
      return (
        <span className="px-2 py-0.5 text-xs font-bold uppercase rounded bg-rose-100 text-rose-800 border border-rose-200">
          Critical
        </span>
      );
    case 'high':
      return (
        <span className="px-2 py-0.5 text-xs font-bold uppercase rounded bg-orange-100 text-orange-800 border border-orange-200">
          High
        </span>
      );
    case 'medium':
      return (
        <span className="px-2 py-0.5 text-xs font-bold uppercase rounded bg-amber-100 text-amber-800 border border-amber-200">
          Medium
        </span>
      );
    case 'low':
      return (
        <span className="px-2 py-0.5 text-xs font-bold uppercase rounded bg-slate-100 text-slate-800 border border-slate-200">
          Low
        </span>
      );
  }
};

export const FindingsList: React.FC<FindingsListProps> = ({ findings, onFixAll, isFixing = false }) => {
  const [expandedId, setExpandedId] = useState<string | null>(findings[0]?.id || null);

  const autoFixableCount = findings.filter(f => f.fixable === 'auto').length;
  const reviewCount = findings.filter(f => f.fixable === 'review').length;

  const severityOrder: FindingSeverity[] = ['critical', 'high', 'medium', 'low'];
  const groupedFindings = severityOrder.map(sev => ({
    severity: sev,
    items: findings.filter(f => f.severity === sev)
  })).filter(g => g.items.length > 0);

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col h-full">
      {/* Header bar */}
      <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>Security Findings</span>
            <span className="text-xs bg-slate-200 text-slate-800 px-2 py-0.5 rounded-full font-semibold">
              {findings.length}
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {autoFixableCount} auto-fixable with deterministic AST rewrites • {reviewCount} manual review
          </p>
        </div>

        {onFixAll && autoFixableCount > 0 && (
          <button
            onClick={onFixAll}
            disabled={isFixing}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-md shadow-sm transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isFixing ? 'Verifying Patches...' : `Fix All Auto-Fixable (${autoFixableCount})`}</span>
          </button>
        )}
      </div>

      {/* Findings items grouped by severity */}
      <div className="p-4 overflow-y-auto flex-1 space-y-5">
        {findings.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">No vulnerabilities detected</p>
            <p className="text-xs text-slate-400 mt-1">Code adheres to all pre-ship security invariants.</p>
          </div>
        ) : (
          groupedFindings.map(group => (
            <div key={group.severity} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {group.severity} ({group.items.length})
                </span>
                <div className="h-px bg-slate-200 flex-1"></div>
              </div>

              <div className="space-y-2">
                {group.items.map(item => {
                  const isExpanded = expandedId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`border rounded-lg transition-all ${
                        isExpanded ? 'border-sky-300 bg-sky-50/20 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="w-full text-left p-3 flex items-start gap-3 cursor-pointer"
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          {getCategoryIcon(item.category)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {getSeverityBadge(item.severity)}
                            <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              {item.file}:{item.line}
                            </span>
                            <span className="text-xs font-mono text-slate-400">
                              {item.ruleId}
                            </span>

                            {item.fixable === 'auto' ? (
                              <span className="ml-auto text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-emerald-600" />
                                Auto-Fixable
                              </span>
                            ) : (
                              <span className="ml-auto text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                Review Required
                              </span>
                            )}
                          </div>

                          <p className="text-xs font-medium text-slate-800 leading-relaxed">
                            {item.message}
                          </p>
                        </div>

                        <div className="text-slate-400 mt-0.5">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                      </button>

                      {/* Expanded code snippet and preview */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2 text-xs">
                          <div>
                            <div className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                              <Code2 className="w-3.5 h-3.5 text-slate-400" />
                              <span>Offending Code ({item.file}:{item.line}):</span>
                            </div>
                            <pre className="p-2.5 bg-slate-900 text-rose-300 rounded font-mono text-xs overflow-x-auto">
                              <code>{item.snippet}</code>
                            </pre>
                          </div>

                          {item.fixPreview && (
                            <div>
                              <div className="text-[11px] font-semibold text-emerald-700 mb-1 flex items-center gap-1">
                                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Deterministic Fix Preview:</span>
                              </div>
                              <pre className="p-2.5 bg-slate-900 text-emerald-300 rounded font-mono text-xs overflow-x-auto">
                                <code>{item.fixPreview}</code>
                              </pre>
                            </div>
                          )}

                          {item.fixable === 'review' && (
                            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs">
                              <strong>Note:</strong> IDOR/BOLA requires application business authorization logic. SlopStop reports this for human security review.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
