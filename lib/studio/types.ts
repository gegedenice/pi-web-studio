// Types shared by the Studio's API routes and its pages. No Node imports:
// client components import this file.

export const PACK_STATUSES = ["en-conception", "en-test", "valide", "archive"] as const;
export type PackStatus = (typeof PACK_STATUSES)[number];
/** pi's coding tools a pack may give its test sessions (MCP tools come on top). */
export const TEST_TOOL_NAMES = ["read", "grep", "find", "ls", "bash", "edit", "write"] as const;
/** Tools that reach outside the pack folder: the configuration warns about them (STUDIO-NOTES Q-L2-2). */
export const WIDE_TEST_TOOLS = ["bash", "ls", "find"] as const;

/** `.studio/pack.json`, written by the Studio only. */
export interface PackMeta {
  id: string;
  title: string;
  description: string;
  status: PackStatus;
  version: string;
  owners: string[];
  createdAt: string;
  /** Lot 2: the tools test sessions get (pi's coding tools); `["read"]` when absent. */
  tests?: { tools: string[] };
}

export interface PackSummary extends PackMeta {
  /** Date of the pack's latest saved version, or null before the first one. */
  updatedAt: string | null;
}

export type JourneyStepState = "todo" | "progress" | "ready" | "later";

export interface PackJourney {
  design: JourneyStepState;
  connect: JourneyStepState;
  evaluate: JourneyStepState;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  /** i18n key suffix under `studio.validation.` */
  code: string;
  /** 1-based line in the file, when the problem has one. */
  line?: number;
  params?: Record<string, string | number>;
}

export interface SkillSummary {
  name: string;
  description: string;
  issues: ValidationIssue[];
}

export interface SkillDocument {
  name: string;
  /** Frontmatter `name` as written; may differ from the folder in a broken file. */
  declaredName: string;
  description: string;
  body: string;
  raw: string;
  hash: string;
  issues: ValidationIssue[];
}

export interface TextDocument {
  path: string;
  content: string;
  /** Empty string when the file does not exist yet. */
  hash: string;
  exists: boolean;
}

export interface HistoryEntry {
  rev: string;
  author: string;
  date: string;
  message: string;
  /** The file's path relative to the pack at that version (file history only). */
  path?: string;
  /** Files of the pack this version changed (pack history only). */
  changes?: { status: string; path: string; previousPath?: string }[];
}

export interface DeletedSkill {
  name: string;
  /** The version that deleted it; the skill is restored from the one before. */
  rev: string;
  date: string;
  author: string;
}

export interface ExternalChange {
  path: string;
  kind: "modified" | "added" | "deleted";
}

export interface PackDetails {
  meta: PackMeta;
  updatedAt: string | null;
  journey: PackJourney;
  /** Whether Pi loads the pack's `.pi` resources (project trust). */
  piLoadsProject: boolean;
  promptFiles: { append: boolean; system: boolean };
  /** AGENTS.md and a system prompt file hold text. */
  instructions: { agents: boolean; prompt: boolean };
  defaultModel: { provider: string; modelId: string } | null;
  externalChanges: ExternalChange[];
  skillCount: number;
}

export interface StudioIdentityInfo {
  id: string;
  name: string;
  fallback: boolean;
}

/** Error body of every `/api/studio` route: an i18n key and its parameters. */
export interface StudioErrorBody {
  error: string;
  code: string;
  params?: Record<string, string | number>;
  issues?: ValidationIssue[];
}
