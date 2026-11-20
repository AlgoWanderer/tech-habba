// Contract types - strictly matching SlopStop shared contract

export type FindingCategory = "secret" | "injection" | "auth" | "dependency" | "idor";
export type FindingSeverity = "critical" | "high" | "medium" | "low";
export type FixableStatus = "auto" | "review";
export type FindingSource = "rule" | "ai";
export type ScanMode = "rules" | "ai" | "hybrid";
export type FixMode = "rules" | "hybrid";

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
  source?: FindingSource;   // Phase 2: "rule" | "ai" (missing = "rule")
  confidence?: number;     // Phase 2: 0..1 confidence for AI findings
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
  mode?: ScanMode;
}

export interface ScanResponse {
  findings: Finding[];
  score: Score;
}

export interface FixRequest {
  files: FileInput[];
  findingIds: string[];
  mode?: FixMode;
  aiFindings?: Finding[];
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
  source?: FindingSource; // Phase 2: "rule" | "ai"
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

// Phase 2 Model evaluation metrics (GET /api/model-eval)
export interface ModelMetricRow {
  model: string;
  precision?: number;
  recall?: number;
  f1?: number;
  accuracy?: number;
  categoryAccuracy?: Record<string, number>;
  meanMs?: number;
}

export interface ModelEvalResponse {
  method?: string;
  models?: ModelMetricRow[];
}

// Health check response
export interface HealthResponse {
  ok: boolean;
  ai?: boolean;
  version?: string;
}

// Phase 2 Experiment summary (GET /api/experiment)
export interface ExperimentArmSummary {
  arm: "rules" | "ai" | "hybrid";
  flawsFound: number;
  criticalHighLeft: number;
  appsBroken: number;
  aiPatchesRejected: number;
  msPerApp: number;
}

export interface ExperimentSummary {
  arms?: ExperimentArmSummary[];
  hypothesis?: string;
  timestamp?: string;
}
