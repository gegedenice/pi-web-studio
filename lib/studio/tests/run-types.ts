// Campaign files (STUDIO.md §2.4), shared by the server and the pages: no Node imports.

export const CASE_STATUSES = ["en-attente", "en-cours", "termine", "erreur", "timeout"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const VERDICTS = ["ok", "partiel", "ko"] as const;
export type Verdict = (typeof VERDICTS)[number] | null;
export type RunStatus = "en-cours" | "terminee" | "arretee" | "interrompue";

export interface RunToolCall {
  name: string;
  /** Arguments as JSON, shortened. */
  input: string;
  /** Result text, shortened. */
  result: string;
  isError: boolean;
  /** Refused by pi-web's read-only MCP rule (the server does not mark the tool readOnlyHint). */
  blocked?: boolean;
}

export interface RunCase {
  suite: string;
  id: string;
  requete: string;
  attendu: string;
  sources: string;
  status: CaseStatus;
  durationMs: number;
  tokens: { input: number; output: number };
  /** Relative to the run folder: `cases/<id>.md`. */
  transcript: string;
  sessionId?: string;
  sessionFile?: string;
  answer?: string;
  error?: string;
  toolCalls?: RunToolCall[];
  verdict: Verdict;
  comment: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface RunFile {
  runId: string;
  pack: string;
  packCommit: string;
  model: { provider: string; id: string };
  startedBy: string;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  /** `mcpTools`: "all" lifts pi-web's block on MCP tools without readOnlyHint; absent in campaigns before lot 3 (read-only). */
  options: { timeoutMs: number; concurrency: number; tools: string[]; mcpTools?: "all" | "read-only"; thinkingLevel?: string };
  cases: RunCase[];
}

export interface RunSummary {
  runId: string;
  model: { provider: string; id: string };
  startedAt: string;
  startedBy: string;
  status: RunStatus;
  packCommit: string;
  counts: Record<CaseStatus, number>;
  reviewed: number;
  total: number;
  suites: string[];
}

export function caseKey(item: { suite: string; id: string }): string {
  return `${item.suite}/${item.id}`;
}
