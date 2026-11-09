import { existsSync, readdirSync } from "node:fs";
import { serializeByKey } from "../../key-serializer";
import { deleteSessions } from "../../session-delete";
import { StudioError } from "../errors";
import { readPackText, removePackEntry, writePackTextAtomic } from "../files";
import { type GitAuthor, withPacksLock } from "../git";
import { commitPackChange, readPackMeta } from "../packs";
import { assertPackId, resolvePackPath, runDirRel, RUNS_DIR } from "../paths";
import { slugify } from "../slug";
import { isRunActive } from "./active-runs";
import { CASE_STATUSES, type RunCase, type RunFile, type RunSummary, type Verdict, VERDICTS } from "./run-types";

export const RUN_ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}(-\d{2})?_[a-z0-9-]{1,64}(-\d+)?$/;
const RUN_LOCK = Symbol.for("pi-studio:run-files");
const COMMENT_MAX_LENGTH = 2000;

/** Recorded as the author of what the Studio does on its own (an interrupted campaign). */
export const STUDIO_AUTHOR: GitAuthor = { name: "PI Studio", email: "studio@studio.invalid" };

export function assertRunId(value: unknown): string {
  if (typeof value !== "string" || !RUN_ID_PATTERN.test(value)) throw new StudioError("invalidRun", 400);
  return value;
}

export function runFileRel(runId: string): string {
  return `${runDirRel(runId)}/run.json`;
}

export function caseTranscriptRel(id: string): string {
  return `cases/${id}.md`;
}

/** `2026-10-14T15-20_qwen3-vl-8b-instruct`, made unique in the pack with -2, -3… */
export function makeRunId(packId: string, modelId: string, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}`;
  const base = `${stamp}_${slugify(modelId) || "modele"}`;
  let runId = base;
  for (let n = 2; existsSync(resolvePackPath(packId, runDirRel(runId))); n++) runId = `${base}-${n}`;
  return runId;
}

function parseRun(text: string, runId: string): RunFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new StudioError("runUnreadable", 409, { run: runId });
  }
  if (!data || typeof data !== "object" || !Array.isArray((data as RunFile).cases)) throw new StudioError("runUnreadable", 409, { run: runId });
  return data as RunFile;
}

function readRunFile(packId: string, runId: string): RunFile {
  const text = readPackText(resolvePackPath(packId, runFileRel(runId)));
  if (text === undefined) throw new StudioError("runNotFound", 404, { run: runId });
  return parseRun(text, runId);
}

function writeRunFile(packId: string, run: RunFile): void {
  writePackTextAtomic(resolvePackPath(packId, runFileRel(run.runId)), `${JSON.stringify(run, null, 2)}\n`);
}

/**
 * Every change to a run.json is read, changed and written in one queue per run,
 * so the runner's progress and a reviewer's verdicts never overwrite each other.
 */
export function updateRun(packId: string, runId: string, change: (run: RunFile) => void): Promise<RunFile> {
  return serializeByKey(RUN_LOCK, `${packId}/${runId}`, async () => {
    const run = readRunFile(packId, runId);
    change(run);
    writeRunFile(packId, run);
    return run;
  });
}

export function createRunFile(packId: string, run: RunFile): void {
  if (existsSync(resolvePackPath(packId, runFileRel(run.runId)))) throw new StudioError("runExists", 409, { run: run.runId });
  writeRunFile(packId, run);
}

/** Commits a run's folder (run.json and transcripts) as one version. */
export async function commitRun(packId: string, runId: string, action: Parameters<typeof commitPackChange>[2], author: GitAuthor): Promise<void> {
  await withPacksLock(() => commitPackChange(packId, [runDirRel(runId)], action, author));
}

function summarize(run: RunFile): RunSummary {
  const counts = Object.fromEntries(CASE_STATUSES.map((status) => [status, 0])) as RunSummary["counts"];
  for (const item of run.cases) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return {
    runId: run.runId,
    model: run.model,
    startedAt: run.startedAt,
    startedBy: run.startedBy,
    status: run.status,
    packCommit: run.packCommit,
    counts,
    reviewed: run.cases.filter((item) => item.verdict !== null).length,
    total: run.cases.length,
    suites: [...new Set(run.cases.map((item) => item.suite))],
  };
}

/**
 * A run left "en cours" by a stopped server (its runner lived in that process)
 * is recorded as interrupted: its unfinished cases become errors, as one version.
 */
async function recoverIfInterrupted(packId: string, run: RunFile): Promise<RunFile> {
  if (run.status !== "en-cours" || isRunActive(packId, run.runId)) return run;
  const recovered = await updateRun(packId, run.runId, (current) => {
    if (current.status !== "en-cours") return;
    current.status = "interrompue";
    current.finishedAt = current.finishedAt ?? new Date().toISOString();
    for (const item of current.cases) {
      if (item.status === "en-cours" || item.status === "en-attente") {
        item.status = "erreur";
        item.error = "interrupted";
      }
    }
  });
  await commitRun(packId, run.runId, { kind: "run-finished", runId: run.runId, summary: "interrompue" }, STUDIO_AUTHOR);
  return recovered;
}

export async function readRun(packId: string, runIdInput: unknown): Promise<RunFile> {
  const id = assertPackId(packId);
  const runId = assertRunId(runIdInput);
  readPackMeta(id);
  return recoverIfInterrupted(id, readRunFile(id, runId));
}

export function listRunIds(packId: string): string[] {
  try {
    return readdirSync(resolvePackPath(packId, RUNS_DIR), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && RUN_ID_PATTERN.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function listRuns(packId: string): Promise<RunSummary[]> {
  const id = assertPackId(packId);
  readPackMeta(id);
  const runs: RunSummary[] = [];
  for (const runId of listRunIds(id)) {
    try {
      runs.push(summarize(await recoverIfInterrupted(id, readRunFile(id, runId))));
    } catch {
      // an unreadable run folder is skipped in the list
    }
  }
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function readRuns(packId: string): Promise<RunFile[]> {
  const id = assertPackId(packId);
  const runs: RunFile[] = [];
  for (const runId of listRunIds(id)) {
    try {
      runs.push(await recoverIfInterrupted(id, readRunFile(id, runId)));
    } catch {
      // skipped
    }
  }
  return runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export interface VerdictInput {
  suite: unknown;
  id: unknown;
  verdict: unknown;
  comment?: unknown;
}

function isVerdict(value: unknown): value is Verdict {
  return value === null || (typeof value === "string" && (VERDICTS as readonly string[]).includes(value));
}

/** Records reviewers' verdicts and comments as one version. Cases still running cannot be judged. */
export async function saveVerdicts(packId: string, runIdInput: unknown, verdicts: unknown, reviewer: GitAuthor & { id: string }): Promise<RunFile> {
  const id = assertPackId(packId);
  const runId = assertRunId(runIdInput);
  if (!Array.isArray(verdicts) || verdicts.length === 0) throw new StudioError("invalidRequest", 400);
  const now = new Date().toISOString();
  let changed = 0;
  const run = await updateRun(id, runId, (current) => {
    for (const input of verdicts as VerdictInput[]) {
      const item = current.cases.find((candidate) => candidate.suite === input.suite && candidate.id === input.id);
      if (!item) throw new StudioError("caseNotFound", 404, { id: String(input.id) });
      if (!isVerdict(input.verdict)) throw new StudioError("invalidVerdict", 400);
      if (item.status === "en-attente" || item.status === "en-cours") throw new StudioError("caseNotFinished", 409, { id: item.id });
      const comment = typeof input.comment === "string" ? input.comment.trim().slice(0, COMMENT_MAX_LENGTH) : item.comment;
      if (item.verdict === input.verdict && item.comment === comment) continue;
      item.verdict = input.verdict;
      item.comment = comment;
      item.reviewedBy = reviewer.id;
      item.reviewedAt = now;
      changed++;
    }
  });
  if (changed) await commitRun(id, runId, { kind: "verdicts", runId, count: changed }, reviewer);
  return run;
}

export function newRunCase(base: Pick<RunCase, "suite" | "id" | "requete" | "attendu" | "sources">): RunCase {
  return {
    ...base,
    status: "en-attente",
    durationMs: 0,
    tokens: { input: 0, output: 0 },
    transcript: caseTranscriptRel(base.id),
    verdict: null,
    comment: "",
  };
}

export interface DeletedRun {
  runId: string;
  /** Test sessions removed from pi-web, when asked. */
  sessionsDeleted: number;
  /** Test sessions kept because one of them is running. */
  sessionsKept: number;
}

/**
 * Removes a campaign's folder (run.json and transcripts) as one version: it
 * stays in the history, and in any published version that held it. A running
 * campaign is stopped first. With `sessions`, its `[test]` sessions are also
 * deleted from pi-web (a running one is kept).
 */
export async function deleteRun(packId: string, runIdInput: unknown, author: GitAuthor, options: { sessions?: boolean } = {}): Promise<DeletedRun> {
  const id = assertPackId(packId);
  const runId = assertRunId(runIdInput);
  readPackMeta(id);
  if (isRunActive(id, runId)) throw new StudioError("runActive", 409, { run: runId });
  const run = readRunFile(id, runId);
  await withPacksLock(async () => {
    removePackEntry(resolvePackPath(id, runDirRel(runId)));
    await commitPackChange(id, [runDirRel(runId)], { kind: "delete-run", runId }, author);
  });
  if (!options.sessions) return { runId, sessionsDeleted: 0, sessionsKept: 0 };
  const ids = [...new Set(run.cases.map((item) => item.sessionId).filter((value): value is string => Boolean(value)))];
  if (!ids.length) return { runId, sessionsDeleted: 0, sessionsKept: 0 };
  const result = await deleteSessions(ids, { keepRunning: true });
  return { runId, sessionsDeleted: result.deleted.length, sessionsKept: result.running.length };
}
