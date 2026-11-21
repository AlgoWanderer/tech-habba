// Security-gate pipeline state + parsing of the server's live HTTP-test results.
// Everything shown in the pipeline comes from real API responses; nothing is simulated.
import { Finding, FixResponse } from '../types';

export type StageId = 'rules' | 'qwen' | 'http';
export type StageStatus = 'idle' | 'running' | 'done' | 'skipped' | 'failed';

export interface StageState {
  status: StageStatus;
  /** Big number shown on the stage card, e.g. "3 findings". */
  metric?: string;
  /** One-line detail under the metric. */
  detail?: string;
  ms?: number;
}

export type Stages = Record<StageId, StageState>;

export const IDLE_STAGES: Stages = {
  rules: { status: 'idle' },
  qwen: { status: 'idle' },
  http: { status: 'idle' },
};

export interface LogLine {
  id: number;
  stage: StageId;
  text: string;
  tone?: 'info' | 'good' | 'bad' | 'muted';
}

/** One live HTTP verification, parsed from a fix result's reason. */
export interface HttpCheck {
  findingId: string;
  route: string; // "POST /api/login"
  passed: boolean;
  attackBefore?: number;
  attackAfter?: number;
  normal?: number;
  attackText?: string; // "an operator payload ({"$ne": null})"
  normalText?: string; // "valid input still works"
  failure?: string;
}

const PASSED = /HTTP test passed on (\S+ \S+): before the fix (.+?) \((\d{3})\); after it (.+?) \((\d{3})\), and (.+?) \((\d{3})\)/;
const FAILED = /HTTP (attack|normal) mode FAILED on (\S+ \S+): (.+?)(?:\.|$)/;
const NO_START = /patched app does not start \((.+?)\)/;

/** Strip "was accepted"/"was refused" etc. so the attack reads as a noun phrase. */
const attackNoun = (s: string) => s.replace(/\s+(was|were|got)\b.*$/, '').trim();

export function parseHttpChecks(fix: FixResponse | null): HttpCheck[] {
  if (!fix) return [];
  const out: HttpCheck[] = [];
  for (const r of fix.results) {
    const reason = r.reason ?? '';
    const p = reason.match(PASSED);
    if (p) {
      out.push({
        findingId: r.findingId,
        route: p[1],
        passed: true,
        attackText: attackNoun(p[2]),
        attackBefore: Number(p[3]),
        attackAfter: Number(p[5]),
        normalText: p[6],
        normal: Number(p[7]),
      });
      continue;
    }
    const f = reason.match(FAILED);
    if (f) {
      out.push({ findingId: r.findingId, route: f[2], passed: false, failure: `${f[1]} mode failed: ${f[3]}` });
      continue;
    }
    const n = reason.match(NO_START);
    if (n) out.push({ findingId: r.findingId, route: '', passed: false, failure: `patched app does not start (${n[1]})` });
  }
  return out;
}

export type Verdict = 'blocked' | 'review' | 'ship';

/** Gate verdict from the current findings: any critical/high blocks; review-only findings need a human. */
export function verdictOf(findings: Finding[]): Verdict {
  if (findings.some((f) => f.severity === 'critical' || f.severity === 'high')) return 'blocked';
  if (findings.length > 0) return 'review';
  return 'ship';
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface ModelLabel { title: string; sub: string; local: boolean }

/** Stage-2 label from /api/health's aiModel, so the UI never claims a model the server is not running. */
export function modelLabel(aiModel: string | null): ModelLabel {
  if (!aiModel) return { title: 'AI model', sub: 'Not configured', local: false };
  if (/qwenskuld|slopstop-qwen/i.test(aiModel)) return { title: 'QwenSkuld', sub: 'Fine-tuned, runs locally', local: true };
  if (aiModel.startsWith('ollama:')) return { title: aiModel.slice(7), sub: 'Local model (Ollama)', local: true };
  if (aiModel.startsWith('gemini:')) return { title: 'Gemini', sub: 'Hosted API, secrets masked first', local: false };
  return { title: aiModel, sub: 'AI model', local: false };
}
