import React, { useMemo, useRef, useState, useEffect } from 'react';
import { FileInput, ScanResponse, FixResponse, Finding, FindingSeverity, ScanMode, FixMode } from './types';
import { apiClient } from './api';
import { SAMPLE_APPS } from './mocks/sampleData';
import { RiskMeter } from './components/RiskMeter';
import { GatePipeline, fmtMs } from './components/GatePipeline';
import { ShipGate } from './components/ShipGate';
import { HttpProbe } from './components/HttpProbe';
import { IDLE_STAGES, LogLine, StageId, StageState, Stages, modelLabel, parseHttpChecks, plural, verdictOf } from './gate/pipeline';
import { FindingsList } from './components/FindingsList';
import { DiffViewer } from './components/DiffViewer';
import { ExploitSimulator } from './components/ExploitSimulator';
import { ScorecardView } from './components/ScorecardView';
import { Button, Callout, cx } from './components/ui';
import { Shield, Upload, Play, Loader2, ScanSearch, Layers, BarChart2, Plus, X, AlertCircle, CheckCircle2 } from 'lucide-react';

type TabType = 'gate' | 'scorecard';

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'gate', label: 'Security Gate', icon: <Layers className="w-4 h-4" /> },
  { id: 'scorecard', label: 'Scorecard', icon: <BarChart2 className="w-4 h-4" /> },
];

const EDITOR_LINE = 20; // px, shared by gutter and textarea so numbers stay aligned
const EDITOR_PAD = 12; // px, top padding of gutter and textarea (py-3)
const SEV_RANK: Record<FindingSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const SEV_MARK: Record<FindingSeverity, { dot: string; band: string; num: string }> = {
  critical: { dot: 'bg-rose-500', band: 'bg-rose-100/70', num: 'text-rose-600' },
  high: { dot: 'bg-orange-400', band: 'bg-orange-100/70', num: 'text-orange-600' },
  medium: { dot: 'bg-amber-400', band: 'bg-amber-100/60', num: 'text-amber-600' },
  low: { dot: 'bg-slate-400', band: 'bg-slate-100', num: 'text-slate-500' },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('gate');
  const [files, setFiles] = useState<FileInput[]>([{ path: SAMPLE_APPS[0].filename, content: SAMPLE_APPS[0].content }]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [activeSample, setActiveSample] = useState(0);

  const [isScanning, setIsScanning] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [scanResponse, setScanResponse] = useState<ScanResponse | null>(null);
  const [fixResponse, setFixResponse] = useState<FixResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannedFiles, setScannedFiles] = useState<Record<string, string> | null>(null);
  const [scanMs, setScanMs] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ path: string; line: number } | null>(null);
  const [editorScroll, setEditorScroll] = useState(0);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);

  // Phase 2: Mode switch (Rules | AI only | Hybrid)
  const [mode, setMode] = useState<ScanMode>('rules');
  const [aiAvailable, setAiAvailable] = useState<boolean>(true);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const model = modelLabel(aiModel);
  const [stages, setStages] = useState<Stages>(IDLE_STAGES);
  const [log, setLog] = useState<LogLine[]>([]);

  const gutterRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const currentFile = files[activeFileIndex] || files[0];
  const lineCount = (currentFile?.content || '').split('\n').length;
  const mock = apiClient.isMockMode();

  useEffect(() => {
    apiClient.getHealth().then((h) => {
      const avail = Boolean(h.ai);
      setAiAvailable(avail);
      setAiModel((h as { aiModel?: string }).aiModel ?? null);
      if (avail) setMode('hybrid');
      else if (mode === 'ai' || mode === 'hybrid') setMode('rules');
    });
  }, []);

  // Worst severity per line for the open file, only while it still matches what was scanned.
  const markers = useMemo(() => {
    const m = new Map<number, FindingSeverity>();
    if (!scanResponse || !currentFile || scannedFiles?.[currentFile.path] !== currentFile.content) return m;
    for (const f of scanResponse.findings) {
      if (f.file !== currentFile.path) continue;
      const prev = m.get(f.line);
      if (!prev || SEV_RANK[f.severity] > SEV_RANK[prev]) m.set(f.line, f.severity);
    }
    return m;
  }, [scanResponse, scannedFiles, currentFile]);
  const focusLine = focus && currentFile && focus.path === currentFile.path ? focus.line : null;

  const jumpTo = (f: Finding) => {
    const idx = files.findIndex((x) => x.path === f.file);
    if (idx === -1) return;
    setActiveFileIndex(idx);
    setFocus({ path: f.file, line: f.line });
    requestAnimationFrame(() => {
      const ta = editorRef.current;
      if (!ta) return;
      const top = Math.max(0, (f.line - 1) * EDITOR_LINE - ta.clientHeight / 3);
      ta.scrollTop = top;
      if (gutterRef.current) gutterRef.current.scrollTop = top;
      setEditorScroll(top);
    });
  };

  const handleContentChange = (content: string) =>
    setFiles((prev) => prev.map((f, i) => (i === activeFileIndex ? { ...f, content } : f)));

  const handleLoadSample = (idx: number) => {
    const sample = SAMPLE_APPS[idx];
    setFiles([{ path: sample.filename, content: sample.content }]);
    setActiveSample(idx);
    setActiveFileIndex(0);
    setScanResponse(null);
    setFixResponse(null);
    setScannedFiles(null);
    setFocus(null);
    setError(null);
    setStages(IDLE_STAGES);
    setLog([]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files;
    if (!uploaded?.length) return;
    Array.from(uploaded).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = (event.target?.result as string) || '';
        setFiles((prev) => [...prev, { path: file.name, content }]);
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

  const handleAddEmptyFile = () => {
    setFiles((prev) => [...prev, { path: `file_${prev.length + 1}.js`, content: '// Paste JavaScript code here\n' }]);
    setActiveFileIndex(files.length);
  };

  const handleRemoveFile = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (files.length <= 1) return;
    setFiles(files.filter((_, i) => i !== index));
    setActiveFileIndex(Math.max(0, index - 1));
  };

  const logId = useRef(0);
  const pushLog = (stage: StageId, text: string, tone?: LogLine['tone']) =>
    setLog((prev) => [...prev, { id: ++logId.current, stage, text, tone }]);
  const setStage = (id: StageId, st: StageState) => setStages((prev) => ({ ...prev, [id]: st }));

  const sevSummary = (fs: Finding[]) => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 } as Record<FindingSeverity, number>;
    for (const f of fs) c[f.severity] += 1;
    return (['critical', 'high', 'medium', 'low'] as FindingSeverity[]).filter((s) => c[s]).map((s) => `${c[s]} ${s}`).join(', ') || 'none';
  };

  /** Runs the gate as a real pipeline: stage 1 rules scan, stage 2 the AI model (hybrid), stage 3 waits for the fix. */
  const handleScan = async () => {
    setIsScanning(true);
    setError(null);
    setFixResponse(null);
    setFocus(null);
    setStages({ ...IDLE_STAGES, http: { status: 'idle', detail: 'Runs when you auto-fix' } });
    setLog([]);
    const snapshot = Object.fromEntries(files.map((f) => [f.path, f.content]));
    const lines = files.reduce((n, f) => n + f.content.split('\n').length, 0);
    const useRules = mode !== 'ai';
    const useModel = mode !== 'rules' && aiAvailable;
    try {
      const tStart = performance.now();
      let final: ScanResponse | null = null;

      if (useRules) {
        setStage('rules', { status: 'running' });
        pushLog('rules', `Parsing ${plural(files.length, 'file')} (${lines} lines) into an AST with acorn…`, 'muted');
        const t0 = performance.now();
        const r = await apiClient.scan(files, 'rules');
        const ms = performance.now() - t0;
        const rules = [...new Set(r.findings.map((f) => f.ruleId))];
        setStage('rules', { status: 'done', ms, metric: plural(r.findings.length, 'finding'), detail: rules.length ? rules.join(', ') : 'No rule matched' });
        pushLog('rules', `Rules matched ${plural(r.findings.length, 'finding')} (${sevSummary(r.findings)}) in ${fmtMs(ms)}.`, r.findings.length ? 'bad' : 'good');
        final = r;
      } else {
        setStage('rules', { status: 'skipped', detail: 'AI only mode: rules not used' });
      }

      if (useModel) {
        setStage('qwen', { status: 'running' });
        pushLog('qwen', `Masking secrets, then sending the code to ${model.title}${model.local ? ' on this machine' : ' (hosted API)'}…`, 'muted');
        const t0 = performance.now();
        const r = await apiClient.scan(files, mode);
        const ms = performance.now() - t0;
        const ai = r.findings.filter((f) => f.source === 'ai');
        setStage('qwen', {
          status: 'done',
          ms,
          metric: ai.length ? `+${plural(ai.length, 'finding')}` : 'Nothing new',
          detail: ai.length
            ? ai.map((f) => `${f.category}${f.confidence !== undefined ? ` (${Math.round(f.confidence * 100)}%)` : ''} at line ${f.line}`).join(', ')
            : 'Agreed with the rules: no extra flaws found',
        });
        if (ai.length) for (const f of ai) pushLog('qwen', `${model.title} flagged ${f.file}:${f.line}: ${f.message}${f.confidence !== undefined ? ` (confidence ${Math.round(f.confidence * 100)}%)` : ''}`, 'bad');
        else pushLog('qwen', `${model.title} reviewed the code in ${fmtMs(ms)} and found nothing beyond the rules.`, 'good');
        final = r;
      } else {
        setStage('qwen', { status: 'skipped', detail: mode === 'rules' ? 'Rules mode: switch to Hybrid to add the model' : 'AI not configured on the server' });
      }

      if (final) {
        setScanMs(Math.round(performance.now() - tStart));
        setScanResponse(final);
        setScannedFiles(snapshot);
        const v = verdictOf(final.findings);
        pushLog('http', v === 'blocked' ? 'Gate: BLOCKED. Auto-fix, then prove each fix with a live HTTP attack.' : v === 'review' ? 'Gate: needs human review.' : 'Gate: ready to ship.', v === 'ship' ? 'good' : 'info');
      }
    } catch (err: any) {
      setError(err?.message || 'Scan request failed');
      setStages((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next) as StageId[]) if (next[k].status === 'running') next[k] = { status: 'failed', detail: err?.message };
        return next;
      });
    } finally {
      setIsScanning(false);
    }
  };

  /** Stage 3: fix, re-scan, and let the server prove each fix with a live HTTP attack + a real user. */
  const handleFixAll = async () => {
    if (!scanResponse) return;
    setIsFixing(true);
    setError(null);
    setEditorNotice(null);
    setStage('http', { status: 'running' });
    try {
      const fixMode: FixMode = mode === 'ai' ? 'rules' : (mode as FixMode);
      const aiFindings = scanResponse.findings.filter((f) => f.source === 'ai');
      // In hybrid mode send ALL finding ids so the AI patcher attempts to fix review findings
      const ids = fixMode === 'hybrid'
        ? scanResponse.findings.map((f) => f.id)
        : scanResponse.findings.filter((f) => f.fixable === 'auto').map((f) => f.id);
      pushLog('http', `Patching ${plural(ids.length, 'finding')}, re-scanning, and starting the app in a locked-down sandbox…`, 'muted');
      const t0 = performance.now();
      const res = await apiClient.fix(files, ids, fixMode, aiFindings);
      const ms = performance.now() - t0;
      const checks = parseHttpChecks(res);
      const applied = res.results.filter((r) => r.status === 'applied').length;
      const rejected = res.results.filter((r) => r.status === 'rejected').length;
      pushLog('http', `${plural(applied, 'patch', 'patches')} applied, ${rejected} rejected by the verifier.`, rejected ? 'info' : 'good');
      for (const c of checks) {
        pushLog(
          'http',
          c.passed
            ? `${c.route}: attack ${c.attackBefore} → ${c.attackAfter} (blocked), real user ${c.normal} (still works).`
            : `${c.route || c.findingId}: ${c.failure}`,
          c.passed ? 'good' : 'bad',
        );
      }
      const passed = checks.filter((c) => c.passed).length;
      setStage(
        'http',
        checks.length
          ? { status: passed === checks.length ? 'done' : 'failed', ms, metric: `${passed} of ${checks.length} proven`, detail: 'Attack blocked, real user still works' }
          : { status: 'skipped', ms, detail: 'No fix here could be exercised over HTTP' },
      );
      setFixResponse(res);
    } catch (err: any) {
      setError(err?.message || 'Fix request failed');
      setStage('http', { status: 'failed', detail: err?.message });
    } finally {
      setIsFixing(false);
    }
  };

  const handleApplyToEditor = async () => {
    if (!fixResponse) return;
    
    // 1. Replace content of existing tabs with patched
    const updatedFiles = files.map((f) => {
      const p = fixResponse.patched.find((x) => x.path === f.path);
      return p ? { ...f, content: p.patched } : f;
    });

    // 2. Add new files from fixResponse.patched as new tabs (e.g. middleware/requireAuth.js), but NEVER .env.example
    const existingPaths = new Set(files.map((f) => f.path));
    const newFiles: FileInput[] = fixResponse.patched
      .filter((p) => !existingPaths.has(p.path) && p.path !== '.env.example' && !p.path.endsWith('.env.example'))
      .map((p) => ({ path: p.path, content: p.patched }));

    const nextFiles = [...updatedFiles, ...newFiles];
    setFiles(nextFiles);
    setFixResponse(null);
    setEditorNotice('Patched code applied to the editor (not saved to disk).');

    // 3. Automatically re-run the scan on the updated files (same mode)
    setIsScanning(true);
    setError(null);
    try {
      const snapshot = Object.fromEntries(nextFiles.map((f) => [f.path, f.content]));
      const t0 = performance.now();
      const res = await apiClient.scan(nextFiles, mode);
      setScanMs(Math.round(performance.now() - t0));
      setScanResponse(res);
      setScannedFiles(snapshot);
    } catch (err: any) {
      setError(err?.message || 'Re-scan request failed');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-100 to-violet-100 border border-white flex items-center justify-center text-sky-700 flex-shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div className="min-w-0 hidden sm:block">
              <div className="text-[15px] font-semibold leading-5">SlopStop</div>
              <div className="text-xs text-slate-500 leading-4 truncate">Pre-ship security gate for AI-generated Node apps</div>
            </div>
          </div>

          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg" aria-label="Main">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                aria-current={activeTab === t.id ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-2 h-8 px-3 rounded-md text-sm font-medium transition-colors cursor-pointer',
                  activeTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {t.icon}
                <span className="hidden md:inline">{t.label}</span>
              </button>
            ))}
          </nav>

          <div className="flex justify-end">
            <span
              className={cx(
                'inline-flex items-center gap-2 h-7 px-2.5 rounded-full border text-xs font-medium',
                mock ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200',
              )}
              title={mock ? 'Using built-in sample data' : 'Connected to the local API on port 3001'}
            >
              <span className={cx('w-2 h-2 rounded-full', mock ? 'bg-amber-500' : 'bg-emerald-500')} />
              {mock ? 'Mock data' : 'Live API'}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'scorecard' && <ScorecardView />}

        {activeTab === 'gate' && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 items-start">
            {/* Code input */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col lg:sticky lg:top-[88px] lg:h-[calc(100vh-160px)] min-h-[520px]">
              <div className="px-5 pt-4 pb-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[15px] font-semibold">Code to scan</h2>
                  <label className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
                    <Upload className="w-4 h-4" />
                    Upload
                    <input type="file" accept=".js,.mjs,.cjs,.ts,.json" multiple className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">Samples</span>
                  {SAMPLE_APPS.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleLoadSample(idx)}
                      className={cx(
                        'h-7 px-2.5 rounded-md border text-xs font-medium transition-colors cursor-pointer',
                        activeSample === idx && files.length === 1
                          ? 'bg-sky-50 border-sky-300 text-sky-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900',
                      )}
                    >
                      {s.name.split(' (')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* File tabs */}
              <div className="flex items-end gap-1 px-3 border-b border-slate-200 bg-slate-50 overflow-x-auto overflow-y-hidden">
                {files.map((file, idx) => (
                  <div
                    key={idx}
                    onClick={() => setActiveFileIndex(idx)}
                    className={cx(
                      'group flex items-center gap-2 h-9 px-3 font-mono text-[13px] cursor-pointer border-b-2 -mb-px whitespace-nowrap',
                      activeFileIndex === idx ? 'border-sky-500 text-sky-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800',
                    )}
                  >
                    {file.path}
                    {files.length > 1 && (
                      <button onClick={(e) => handleRemoveFile(idx, e)} className="text-slate-400 hover:text-slate-800" aria-label={`Remove ${file.path}`}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={handleAddEmptyFile} className="h-9 px-2 text-slate-400 hover:text-slate-800" aria-label="Add file">
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Warning when tab is not a supported file type */}
              {(() => {
                const path = currentFile?.path || '';
                const isSupported =
                  path.endsWith('.js') ||
                  path.endsWith('.mjs') ||
                  path.endsWith('.cjs') ||
                  path.endsWith('.ts') ||
                  path.endsWith('.tsx') ||
                  path.endsWith('.jsx') ||
                  path === 'package.json' ||
                  path.endsWith('/package.json') ||
                  path.endsWith('\\package.json');
                if (isSupported) return null;
                return (
                  <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-amber-600" />
                    <span>
                      Warning: <strong>{currentFile?.path}</strong> is not a supported file type (.js, .mjs, .cjs, .ts, .tsx, .jsx, package.json).
                    </span>
                  </div>
                );
              })()}

              {/* Editor: no soft-wrap, gutter scroll synced with the textarea */}
              <div className="flex-1 min-h-0 flex bg-white font-mono text-[13px]">
                <div
                  ref={gutterRef}
                  aria-hidden
                  className="w-12 flex-shrink-0 overflow-hidden text-right pr-3 py-3 text-slate-400 select-none border-r border-slate-100 bg-slate-50/60"
                  style={{ lineHeight: `${EDITOR_LINE}px` }}
                >
                  {Array.from({ length: lineCount }).map((_, i) => {
                    const sev = markers.get(i + 1);
                    return (
                      <div key={i} className={cx('relative', sev && SEV_MARK[sev].num, focusLine === i + 1 && 'text-slate-900 font-semibold')}>
                        {sev && <span className={cx('absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full', SEV_MARK[sev].dot)} />}
                        {i + 1}
                      </div>
                    );
                  })}
                </div>
                <div className="relative flex-1 min-w-0">
                  <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
                    {[...markers].map(([line, sev]) => (
                      <div
                        key={line}
                        className={cx('absolute inset-x-0', SEV_MARK[sev].band, focusLine === line && 'ring-1 ring-inset ring-sky-300')}
                        style={{ top: EDITOR_PAD + (line - 1) * EDITOR_LINE - editorScroll, height: EDITOR_LINE }}
                      />
                    ))}
                  </div>
                <textarea
                  ref={editorRef}
                  value={currentFile?.content || ''}
                  onChange={(e) => handleContentChange(e.target.value)}
                  onScroll={(e) => {
                    if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                    setEditorScroll(e.currentTarget.scrollTop);
                  }}
                  wrap="off"
                  spellCheck={false}
                  aria-label="Source code"
                  placeholder="// Paste your Node.js / Express code here"
                  className="editor-scroll absolute inset-0 w-full h-full py-3 px-4 bg-transparent text-slate-800 resize-none focus:outline-none whitespace-pre overflow-auto font-mono selection:bg-sky-100 selection:text-slate-900 placeholder:text-slate-400"
                  style={{ lineHeight: `${EDITOR_LINE}px` }}
                />
                </div>
              </div>

              <div className="px-5 py-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs font-medium border border-slate-200 w-fit">
                    <button
                      type="button"
                      onClick={() => setMode('rules')}
                      title="Rules: deterministic, verified"
                      className={cx(
                        'px-3 py-1 rounded-md transition-colors cursor-pointer',
                        mode === 'rules' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
                      )}
                    >
                      Rules
                    </button>
                    <button
                      type="button"
                      disabled={!aiAvailable}
                      onClick={() => setMode('ai')}
                      title={aiAvailable ? 'AI only: LLM, unverified' : 'AI not configured'}
                      className={cx(
                        'px-3 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
                        mode === 'ai' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
                      )}
                    >
                      AI only
                    </button>
                    <button
                      type="button"
                      disabled={!aiAvailable}
                      onClick={() => setMode('hybrid')}
                      title={aiAvailable ? 'Hybrid: rules + LLM, every AI patch verified' : 'AI not configured'}
                      className={cx(
                        'px-3 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
                        mode === 'hybrid' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'
                      )}
                    >
                      Hybrid
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {mode === 'rules' && 'Rules: deterministic, verified'}
                    {mode === 'ai' && (aiAvailable ? 'AI only: LLM, unverified' : 'AI not configured')}
                    {mode === 'hybrid' && (aiAvailable ? 'Hybrid: rules + LLM, every AI patch verified' : 'AI not configured')}
                  </span>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <span className="text-xs text-slate-500 hidden xl:inline">
                    {lineCount} lines · {files.length} {files.length === 1 ? 'file' : 'files'}
                  </span>
                  <Button
                    onClick={handleScan}
                    disabled={isScanning || !currentFile?.content.trim()}
                    icon={isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  >
                    {isScanning ? 'Running the gate…' : 'Run security gate'}
                  </Button>
                </div>
              </div>
            </section>

            {/* Results */}
            <div className="flex flex-col gap-6 min-w-0">
              <GatePipeline stages={stages} log={log} model={model} />

              {editorNotice && (
                <Callout tone="success" icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}>
                  {editorNotice}
                </Callout>
              )}

              {error && (
                <Callout tone="danger" icon={<AlertCircle className="w-4 h-4" />}>
                  {error}
                </Callout>
              )}

              {fixResponse && scanResponse ? (
                <>
                <ShipGate findings={fixResponse.rescan.findings} modelName={model.title} />
                <HttpProbe checks={parseHttpChecks(fixResponse)} tested={fixResponse.results.filter((r) => r.status === 'applied').length} />
                <DiffViewer
                  fixResponse={fixResponse}
                  originalScore={scanResponse.score}
                  originalFindings={scanResponse.findings}
                  onReset={() => setFixResponse(null)}
                  onApplyToEditor={handleApplyToEditor}
                />
                </>
              ) : scanResponse ? (
                <>
                  <ShipGate findings={scanResponse.findings} onFix={handleFixAll} isFixing={isFixing} modelName={model.title} />
                  <RiskMeter score={scanResponse.score} />
                  <FindingsList
                    findings={scanResponse.findings}
                    onFixAll={handleFixAll}
                    isFixing={isFixing}
                    onSelect={jumpTo}
                    scanMs={scanMs}
                    isHybrid={mode === 'hybrid'}
                  />
                  <ExploitSimulator />
                </>
              ) : (
                <section className="bg-white border border-slate-200 rounded-xl px-8 py-16 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center mb-4">
                    <ScanSearch className="w-6 h-6" />
                  </div>
                  <h2 className="text-lg font-semibold">Ready to scan</h2>
                  <p className="text-sm text-slate-500 max-w-md mt-2 leading-6">
                    Pick a sample or paste your Express / MongoDB code, then scan it for hard-coded secrets, injection sinks,
                    unauthenticated routes, vulnerable dependencies and IDOR.
                  </p>
                  <ul className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left w-full max-w-xl">
                    {[
                      ['1', 'Static rules', 'Deterministic AST scan'],
                      ['2', model.title, model.title === 'QwenSkuld' ? 'Our fine-tuned model finds what rules miss' : 'AI model finds what rules miss'],
                      ['3', 'Live HTTP test', 'Each fix proven by a real attack'],
                    ].map(([n, t, d]) => (
                      <li key={n} className="flex gap-3 p-3 rounded-lg border border-slate-200">
                        <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                          {n}
                        </span>
                        <span>
                          <span className="block text-sm font-medium">{t}</span>
                          <span className="block text-xs text-slate-500">{d}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-8"
                    onClick={handleScan}
                    disabled={isScanning}
                    icon={isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  >
                    {isScanning ? 'Running the gate…' : 'Run the security gate'}
                  </Button>
                </section>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-12 flex items-center justify-between text-xs text-slate-500">
          <span>SlopStop · patches are never written to disk without your confirmation</span>
          <span className="hidden sm:inline">Rules: deterministic · Hybrid: every AI fix verified (up to six checks)</span>
        </div>
      </footer>
    </div>
  );
}
