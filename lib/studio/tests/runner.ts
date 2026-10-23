import { StudioError } from "../errors";
import { writePackTextAtomic } from "../files";
import { headRevision } from "../git";
import type { StudioIdentity } from "../identity";
import { externalChanges, readPackMeta } from "../packs";
import { assertPackId, resolvePackPath, runDirRel } from "../paths";
import { hasErrors } from "../validate";
import { activeRunController, isRunActive, markRunActive, markRunDone } from "./active-runs";
import type { CaseExecutor, CaseOutcome } from "./executor";
import type { RunCase, RunFile } from "./run-types";
import { assertRunId, commitRun, createRunFile, makeRunId, newRunCase, readRun, updateRun } from "./runs";
import { listSuiteNames, readSuite } from "./suites";
import { buildTranscript } from "./transcript";

// Campaigns (STUDIO.md lot 2): every case in a fresh session, one at a time by
// default; a case that fails or times out never stops the campaign. Progress is
// written to run.json as it happens; the run folder becomes one version at the end.

export const DEFAULT_TIMEOUT_MS = 5 * 60_000;
export const MAX_TIMEOUT_MS = 60 * 60_000;
export const MAX_CONCURRENCY = 4;
export const DEFAULT_TEST_TOOLS = ["read"];
const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

export interface StartCampaignInput {
  /** Suites to run; all of the pack's when empty. */
  suites?: unknown;
  /** Cases to keep (`suite/id`); all cases of the suites when absent. */
  cases?: unknown;
  model: unknown;
  thinkingLevel?: unknown;
  timeoutMs?: unknown;
  concurrency?: unknown;
}

function stringList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new StudioError("invalidRequest", 400);
  return value as string[];
}

function integerIn(value: unknown, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new StudioError("invalidRequest", 400);
  return number;
}

/** What a campaign would test, checked before anything is written. */
export function planCampaign(packId: string, input: StartCampaignInput) {
  const id = assertPackId(packId);
  const meta = readPackMeta(id);
  const model = input.model as { provider?: unknown; modelId?: unknown } | undefined;
  if (!model || typeof model.provider !== "string" || !model.provider || typeof model.modelId !== "string" || !model.modelId) {
    throw new StudioError("invalidModel", 400);
  }
  const thinkingLevel = input.thinkingLevel === undefined || input.thinkingLevel === null || input.thinkingLevel === "" ? undefined : String(input.thinkingLevel);
  if (thinkingLevel && !THINKING_LEVELS.has(thinkingLevel)) throw new StudioError("invalidRequest", 400);
  const requestedSuites = stringList(input.suites);
  const suites = requestedSuites?.length ? requestedSuites : listSuiteNames(id);
  const keep = stringList(input.cases);
  const cases: RunCase[] = [];
  for (const name of suites) {
    const suite = readSuite(id, name);
    if (hasErrors(suite.issues)) throw new StudioError("suiteInvalid", 422, { name }, suite.issues);
    for (const item of suite.cases) {
      if (keep && !keep.includes(`${name}/${item.id}`)) continue;
      cases.push(newRunCase({ suite: name, id: item.id, requete: item.requete, attendu: item.attendu, sources: item.sources }));
    }
  }
  if (!cases.length) throw new StudioError("campaignEmpty", 400);
  return {
    id,
    cases,
    model: { provider: model.provider, id: model.modelId },
    thinkingLevel,
    timeoutMs: integerIn(input.timeoutMs, 10_000, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    concurrency: integerIn(input.concurrency, 1, MAX_CONCURRENCY, 1),
    tools: meta.tests?.tools?.length ? meta.tests.tools : DEFAULT_TEST_TOOLS,
  };
}

function summaryOf(run: RunFile): string {
  const count = (status: RunCase["status"]) => run.cases.filter((item) => item.status === status).length;
  const parts = [`${run.cases.length} cas`, `${count("termine")} terminés`];
  if (count("erreur")) parts.push(`${count("erreur")} en erreur`);
  if (count("timeout")) parts.push(`${count("timeout")} hors délai`);
  if (run.status === "arretee") parts.push("arrêtée");
  return parts.join(", ");
}

async function runCase(packId: string, packDir: string, run: RunFile, item: RunCase, executor: CaseExecutor, signal: AbortSignal): Promise<void> {
  await updateRun(packId, run.runId, (current) => {
    const target = current.cases.find((candidate) => candidate.suite === item.suite && candidate.id === item.id);
    if (target) target.status = "en-cours";
  });
  const outcome = await executor.run({
    packId,
    packDir,
    caseId: item.id,
    message: item.requete,
    model: run.model,
    thinkingLevel: run.options.thinkingLevel,
    tools: run.options.tools,
    timeoutMs: run.options.timeoutMs,
    signal,
    sessionName: `[test] ${packId} · ${item.id} · ${run.model.id}`,
  }).catch((error: unknown): CaseOutcome => ({
    status: "erreur",
    error: error instanceof Error ? error.message : String(error),
    durationMs: 0,
    tokens: { input: 0, output: 0 },
    answer: "",
    toolCalls: [],
    messages: [{ role: "user", content: item.requete }],
  }));
  const transcript = buildTranscript({
    pack: packId,
    suite: item.suite,
    id: item.id,
    model: `${run.model.provider}/${run.model.id}`,
    packCommit: run.packCommit,
    status: outcome.status,
    durationMs: outcome.durationMs,
    requete: item.requete,
    attendu: item.attendu,
    sources: item.sources,
    ...(outcome.error ? { error: outcome.error } : {}),
  }, outcome.messages);
  writePackTextAtomic(resolvePackPath(packId, `${runDirRel(run.runId)}/${item.transcript}`), transcript);
  await updateRun(packId, run.runId, (current) => {
    const target = current.cases.find((candidate) => candidate.suite === item.suite && candidate.id === item.id);
    if (!target) return;
    target.status = outcome.status;
    target.durationMs = outcome.durationMs;
    target.tokens = outcome.tokens;
    target.answer = outcome.answer.slice(0, 50_000);
    target.toolCalls = outcome.toolCalls;
    if (outcome.error) target.error = outcome.error;
    else delete target.error;
    if (outcome.sessionId) target.sessionId = outcome.sessionId;
    if (outcome.sessionFile) target.sessionFile = outcome.sessionFile;
  });
}

async function execute(packId: string, run: RunFile, executor: CaseExecutor, controller: AbortController, author: StudioIdentity): Promise<void> {
  const packDir = resolvePackPath(packId);
  const queue = [...run.cases];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      if (controller.signal.aborted) return;
      try {
        await runCase(packId, packDir, run, item, executor, controller.signal);
      } catch (error) {
        console.error(`[studio] case ${item.id} of ${run.runId}:`, error);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(run.options.concurrency, run.cases.length) }, worker));
  } finally {
    const finished = await updateRun(packId, run.runId, (current) => {
      current.status = controller.signal.aborted ? "arretee" : "terminee";
      current.finishedAt = new Date().toISOString();
      for (const item of current.cases) {
        if (item.status === "en-attente" || item.status === "en-cours") {
          item.status = "erreur";
          item.error = "stopped";
        }
      }
    }).catch((error) => {
      console.error(`[studio] cannot finish ${run.runId}:`, error);
      return null;
    });
    if (finished) {
      await commitRun(packId, run.runId, { kind: "run-finished", runId: run.runId, summary: summaryOf(finished) }, author)
        .catch((error) => console.error(`[studio] cannot record ${run.runId}:`, error));
    }
    markRunDone(packId, run.runId);
  }
}

export interface StartedCampaign {
  run: RunFile;
  /** Files of the pack changed outside the Studio when it started (the campaign tests the saved version). */
  unsavedChanges: number;
  /** Resolves when the campaign has ended and been recorded (tests wait on it). */
  done: Promise<void>;
}

/** Writes run.json, then runs the cases in the background. */
export async function startCampaign(packId: string, input: StartCampaignInput, author: StudioIdentity, executor: CaseExecutor): Promise<StartedCampaign> {
  const plan = planCampaign(packId, input);
  const revision = await headRevision();
  const startedAt = new Date();
  const run: RunFile = {
    runId: makeRunId(plan.id, plan.model.id, startedAt),
    pack: plan.id,
    packCommit: revision ? revision.slice(0, 7) : "",
    model: plan.model,
    startedBy: author.id,
    startedAt: startedAt.toISOString(),
    status: "en-cours",
    options: {
      timeoutMs: plan.timeoutMs,
      concurrency: plan.concurrency,
      tools: plan.tools,
      ...(plan.thinkingLevel ? { thinkingLevel: plan.thinkingLevel } : {}),
    },
    cases: plan.cases,
  };
  const unsavedChanges = (await externalChanges(plan.id)).length;
  const controller = new AbortController();
  markRunActive(plan.id, run.runId, controller);
  try {
    createRunFile(plan.id, run);
  } catch (error) {
    markRunDone(plan.id, run.runId);
    throw error;
  }
  const done = execute(plan.id, run, executor, controller, author);
  return { run, unsavedChanges, done };
}

export async function stopCampaign(packId: string, runIdInput: unknown): Promise<RunFile> {
  const id = assertPackId(packId);
  const runId = assertRunId(runIdInput);
  const controller = activeRunController(id, runId);
  if (!controller) throw new StudioError("runNotActive", 409, { run: runId });
  controller.abort();
  return readRun(id, runId);
}

export function campaignIsActive(packId: string, runId: string): boolean {
  return isRunActive(packId, runId);
}

/** The cases a stopped or interrupted campaign did not finish, to run them again. */
export function unfinishedCases(run: RunFile): string[] {
  return run.cases.filter((item) => item.status === "erreur" && (item.error === "stopped" || item.error === "interrupted")).map((item) => `${item.suite}/${item.id}`);
}
