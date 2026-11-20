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
  ExperimentSummary
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

  async fix(files: FileInput[], findingIds: string[], mode: FixMode = 'rules'): Promise<FixResponse> {
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

    const response = await fetch(`${API_URL}/api/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, findingIds, mode })
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
        hypothesis: "An LLM finds and fixes flaws that rules miss, but only a deterministic verifier makes its output safe to ship: rules + LLM + verifier (hybrid) finds more flaws than rules alone and breaks no apps, while the LLM alone breaks some.",
        arms: [
          { arm: "rules", flawsFound: 56, criticalHighLeft: 9, appsBroken: 0, aiPatchesRejected: 0, msPerApp: 140 },
          { arm: "ai", flawsFound: 68, criticalHighLeft: 18, appsBroken: 4, aiPatchesRejected: 0, msPerApp: 1250 },
          { arm: "hybrid", flawsFound: 72, criticalHighLeft: 3, appsBroken: 0, aiPatchesRejected: 6, msPerApp: 1390 }
        ]
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
  }
};
