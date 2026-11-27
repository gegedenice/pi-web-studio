import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { join, posix, sep } from "node:path";
import { isPathWithinRoots } from "../path-security";
import { getStudioConfig } from "./config";
import { StudioError } from "./errors";
import { isSlug } from "./slug";

export { isSlug, SLUG_MAX_LENGTH, SLUG_PATTERN } from "./slug";

export const SKILLS_DIR = ".pi/skills";
export const TESTS_DIR = "tests";
export const RUNS_DIR = ".studio/runs";
export const PACK_META_FILE = ".studio/pack.json";
export const APPEND_SYSTEM_FILE = ".pi/APPEND_SYSTEM.md";
export const SYSTEM_FILE = ".pi/SYSTEM.md";
export const SETTINGS_FILE = ".pi/settings.json";
export const AGENTS_FILE = "AGENTS.md";
export const MCP_CONFIG_FILE = ".pi/mcp.json";

/** Files the generic file route reads and writes; skills and pack.json have their own routes. */
export const EDITABLE_PACK_FILES = [AGENTS_FILE, APPEND_SYSTEM_FILE, SYSTEM_FILE, SETTINGS_FILE, MCP_CONFIG_FILE] as const;

export function assertPackId(value: unknown): string {
  if (!isSlug(value)) throw new StudioError("invalidPackId", 400);
  return value;
}

export function assertSkillName(value: unknown): string {
  if (!isSlug(value)) throw new StudioError("invalidSkillName", 400);
  return value;
}

export function isEditablePackFile(relPath: string): boolean {
  return (EDITABLE_PACK_FILES as readonly string[]).includes(relPath);
}

/** The packs repository's real path, created when missing. */
export function packsRoot(): string {
  const { packsDir } = getStudioConfig();
  mkdirSync(packsDir, { recursive: true });
  return realpathSync(packsDir);
}

/**
 * Checks a pack-relative path lexically: POSIX separators, no absolute path,
 * no `.`/`..`/empty segment, no backslash or NUL. Returns its segments.
 */
export function splitRelativePath(relPath: string): string[] {
  if (typeof relPath !== "string" || relPath === "" || relPath.length > 1024) {
    throw new StudioError("invalidPath", 400);
  }
  if (relPath.startsWith("/") || relPath.includes("\\") || relPath.includes("\0")) {
    throw new StudioError("invalidPath", 400);
  }
  const segments = relPath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new StudioError("invalidPath", 400);
  }
  return segments;
}

function lstatOrNull(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
}

/**
 * Absolute path of `relPath` inside the pack, refusing every symbolic link on
 * the way: a link committed to the repository (or written by an agent) must
 * not let a route read or write outside `STUDIO_PACKS_DIR`. Missing segments
 * are fine (a file about to be created).
 */
export function resolvePackPath(packId: string, relPath?: string): string {
  const root = packsRoot();
  const segments = [assertPackId(packId), ...(relPath === undefined ? [] : splitRelativePath(relPath))];
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    const stats = lstatOrNull(current);
    if (!stats) break;
    if (stats.isSymbolicLink()) throw new StudioError("symlinkRefused", 403);
  }
  const target = join(root, ...segments);
  if (!isPathWithinRoots(target, new Set([root]))) throw new StudioError("invalidPath", 400);
  return target;
}

/** The path Git knows a pack file by: relative to the repository, POSIX separators. */
export function repoPath(packId: string, relPath?: string): string {
  return relPath ? posix.join(packId, relPath) : `${packId}/`;
}

/** The pack-relative part of a repository path, or null when it belongs to another pack. */
export function packRelative(packId: string, repoRelPath: string): string | null {
  const prefix = `${packId}/`;
  const normalized = repoRelPath.split(sep).join("/");
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : null;
}

export function skillDirRel(name: string): string {
  return `${SKILLS_DIR}/${name}`;
}

export function suiteFileRel(name: string): string {
  return `${TESTS_DIR}/${name}.md`;
}

export function runDirRel(runId: string): string {
  return `${RUNS_DIR}/${runId}`;
}

export function skillFileRel(name: string): string {
  return `${SKILLS_DIR}/${name}/SKILL.md`;
}
