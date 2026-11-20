import React, { useState } from 'react';
import { FileInput, ScanResponse, FixResponse } from './types';
import { apiClient } from './api';
import { SAMPLE_APPS } from './mocks/sampleData';
import { RiskMeter } from './components/RiskMeter';
import { FindingsList } from './components/FindingsList';
import { DiffViewer } from './components/DiffViewer';
import { ExploitSimulator } from './components/ExploitSimulator';
import { PromptHardenerView } from './components/PromptHardenerView';
import { ScorecardView } from './components/ScorecardView';
import {
  Shield,
  FileCode,
  Upload,
  Play,
  RotateCcw,
  Sparkles,
  Server,
  Layers,
  BarChart2,
  Lock,
  Plus,
  Trash2
} from 'lucide-react';

type TabType = 'gate' | 'hardener' | 'scorecard';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('gate');

  // Multi-file state for code input
  const [files, setFiles] = useState<FileInput[]>([
    { path: SAMPLE_APPS[0].filename, content: SAMPLE_APPS[0].content }
  ]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  // Scan & Fix state
  const [isScanning, setIsScanning] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [scanResponse, setScanResponse] = useState<ScanResponse | null>(null);
  const [fixResponse, setFixResponse] = useState<FixResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentFile = files[activeFileIndex] || files[0];

  const handleContentChange = (newContent: string) => {
    setFiles(prev =>
      prev.map((f, i) => (i === activeFileIndex ? { ...f, content: newContent } : f))
    );
  };

  const handleLoadSample = (sample: typeof SAMPLE_APPS[0]) => {
    setFiles([{ path: sample.filename, content: sample.content }]);
    setActiveFileIndex(0);
    setScanResponse(null);
    setFixResponse(null);
    setError(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    Array.from(uploadedFiles).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setFiles(prev => [...prev, { path: file.name, content: content || '' }]);
      };
      reader.readAsText(file);
    });
  };

  const handleAddEmptyFile = () => {
    const filename = `file_${files.length + 1}.js`;
    setFiles(prev => [...prev, { path: filename, content: '// Paste JavaScript code here\n' }]);
    setActiveFileIndex(files.length);
  };

  const handleRemoveFile = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (files.length <= 1) return;
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    setActiveFileIndex(Math.max(0, index - 1));
  };

  const handleScan = async () => {
    setIsScanning(true);
    setError(null);
    setFixResponse(null);
    try {
      const res = await apiClient.scan(files);
      setScanResponse(res);
    } catch (err: any) {
      setError(err?.message || 'Scan request failed');
    } finally {
      setIsScanning(false);
    }
  };

  const handleFixAll = async () => {
    if (!scanResponse) return;
    setIsFixing(true);
    setError(null);
    try {
      const autoFixableIds = scanResponse.findings
        .filter(f => f.fixable === 'auto')
        .map(f => f.id);
      const res = await apiClient.fix(files, autoFixableIds);
      setFixResponse(res);
    } catch (err: any) {
      setError(err?.message || 'Fix request failed');
    } finally {
      setIsFixing(false);
    }
  };

  const lineCount = (currentFile?.content || '').split('\n').length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Navigation Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo & Tagline */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-slate-900 flex items-center justify-center text-sky-400 shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-slate-900">
                  SlopStop
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                  v1.0 Gate
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Verified Pre-Ship Security Gate for Vibe-Coded Node Apps
              </p>
            </div>
          </div>

          {/* Center Tabs */}
          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('gate')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                activeTab === 'gate'
                  ? 'bg-white text-sky-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Security Gate</span>
            </button>
            <button
              onClick={() => setActiveTab('hardener')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                activeTab === 'hardener'
                  ? 'bg-white text-sky-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Prompt Hardener</span>
            </button>
            <button
              onClick={() => setActiveTab('scorecard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                activeTab === 'scorecard'
                  ? 'bg-white text-sky-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Scorecard</span>
            </button>
          </nav>

          {/* Right Status */}
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-slate-50 text-slate-700 border-slate-300">
              <Server className="w-3 h-3 text-sky-600" />
              <span className="font-mono text-[11px]">
                {apiClient.isMockMode() ? 'MOCK MODE' : 'LIVE :3001'}
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  apiClient.isMockMode() ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              ></span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {activeTab === 'hardener' && <PromptHardenerView />}
        {activeTab === 'scorecard' && <ScorecardView />}

        {activeTab === 'gate' && (
          <div className="space-y-6">
            {/* Split Screen Layout: Left = Code Input, Right = Results */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* LEFT COLUMN: Code Input */}
              <div className="lg:col-span-5 flex flex-col bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden min-h-[640px]">
                {/* Header bar with sample app selector */}
                <div className="p-3 border-b border-slate-200 bg-slate-50/70 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <FileCode className="w-4 h-4 text-slate-500" />
                      <span>Target Node Files</span>
                    </span>

                    <label className="flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 px-2 py-1 rounded cursor-pointer transition-colors">
                      <Upload className="w-3 h-3 text-slate-500" />
                      <span>Upload .js</span>
                      <input
                        type="file"
                        accept=".js,.mjs,.cjs,.ts"
                        multiple
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>

                  {/* Built-in sample apps buttons */}
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">
                      Samples:
                    </span>
                    {SAMPLE_APPS.map((sample, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleLoadSample(sample)}
                        className="text-[11px] px-2 py-0.5 rounded bg-slate-100 hover:bg-sky-50 hover:text-sky-800 hover:border-sky-300 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                      >
                        {sample.name.split(' (')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* File tabs */}
                <div className="border-b border-slate-200 bg-slate-100/60 px-3 pt-2 flex items-center gap-1 overflow-x-auto">
                  {files.map((file, idx) => (
                    <div
                      key={idx}
                      onClick={() => setActiveFileIndex(idx)}
                      className={`px-3 py-1.5 rounded-t text-xs font-mono flex items-center gap-2 cursor-pointer border-t border-x transition-colors ${
                        activeFileIndex === idx
                          ? 'bg-white border-slate-200 text-sky-700 font-bold border-b-transparent'
                          : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>{file.path}</span>
                      {files.length > 1 && (
                        <button
                          onClick={(e) => handleRemoveFile(idx, e)}
                          className="hover:text-rose-600 text-slate-400 p-0.5"
                          title="Remove file"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={handleAddEmptyFile}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                    title="Add file"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Code editor textarea */}
                <div className="flex-1 relative bg-slate-950 font-mono text-xs flex">
                  {/* Line numbers column */}
                  <div className="w-10 bg-slate-900/90 text-slate-600 text-right pr-2 pt-3 select-none text-[11px] leading-[1.375rem]">
                    {Array.from({ length: Math.max(15, lineCount) }).map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>

                  <textarea
                    value={currentFile?.content || ''}
                    onChange={(e) => handleContentChange(e.target.value)}
                    className="flex-1 p-3 bg-transparent text-slate-100 resize-none focus:outline-none text-xs leading-[1.375rem] font-mono selection:bg-sky-800"
                    placeholder="// Paste your Node.js / Express code here..."
                    spellCheck={false}
                  />
                </div>

                {/* Bottom action bar */}
                <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400">
                    {lineCount} lines • {files.length} {files.length === 1 ? 'file' : 'files'}
                  </span>

                  <button
                    onClick={handleScan}
                    disabled={isScanning || !currentFile?.content.trim()}
                    className="flex items-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-md shadow-sm transition-colors cursor-pointer"
                  >
                    {isScanning ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                        <span>Running AST Scan...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Scan Code</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* RIGHT COLUMN: Results (Scan Findings OR Verified Fix Diff) */}
              <div className="lg:col-span-7 flex flex-col space-y-6">
                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-md">
                    {error}
                  </div>
                )}

                {/* Fix View (Side-by-side Diff & Rescan Score) */}
                {fixResponse && scanResponse ? (
                  <DiffViewer
                    fixResponse={fixResponse}
                    originalScore={scanResponse.score}
                    onReset={() => setFixResponse(null)}
                  />
                ) : scanResponse ? (
                  /* Scan View (Safety Gauge & Findings List) */
                  <div className="space-y-6">
                    <RiskMeter score={scanResponse.score} />

                    <FindingsList
                      findings={scanResponse.findings}
                      onFixAll={handleFixAll}
                      isFixing={isFixing}
                    />

                    {/* Exploit Simulator Component */}
                    <ExploitSimulator />
                  </div>
                ) : (
                  /* Empty state before first scan */
                  <div className="bg-white border border-slate-200 rounded-lg p-10 text-center shadow-sm flex flex-col items-center justify-center min-h-[480px]">
                    <div className="w-12 h-12 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center mb-3">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900">
                      Ready for Deterministic Security Scan
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md mt-1 mb-6 leading-relaxed">
                      Select a sample app or paste your Express/MongoDB code on the left, then click{' '}
                      <strong>Scan Code</strong> to detect hard-coded secrets, NoSQL sinks, and missing route authentication.
                    </p>

                    <button
                      onClick={handleScan}
                      disabled={isScanning}
                      className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md shadow-sm transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-sky-400" />
                      <span>Run Initial Scan</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between text-xs text-slate-400">
          <div>
            SlopStop Pre-Ship Security Gate • Team of Four Hackathon Architecture
          </div>
          <div>
            Role D: Dashboard & Pitch (web/, core/promptHardener.js, docs/)
          </div>
        </div>
      </footer>
    </div>
  );
}
