import type { PackJourney } from "../types";
import { caseKey, type CaseStatus, type RunFile, type Verdict } from "./run-types";

// Cases × campaigns (STUDIO.md lot 2, Comparaison): one row per case met in any
// campaign, one column per campaign, the verdict (or the status) in each cell.

export interface ComparisonRow {
  key: string;
  suite: string;
  id: string;
  requete: string;
}

export interface ComparisonColumn {
  runId: string;
  model: string;
  startedAt: string;
  packCommit: string;
}

export interface ComparisonCell {
  status: CaseStatus;
  verdict: Verdict;
  comment: string;
}

export interface Comparison {
  suites: string[];
  rows: ComparisonRow[];
  columns: ComparisonColumn[];
  cells: Record<string, Record<string, ComparisonCell>>;
}

export function compareRuns(runs: RunFile[], suite?: string | null): Comparison {
  const rows = new Map<string, ComparisonRow>();
  const cells: Comparison["cells"] = {};
  const columns: ComparisonColumn[] = [];
  const suites = new Set<string>();
  for (const run of [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const cases = run.cases.filter((item) => {
      suites.add(item.suite);
      return !suite || item.suite === suite;
    });
    if (!cases.length) continue;
    columns.push({ runId: run.runId, model: `${run.model.provider}/${run.model.id}`, startedAt: run.startedAt, packCommit: run.packCommit });
    for (const item of cases) {
      const key = caseKey(item);
      if (!rows.has(key)) rows.set(key, { key, suite: item.suite, id: item.id, requete: item.requete });
      (cells[key] ??= {})[run.runId] = { status: item.status, verdict: item.verdict, comment: item.comment };
    }
  }
  return {
    suites: [...suites].sort(),
    rows: [...rows.values()].sort((a, b) => a.suite.localeCompare(b.suite) || a.id.localeCompare(b.id, undefined, { numeric: true })),
    columns,
    cells,
  };
}

/** Évaluer: ready once a finished campaign has every case judged; in progress with suites or campaigns. */
export function evaluateStep(suiteCount: number, runs: RunFile[]): PackJourney["evaluate"] {
  if (runs.some((run) => run.status !== "en-cours" && run.cases.length > 0 && run.cases.every((item) => item.verdict !== null))) return "ready";
  return suiteCount > 0 || runs.length > 0 ? "progress" : "todo";
}
