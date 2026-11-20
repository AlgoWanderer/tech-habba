import {
  FileInput,
  ScanResponse,
  FixResponse,
  ExploitResponse,
  HardenPromptResponse,
  BenchmarkMetric
} from './types';
import {
  mockScanResponse,
  mockFixResponse,
  mockExploitResponse,
  mockHardenPromptResponse,
  mockBenchmarkResults
} from './mocks/sampleData';

const isMock = import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.VITE_USE_MOCK === true;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const apiClient = {
  isMockMode(): boolean {
    return isMock;
  },

  async scan(files: FileInput[]): Promise<ScanResponse> {
    if (isMock) {
      // Simulate realistic local latency (150ms)
      await new Promise(r => setTimeout(r, 150));
      return mockScanResponse;
    }

    const response = await fetch(`${API_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files })
    });

    if (!response.ok) {
      throw new Error(`Scan API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  async fix(files: FileInput[], findingIds: string[]): Promise<FixResponse> {
    if (isMock) {
      await new Promise(r => setTimeout(r, 200));
      return mockFixResponse;
    }

    const response = await fetch(`${API_URL}/api/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, findingIds })
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
      // In real mode, attempt to load from server or static benchmark path
      const response = await fetch(`${API_URL}/api/benchmark`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // fallback if corpus endpoint is not mounted yet
    }
    return mockBenchmarkResults;
  }
};
