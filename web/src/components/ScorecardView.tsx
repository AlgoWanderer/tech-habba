import React, { useState, useEffect } from 'react';
import { apiClient } from '../api';
import { BenchmarkMetric } from '../types';
import {
  BarChart3,
  Timer,
  ShieldCheck,
  AlertOctagon,
  Percent,
  RefreshCw,
  FileCode
} from 'lucide-react';

export const ScorecardView: React.FC = () => {
  const [data, setData] = useState<BenchmarkMetric | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBenchmark = async () => {
    setLoading(true);
    try {
      const results = await apiClient.getBenchmarkResults();
      setData(results);
    } catch (err) {
      console.error('Failed loading benchmark data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBenchmark();
  }, []);

  const formatNumber = (val: number | undefined | null, suffix: string = '') => {
    if (val === undefined || val === null || isNaN(val)) {
      return <span className="text-slate-400 font-normal italic text-sm">not measured</span>;
    }
    return `${val}${suffix}`;
  };

  // Sort failure analysis so IDOR is first
  const sortedFailures = data?.failureAnalysis
    ? [...data.failureAnalysis].sort((a, b) => {
        if (a.category.toLowerCase().includes('idor')) return -1;
        if (b.category.toLowerCase().includes('idor')) return 1;
        return 0;
      })
    : [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-sky-600" />
            <h2 className="text-base font-bold text-slate-900">
              Benchmark Scorecard & Empirical Validation
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Quantitative evaluation from <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">corpus/benchmark/results.json</code>.
            Only strictly measured parameters are shown.
          </p>
        </div>

        <button
          onClick={loadBenchmark}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Reload Metrics</span>
        </button>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Baseline Vulnerabilities */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Baseline Vulns
            </span>
            <AlertOctagon className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-700">
            {formatNumber(data?.baselineVulnerabilities)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Raw vulnerabilities in AI vibe-coded apps
          </p>
        </div>

        {/* SlopStop Post-Patch Vulns */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              SlopStop Vulns
            </span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700">
            {formatNumber(data?.slopstopVulnerabilities)}
          </div>
          <p className="text-[11px] text-emerald-600 font-medium mt-1">
            {data?.baselineVulnerabilities && data?.slopstopVulnerabilities !== undefined
              ? `${Math.round(
                  ((data.baselineVulnerabilities - data.slopstopVulnerabilities) /
                    data.baselineVulnerabilities) *
                    100
                )}% deterministic reduction`
              : 'Verified post-rescan count'}
          </p>
        </div>

        {/* Throughput ms per file */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Scan Speed
            </span>
            <Timer className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {formatNumber(data?.msPerFile, ' ms / file')}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Deterministic AST parser latency</p>
        </div>

        {/* Rejection Rate */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Patch Rejection Rate
            </span>
            <Percent className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {data?.rejectionRate !== undefined && data?.rejectionRate !== null
              ? `${(data.rejectionRate * 100).toFixed(1)}%`
              : formatNumber(undefined)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Failed node --check / discarded patches
          </p>
        </div>
      </div>

      {/* Baseline vs SlopStop Comparison Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
          Comparative Security Invariant Enforcement
        </h3>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs font-medium mb-1">
              <span className="text-rose-700">Baseline Vibe-Coded Repositories (Unprotected)</span>
              <span className="font-mono text-rose-800 font-bold">
                {formatNumber(data?.baselineVulnerabilities)} vulnerabilities
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3">
              <div
                className="bg-rose-500 h-3 rounded-full"
                style={{ width: '100%' }}
              ></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-medium mb-1">
              <span className="text-emerald-700">SlopStop Verified Auto-Patched</span>
              <span className="font-mono text-emerald-800 font-bold">
                {formatNumber(data?.slopstopVulnerabilities)} remaining (IDOR / Review)
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3">
              <div
                className="bg-emerald-500 h-3 rounded-full"
                style={{
                  width:
                    data?.baselineVulnerabilities && data?.slopstopVulnerabilities !== undefined
                      ? `${Math.max(
                          6,
                          Math.min(
                            100,
                            (data.slopstopVulnerabilities / data.baselineVulnerabilities) * 100
                          )
                        )}%`
                      : '0%'
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Failure Analysis List (IDOR FIRST!) */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-slate-700" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Failure Analysis & Honest Limitations
            </h3>
          </div>
          <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
            IDOR Prioritized
          </span>
        </div>

        <p className="text-xs text-slate-500">
          SlopStop guarantees zero regressions by rejecting AST patches that cannot be verified deterministically.
          Business-logic vulnerabilities (such as authorization ownership) are strictly highlighted for human engineering review.
        </p>

        {sortedFailures.length === 0 ? (
          <div className="p-4 bg-slate-50 rounded text-center text-xs text-slate-400 italic">
            Failure analysis: not measured
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {sortedFailures.map((item, idx) => (
              <div
                key={idx}
                className={`p-3 text-xs flex items-start gap-3 ${
                  item.category.toLowerCase().includes('idor')
                    ? 'bg-purple-50/40 border-l-4 border-l-purple-500'
                    : 'bg-white'
                }`}
              >
                <div className="font-mono font-bold uppercase text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 flex-shrink-0">
                  {item.category}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-slate-800 font-medium">{item.reason}</div>
                </div>
                {item.count !== undefined && (
                  <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    {item.count} cases
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
