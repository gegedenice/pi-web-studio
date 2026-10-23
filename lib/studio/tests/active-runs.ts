// Campaigns running in this server process (globalThis survives hot reload and
// is shared by every route bundle), so other modules can tell a live campaign
// from one a restart interrupted, and leave its files out of "changed outside
// the Studio" until the campaign records them.

interface ActiveRun {
  packId: string;
  runId: string;
  controller: AbortController;
}

const KEY = Symbol.for("pi-studio:active-runs");

function registry(): Map<string, ActiveRun> {
  const store = globalThis as Record<symbol, Map<string, ActiveRun> | undefined>;
  return (store[KEY] ??= new Map());
}

const id = (packId: string, runId: string) => `${packId}\0${runId}`;

export function markRunActive(packId: string, runId: string, controller: AbortController): void {
  registry().set(id(packId, runId), { packId, runId, controller });
}

export function markRunDone(packId: string, runId: string): void {
  registry().delete(id(packId, runId));
}

export function isRunActive(packId: string, runId: string): boolean {
  return registry().has(id(packId, runId));
}

export function activeRunController(packId: string, runId: string): AbortController | undefined {
  return registry().get(id(packId, runId))?.controller;
}

export function activeRunIds(packId: string): string[] {
  return [...registry().values()].filter((run) => run.packId === packId).map((run) => run.runId);
}
