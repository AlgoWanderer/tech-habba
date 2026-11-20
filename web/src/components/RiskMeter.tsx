import React from 'react';
import { Score } from '../types';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

interface RiskMeterProps {
  score: Score;
  previousScore?: Score;
  label?: string;
}

export const RiskMeter: React.FC<RiskMeterProps> = ({ score, previousScore, label = "Security Risk" }) => {
  const currentRisk = Math.max(0, Math.min(100, 100 - score.safety));
  const prevRisk = previousScore ? Math.max(0, Math.min(100, 100 - previousScore.safety)) : null;

  // Semicircular SVG gauge calculations
  // Angle from -180 deg (left) to 0 deg (right)
  const radius = 70;
  const strokeWidth = 14;
  const circumference = Math.PI * radius; // Half-circle perimeter
  const strokeDashoffset = circumference - (currentRisk / 100) * circumference;

  const getRiskColor = (risk: number) => {
    if (risk <= 20) return '#10b981'; // Green
    if (risk <= 50) return '#eab308'; // Yellow
    if (risk <= 75) return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  const getRiskLevel = (risk: number) => {
    if (risk <= 20) return { label: 'LOW RISK', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
    if (risk <= 50) return { label: 'MODERATE RISK', color: 'text-yellow-800 bg-yellow-50 border-yellow-200' };
    if (risk <= 75) return { label: 'HIGH RISK', color: 'text-orange-700 bg-orange-50 border-orange-200' };
    return { label: 'CRITICAL RISK', color: 'text-rose-700 bg-rose-50 border-rose-200' };
  };

  const level = getRiskLevel(currentRisk);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {currentRisk <= 20 ? (
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-rose-600" />
          )}
          <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">{label}</h3>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${level.color}`}>
          {level.label}
        </span>
      </div>

      <div className="flex flex-col items-center justify-center my-2">
        <div className="relative w-48 h-28 flex items-center justify-center">
          <svg className="w-48 h-28 overflow-visible" viewBox="0 0 160 90">
            {/* Background track */}
            <path
              d="M 10 80 A 70 70 0 0 1 150 80"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
            {/* Animated risk arc */}
            <path
              d="M 10 80 A 70 70 0 0 1 150 80"
              fill="none"
              stroke={getRiskColor(currentRisk)}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>

          {/* Centered Risk % */}
          <div className="absolute bottom-1 text-center">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {currentRisk}%
            </div>
            <div className="text-xs font-medium text-slate-500">
              {prevRisk !== null ? (
                <span className="text-emerald-600 font-semibold flex items-center gap-1 justify-center">
                  <span>↓ from {prevRisk}%</span>
                </span>
              ) : (
                `Safety Score: ${score.safety}/100`
              )}
            </div>
          </div>
        </div>

        {/* Color band legend */}
        <div className="w-full grid grid-cols-4 gap-1 text-[10px] text-center font-medium mt-3 px-2">
          <div className="py-0.5 rounded bg-emerald-100 text-emerald-800">0-20% Low</div>
          <div className="py-0.5 rounded bg-yellow-100 text-yellow-800">21-50% Med</div>
          <div className="py-0.5 rounded bg-orange-100 text-orange-800">51-75% High</div>
          <div className="py-0.5 rounded bg-rose-100 text-rose-800">76-100% Crit</div>
        </div>
      </div>

      {/* Severity counts pill grid */}
      <div className="grid grid-cols-4 gap-2 pt-4 border-t border-slate-100 mt-3 text-center">
        <div className="bg-rose-50 border border-rose-200 rounded p-1.5">
          <div className="text-xs text-rose-700 font-medium">Critical</div>
          <div className="text-lg font-bold text-rose-900">{score.counts.critical}</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded p-1.5">
          <div className="text-xs text-orange-700 font-medium">High</div>
          <div className="text-lg font-bold text-orange-900">{score.counts.high}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded p-1.5">
          <div className="text-xs text-amber-700 font-medium">Medium</div>
          <div className="text-lg font-bold text-amber-900">{score.counts.medium}</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
          <div className="text-xs text-slate-600 font-medium">Low</div>
          <div className="text-lg font-bold text-slate-800">{score.counts.low}</div>
        </div>
      </div>
    </div>
  );
};
