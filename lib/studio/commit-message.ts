// Version messages, in French, as the history shows them:
// "[literature-review] Modifie skill openalex-search". An optional note typed
// by the user replaces the generated summary on the first line; the summary
// then stays in the body, so the history keeps both.

export type StudioAction =
  | { kind: "create-pack" }
  | { kind: "edit-file"; path: string }
  | { kind: "create-skill"; name: string }
  | { kind: "import-skill"; name: string }
  | { kind: "edit-skill"; name: string }
  | { kind: "rename-skill"; from: string; to: string }
  | { kind: "delete-skill"; name: string }
  | { kind: "restore-file"; path: string; date: string }
  | { kind: "restore-skill"; name: string; date: string }
  | { kind: "edit-config" }
  | { kind: "keep-external"; paths: string[] }
  | { kind: "discard-external"; paths: string[] };

const NOTE_MAX_LENGTH = 200;

function fileLabel(path: string): string {
  if (path === ".pi/APPEND_SYSTEM.md" || path === ".pi/SYSTEM.md") return "consignes système";
  if (path === ".pi/settings.json") return "réglages Pi";
  const skill = /^\.pi\/skills\/([^/]+)\/SKILL\.md$/.exec(path);
  if (skill) return `skill ${skill[1]}`;
  return path;
}

/** The date as the history shows it in a message: 14/10/2026 15:20 (UTC). */
function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function describeAction(action: StudioAction): string {
  switch (action.kind) {
    case "create-pack": return "Crée le pack";
    case "edit-file": return `Modifie ${fileLabel(action.path)}`;
    case "create-skill": return `Crée skill ${action.name}`;
    case "import-skill": return `Importe skill ${action.name}`;
    case "edit-skill": return `Modifie skill ${action.name}`;
    case "rename-skill": return `Renomme skill ${action.from} en ${action.to}`;
    case "delete-skill": return `Supprime skill ${action.name}`;
    case "restore-file": return `Restaure ${fileLabel(action.path)} (version du ${shortDate(action.date)})`;
    case "restore-skill": return `Restaure skill ${action.name} (supprimée le ${shortDate(action.date)})`;
    case "edit-config": return "Modifie la configuration";
    case "keep-external": return "Enregistre les modifications faites hors Studio";
    case "discard-external": return "Annule les modifications faites hors Studio";
  }
}

/** One line, bounded, no control characters. */
export function cleanNote(note: unknown): string {
  if (typeof note !== "string") return "";
  return note.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX_LENGTH);
}

export function commitMessage(packId: string, action: StudioAction, note?: unknown): string {
  const summary = describeAction(action);
  const cleaned = cleanNote(note);
  const lines = [`[${packId}] ${cleaned || summary}`];
  if (cleaned) lines.push(summary);
  if (action.kind === "keep-external" || action.kind === "discard-external") {
    lines.push(action.paths.map((path) => `- ${path}`).join("\n"));
  }
  return lines.join("\n\n");
}
