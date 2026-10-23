import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getProjectTrustStatus } from "../project-trust";
import { commitMessage, type StudioAction } from "./commit-message";
import { getStudioConfig } from "./config";
import { StudioError } from "./errors";
import { contentHash, readPackText, writePackTextAtomic } from "./files";
import { commitPaths, ensureRepository, type GitAuthor, lastCommitDate, status, withPacksLock } from "./git";
import {
  AGENTS_FILE,
  APPEND_SYSTEM_FILE,
  assertPackId,
  isSlug,
  PACK_META_FILE,
  packRelative,
  packsRoot,
  repoPath,
  resolvePackPath,
  runDirRel,
  SETTINGS_FILE,
  SYSTEM_FILE,
} from "./paths";
import { renderPackTemplate } from "./templates";
import { activeRunIds } from "./tests/active-runs";
import { PACK_STATUSES, TEST_TOOL_NAMES, type ExternalChange, type PackDetails, type PackJourney, type PackMeta, type PackStatus, type PackSummary } from "./types";

export const TITLE_MAX_LENGTH = 120;
export { TEST_TOOL_NAMES };

function testTools(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tools = value.filter((tool): tool is string => typeof tool === "string" && (TEST_TOOL_NAMES as readonly string[]).includes(tool));
  return tools.length ? [...new Set(tools)] : undefined;
}
export const PACK_DESCRIPTION_MAX_LENGTH = 1000;

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

function isPackStatus(value: unknown): value is PackStatus {
  return typeof value === "string" && (PACK_STATUSES as readonly string[]).includes(value);
}

/** `pack.json` as written by hand or by an older Studio: missing fields get defaults. */
export function parsePackMeta(id: string, text: string): PackMeta {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch {
    // shown with defaults; the next save rewrites it
  }
  return {
    id,
    title: cleanText(data.title, TITLE_MAX_LENGTH) || id,
    description: cleanText(data.description, PACK_DESCRIPTION_MAX_LENGTH),
    status: isPackStatus(data.status) ? data.status : "en-conception",
    version: typeof data.version === "string" && /^\d+(\.\d+){0,2}$/.test(data.version) ? data.version : "0.1",
    owners: Array.isArray(data.owners) ? data.owners.filter((owner): owner is string => typeof owner === "string").slice(0, 20) : [],
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    ...(() => {
      const tools = testTools((data.tests as { tools?: unknown } | undefined)?.tools);
      return tools ? { tests: { tools } } : {};
    })(),
  };
}

export function serializePackMeta(meta: PackMeta): string {
  return `${JSON.stringify(meta, null, 2)}\n`;
}

export function readPackMeta(packId: string): PackMeta {
  const id = assertPackId(packId);
  const text = readPackText(resolvePackPath(id, PACK_META_FILE));
  if (text === undefined) throw new StudioError("packNotFound", 404, { id });
  return parsePackMeta(id, text);
}

/** Folders of the packs repository holding a `.studio/pack.json`. */
export async function listPacks(): Promise<PackSummary[]> {
  const root = packsRoot();
  const packs: PackSummary[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isSlug(entry.name)) continue;
    let meta: PackMeta;
    try {
      meta = readPackMeta(entry.name);
    } catch {
      continue;
    }
    packs.push({ ...meta, updatedAt: await lastCommitDate(repoPath(entry.name)) });
  }
  return packs.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.title.localeCompare(b.title, "fr"));
}

export interface CreatePackInput {
  id: unknown;
  title: unknown;
  description?: unknown;
}

/** Folder, pack.json, AGENTS.md, consignes and settings from the templates, then one version. */
export async function createPack(input: CreatePackInput, author: GitAuthor & { id: string }): Promise<PackMeta> {
  const id = assertPackId(input.id);
  const title = cleanText(input.title, TITLE_MAX_LENGTH);
  if (!title) throw new StudioError("titleMissing", 400);
  const description = cleanText(input.description, PACK_DESCRIPTION_MAX_LENGTH);

  return withPacksLock(async () => {
    await ensureRepository(author);
    const dir = resolvePackPath(id);
    if (existsSync(dir)) throw new StudioError("packExists", 409, { id });
    const meta: PackMeta = {
      id,
      title,
      description,
      status: "en-conception",
      version: "0.1",
      owners: [author.id],
      createdAt: new Date().toISOString(),
    };
    const values = { id, title, description };
    writePackTextAtomic(resolvePackPath(id, AGENTS_FILE), renderPackTemplate("agents", values));
    writePackTextAtomic(resolvePackPath(id, APPEND_SYSTEM_FILE), renderPackTemplate("appendSystem", values));
    writePackTextAtomic(resolvePackPath(id, SETTINGS_FILE), renderPackTemplate("settings", values));
    writePackTextAtomic(resolvePackPath(id, PACK_META_FILE), serializePackMeta(meta));
    await commitPaths([repoPath(id)], commitMessage(id, { kind: "create-pack" }), author);
    return meta;
  });
}

export interface PackConfigInput {
  title?: unknown;
  description?: unknown;
  status?: unknown;
  /** `null` removes the pack's default model; undefined leaves it. */
  defaultModel?: { provider: unknown; modelId: unknown } | null;
  /** Test sessions' tools; `null` restores the default (`read`). */
  testTools?: unknown;
  note?: unknown;
}

function readSettings(packId: string): Record<string, unknown> {
  const text = readPackText(resolvePackPath(packId, SETTINGS_FILE));
  if (!text?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new StudioError("settingsInvalid", 409);
}

export function readDefaultModel(packId: string): { provider: string; modelId: string } | null {
  try {
    const settings = readSettings(packId);
    return typeof settings.defaultProvider === "string" && typeof settings.defaultModel === "string"
      ? { provider: settings.defaultProvider, modelId: settings.defaultModel }
      : null;
  } catch {
    return null;
  }
}

/** Configuration screen: pack.json metadata and the default model in `.pi/settings.json`. */
export async function updatePackConfig(packId: string, input: PackConfigInput, author: GitAuthor): Promise<PackMeta> {
  const id = assertPackId(packId);
  return withPacksLock(async () => {
    const meta = readPackMeta(id);
    const next: PackMeta = { ...meta };
    if (input.title !== undefined) {
      next.title = cleanText(input.title, TITLE_MAX_LENGTH);
      if (!next.title) throw new StudioError("titleMissing", 400);
    }
    if (input.description !== undefined) next.description = cleanText(input.description, PACK_DESCRIPTION_MAX_LENGTH);
    if (input.status !== undefined) {
      if (!isPackStatus(input.status)) throw new StudioError("invalidStatus", 400);
      next.status = input.status;
    }
    if (input.testTools !== undefined) {
      if (input.testTools === null) delete next.tests;
      else {
        const tools = testTools(input.testTools);
        if (!tools || (Array.isArray(input.testTools) && tools.length !== input.testTools.length)) throw new StudioError("invalidTools", 400);
        if (tools.length === 1 && tools[0] === "read") delete next.tests;
        else next.tests = { tools };
      }
    }
    const paths: string[] = [];
    if (JSON.stringify(next) !== JSON.stringify(meta)) {
      writePackTextAtomic(resolvePackPath(id, PACK_META_FILE), serializePackMeta(next));
      paths.push(repoPath(id, PACK_META_FILE));
    }
    if (input.defaultModel !== undefined) {
      const settings = readSettings(id);
      const before = JSON.stringify(settings);
      if (input.defaultModel === null) {
        delete settings.defaultProvider;
        delete settings.defaultModel;
      } else {
        const provider = cleanText(input.defaultModel.provider, 200);
        const modelId = cleanText(input.defaultModel.modelId, 300);
        if (!provider || !modelId) throw new StudioError("invalidModel", 400);
        settings.defaultProvider = provider;
        settings.defaultModel = modelId;
      }
      if (JSON.stringify(settings) !== before) {
        writePackTextAtomic(resolvePackPath(id, SETTINGS_FILE), `${JSON.stringify(settings, null, 2)}\n`);
        paths.push(repoPath(id, SETTINGS_FILE));
      }
    }
    if (paths.length) {
      await ensureRepository(author);
      await commitPaths(paths, commitMessage(id, { kind: "edit-config" }, input.note), author);
    }
    return next;
  });
}

function nonEmpty(packId: string, relPath: string): boolean {
  try {
    return Boolean(readPackText(resolvePackPath(packId, relPath))?.trim());
  } catch {
    return false;
  }
}

/**
 * Concevoir: ready with instructions, a system prompt and one valid skill.
 * Évaluer is computed by the caller from the suites and campaigns (lot 2).
 * Connecter comes with lot 3.
 */
export function packJourney(packId: string, validSkills: number, anySkill: boolean, evaluate: PackJourney["evaluate"] = "todo"): PackJourney {
  const agents = nonEmpty(packId, AGENTS_FILE);
  const prompt = nonEmpty(packId, APPEND_SYSTEM_FILE) || nonEmpty(packId, SYSTEM_FILE);
  const design = agents && prompt && validSkills > 0 ? "ready" : agents || prompt || anySkill ? "progress" : "todo";
  return { design, connect: "later", evaluate };
}

/** Files of the pack changed outside the Studio (sessions, hand edits), relative to the pack. */
export async function externalChanges(packId: string): Promise<ExternalChange[]> {
  const id = assertPackId(packId);
  const changes: ExternalChange[] = [];
  // A campaign running now writes its own folder; it is recorded when it ends.
  const running = activeRunIds(id).map((runId) => `${runDirRel(runId)}/`);
  for (const entry of await status(repoPath(id))) {
    const rel = packRelative(id, entry.path);
    if (rel !== null && !running.some((prefix) => rel.startsWith(prefix))) changes.push({ path: rel, kind: entry.kind });
  }
  return changes;
}

export async function packDetails(
  packId: string,
  skills: { valid: number; total: number },
  evaluate: PackJourney["evaluate"] = "todo",
): Promise<PackDetails> {
  const id = assertPackId(packId);
  const meta = readPackMeta(id);
  const dir = resolvePackPath(id);
  const trust = getProjectTrustStatus(dir, getStudioConfig().agentDir);
  return {
    meta,
    updatedAt: await lastCommitDate(repoPath(id)),
    journey: packJourney(id, skills.valid, skills.total > 0, evaluate),
    piLoadsProject: trust.trusted,
    promptFiles: {
      append: existsSync(resolvePackPath(id, APPEND_SYSTEM_FILE)),
      system: existsSync(resolvePackPath(id, SYSTEM_FILE)),
    },
    instructions: {
      agents: nonEmpty(id, AGENTS_FILE),
      prompt: nonEmpty(id, APPEND_SYSTEM_FILE) || nonEmpty(id, SYSTEM_FILE),
    },
    defaultModel: readDefaultModel(id),
    externalChanges: await externalChanges(id),
    skillCount: skills.total,
  };
}

export function hashOf(text: string | undefined): string {
  return text === undefined ? "" : contentHash(text);
}

/** Commits pack paths after a write: used by every save of a pack file. */
export async function commitPackChange(
  packId: string,
  relPaths: string[],
  action: StudioAction,
  author: GitAuthor,
  note?: unknown,
  options: { allowEmpty?: boolean } = {},
): Promise<string | null> {
  await ensureRepository(author);
  return commitPaths(relPaths.map((rel) => repoPath(packId, rel)), commitMessage(packId, action, note), author, options);
}

/** Whether `dir` is a real folder (not a link) inside the pack. */
export function isPackDirectory(path: string): boolean {
  try {
    const stats = lstatSync(path);
    return stats.isDirectory() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

export function packFolder(packId: string): string {
  return join(packsRoot(), assertPackId(packId));
}
