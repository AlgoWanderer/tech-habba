import {
  FileInput,
  ScanResponse,
  FixResponse,
  ExploitResponse,
  HardenPromptResponse,
  BenchmarkMetric,
  ScanMode,
  FixMode,
  HealthResponse,
  ExperimentSummary,
  Finding,
  FixRequest,
  ModelEvalResponse
} from './types';
import {
  mockScanResponse,
  mockFixResponse,
  mockExploitResponse,
  mockHardenPromptResponse,
  mockBenchmarkResults,
  mockAiFindings
} from './mocks/sampleData';

const isMock = import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.VITE_USE_MOCK === true;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const apiClient = {
  isMockMode(): boolean {
    return isMock;
  },

  async getHealth(): Promise<HealthResponse> {
    if (isMock) {
      return { ok: true, ai: true, version: '1.1.0-mock' };
    }
    try {
      const response = await fetch(`${API_URL}/api/health`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Server down or offline
    }
    return { ok: false, ai: false };
  },

  async scan(files: FileInput[], mode: ScanMode = 'rules'): Promise<ScanResponse> {
    if (isMock) {
      // Simulate realistic local latency (150ms)
      await new Promise(r => setTimeout(r, 150));
      if (mode === 'ai') {
        return {
          findings: mockAiFindings,
          score: {
            safety: 77,
            counts: { critical: 0, high: 1, medium: 1, low: 0 }
          }
        };
      }
      if (mode === 'hybrid') {
        return {
          findings: [...mockScanResponse.findings, ...mockAiFindings],
          score: {
            safety: 0,
            counts: {
              critical: mockScanResponse.score.counts.critical,
              high: mockScanResponse.score.counts.high + 1,
              medium: mockScanResponse.score.counts.medium + 1,
              low: mockScanResponse.score.counts.low
            }
          }
        };
      }
      return mockScanResponse;
    }

    const response = await fetch(`${API_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, mode })
    });

    if (!response.ok) {
      throw new Error(`Scan API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  async fix(
    files: FileInput[],
    findingIds: string[],
    mode: FixMode = 'rules',
    aiFindings?: Finding[]
  ): Promise<FixResponse> {
    if (isMock) {
      await new Promise(r => setTimeout(r, 200));
      if (mode === 'hybrid') {
        return {
          ...mockFixResponse,
          results: [
            ...mockFixResponse.results,
            {
              findingId: "ai-injection:index.js:30",
              status: "rejected",
              reason: "AI patch rejected: broke syntax (missing closing parenthesis)",
              source: "ai"
            }
          ]
        };
      }
      return mockFixResponse;
    }

    const payload: FixRequest = { files, findingIds, mode };
    if (mode === 'hybrid' && Array.isArray(aiFindings) && aiFindings.length > 0) {
      payload.aiFindings = aiFindings;
    }

    const response = await fetch(`${API_URL}/api/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Fix API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  async exploit(): Promise<ExploitResponse> {
    if (isMock) {
      await new Promise(r => setTimeout(r, 180));
      return mockExploitResponse;
    }

    const response = await fetch(`${API_URL}/api/exploit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`Exploit API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  async hardenPrompt(prompt: string): Promise<HardenPromptResponse> {
    if (isMock) {
      await new Promise(r => setTimeout(r, 120));
      return mockHardenPromptResponse;
    }

    const response = await fetch(`${API_URL}/api/harden-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      throw new Error(`Harden Prompt API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  async getBenchmarkResults(): Promise<BenchmarkMetric> {
    if (isMock) {
      return mockBenchmarkResults;
    }

    try {
      // In real mode, load from server benchmark endpoint (role B's GET /api/benchmark)
      const response = await fetch(`${API_URL}/api/benchmark`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Network error or server not responding
    }

    // In real mode, return empty object so all fields show "not measured"
    return {};
  },

  async getExperimentResults(): Promise<ExperimentSummary> {
    if (isMock) {
      return {
        // Mock mode only: a copy of the measured corpus + DVNA rows from corpus/experiment/results.json.
        method: { model: "sample data (mock mode) from corpus/experiment/results.json", runs: 2 },
        bySet: {
          corpus: {
            rules: { totalApps: 30, groundTruthFlawsDetected: 56, groundTruthRecall: 1, criticalHighBefore: 65, criticalHighAfter: 9, criticalHighReductionPercent: 86.2, brokenAppsCount: 0, meanDurationMsPerApp: 97.73, totalModelCalls: 0 },
            ai: { totalApps: 30, groundTruthFlawsDetected: 37, groundTruthRecall: 0.661, criticalHighBefore: 65, criticalHighAfter: 29.5, criticalHighReductionPercent: 54.6, brokenAppsCount: 0, meanDurationMsPerApp: 4722.83, totalModelCalls: 94 },
            hybrid: { totalApps: 30, groundTruthFlawsDetected: 56, groundTruthRecall: 1, criticalHighBefore: 65, criticalHighAfter: 0.5, criticalHighReductionPercent: 99.2, brokenAppsCount: 0, meanDurationMsPerApp: 5437.17, totalModelCalls: 88 }
          },
          dvna: {
            rules: { totalApps: 1, groundTruthFlawsDetected: 1, groundTruthRecall: 0.167, criticalHighBefore: 13, criticalHighAfter: 7, criticalHighReductionPercent: 46.2, brokenAppsCount: 0 },
            ai: { totalApps: 1, groundTruthFlawsDetected: 4, groundTruthRecall: 0.667, criticalHighBefore: 13, criticalHighAfter: 9.5, criticalHighReductionPercent: 26.9, brokenAppsCount: 0 },
            hybrid: { totalApps: 1, groundTruthFlawsDetected: 3, groundTruthRecall: 0.5, criticalHighBefore: 13, criticalHighAfter: 5, criticalHighReductionPercent: 61.5, brokenAppsCount: 0 }
          }
        }
      };
    }

    try {
      const response = await fetch(`${API_URL}/api/experiment`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Endpoint not yet implemented or offline
    }

    return {};
  },

  async getModelEval(): Promise<ModelEvalResponse> {
    if (isMock) {
      // Mock mode only: a copy of the measured rows in server/eval/model-eval*.json (122 snippets).
      return {
        method: "Sample data (mock mode): measured results from server/eval/model-eval*.json, 122 snippets from corpus + DVNA.",
        models: [
          { model: "rules", precision: 0.937, recall: 0.967, f1: 0.952, accuracy: 0.951, categoryAccuracy: 0.814, invalidOrError: 0, snippets: 122, meanMs: 0 },
          { model: "gemini (gemini-3.1-flash-lite)", precision: 0.923, recall: 0.787, f1: 0.85, accuracy: 0.861, categoryAccuracy: 0.875, invalidOrError: 0, snippets: 122, meanMs: 4949 },
          { model: "ollama:qwen-base-q8", precision: 0.554, recall: 0.59, f1: 0.571, accuracy: 0.443, categoryAccuracy: 0.278, invalidOrError: 36, snippets: 122, meanMs: 2574 },
          { model: "ollama:slopstop-qwen", precision: 0.717, recall: 0.541, f1: 0.617, accuracy: 0.664, categoryAccuracy: 0.697, invalidOrError: 0, snippets: 122, meanMs: 585 }
        ]
      };
    }

    try {
      const response = await fetch(`${API_URL}/api/model-eval`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Endpoint not yet online
    }

    return {};
  }
};
