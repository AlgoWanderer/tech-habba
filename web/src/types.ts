// Contract types - strictly matching SlopStop shared contract

export type FindingCategory = "secret" | "injection" | "auth" | "dependency" | "idor";
export type FindingSeverity = "critical" | "high" | "medium" | "low";
export type FixableStatus = "auto" | "review";

export interface Finding {
  id: string;            // stable: `${ruleId}:${file}:${line}`
  ruleId: string;        // e.g. "secret-hardcoded", "nosql-injection", "route-no-auth", "dep-vuln", "idor-suspect"
  category: FindingCategory;
  severity: FindingSeverity;
  file: string;
  line: number;
  endLine: number;
  snippet: string;
  message: string;
  fixable: FixableStatus;
  fixPreview?: string;
}

export interface ScoreCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface Score {
  safety: number; // 0-100
  counts: ScoreCounts;
}

export interface FileInput {
  path: string;
  content: string;
}

export interface ScanRequest {
  files: FileInput[];
}

export interface ScanResponse {
  findings: Finding[];
  score: Score;
}

export interface FixRequest {
  files: FileInput[];
  findingIds: string[];
}

export interface PatchedFile {
  path: string;
  original: string;
  patched: string;
}

export type FixResultStatus = "applied" | "rejected" | "review";

export interface FixResult {
  findingId: string;
  status: FixResultStatus;
  reason: string;
}

export interface FixResponse {
  patched: PatchedFile[];
  envFile: string;
  results: FixResult[];
  rescan: {
    findings: Finding[];
    score: Score;
  };
  timingMs?: number;
}

export interface ExploitEndpointResponse {
  status: number;
  body: any;
}

export interface ExploitResponse {
  before: ExploitEndpointResponse;
  after: ExploitEndpointResponse;
}

export interface Redaction {
  type: string;
  original: string;
}

export interface HardenPromptRequest {
  prompt: string;
}

export interface HardenPromptResponse {
  hardened: string;
  redactions: Redaction[];
  rules: string[];
}

// Benchmark Scorecard types (from corpus/benchmark/results.json)
export interface BenchmarkMetric {
  totalApps?: number;
  totalVulnerabilities?: number;
  rejectionRate?: number;
  msPerFile?: number;
  baselineVulnerabilities?: number;
  slopstopVulnerabilities?: number;
  failureAnalysis?: Array<{
    category: string;
    reason: string;
    count?: number;
  }>;
  detectedVulnerabilities?: number;
  cleanApps?: number;
  falsePositivesOnCleanApps?: number;
  fixesApplied?: number;
  comparison?: Array<{
    tool: string;
    detected?: number;
    total?: number;
    fixed?: number;
    findingsOnCleanApps?: number;
  }>;
}
