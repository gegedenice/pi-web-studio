// The last inspection of each pack server, in memory (like pi-web's own MCP
// statuses): the Connecter step needs a successful one since the server started,
// for the entry as the file holds it now (Q-L3-4).

export interface InspectionRecord {
  /** `contentHash()` of the entry it inspected. */
  entryHash: string;
  ok: boolean;
  state: string;
  at: string;
  toolCount: number;
}

const KEY = Symbol.for("pi-studio:mcp-inspections");

function store(): Map<string, InspectionRecord> {
  const holder = globalThis as Record<symbol, Map<string, InspectionRecord> | undefined>;
  return (holder[KEY] ??= new Map());
}

export function recordInspection(packId: string, name: string, record: InspectionRecord): void {
  const map = store();
  map.delete(`${packId}/${name}`);
  map.set(`${packId}/${name}`, record);
  while (map.size > 500) map.delete(map.keys().next().value as string);
}

/** The last inspection of the entry as it is now; none once the entry changed. */
export function lastInspection(packId: string, name: string, entryHash: string): InspectionRecord | undefined {
  const record = store().get(`${packId}/${name}`);
  return record && record.entryHash === entryHash ? record : undefined;
}
