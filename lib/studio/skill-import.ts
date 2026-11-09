import { StudioError } from "./errors";
import { removePackEntry, writePackBytesAtomic, writePackTextAtomic } from "./files";
import { type GitAuthor, withPacksLock } from "./git";
import { commitPackChange, readPackMeta } from "./packs";
import { assertPackId, assertSkillName, resolvePackPath, skillDirRel, skillFileRel, splitRelativePath } from "./paths";
import { composeSkill, readSkillFields, withSkillName } from "./skill-file";
import { assertNoErrors, assertSkillAbsent, readSkill } from "./skills";
import type { SkillDocument } from "./types";
import { validateSkill } from "./validate";

// Import of a whole skill folder (SKILL.md with its references/, scripts/,
// assets/…), chosen in the browser and sent as base64. Files are stored as
// they are and never run by the Studio (STUDIO.md §8: no automatic execution
// of imported scripts); the agent can run them only with a tool such as bash.

export const IMPORT_MAX_FILES = 300;
export const IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const IMPORT_MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const IMPORT_MAX_DEPTH = 12;
/** Left out of an import: system and tool leftovers, never part of a skill. */
const SKIPPED_NAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini", ".git", "__pycache__", "node_modules", ".venv", ".ipynb_checkpoints"]);
const SCRIPT_EXTENSIONS = /\.(sh|bash|zsh|py|js|mjs|cjs|ts|rb|pl|php|ps1|bat|cmd|exe)$/i;

export interface ImportedFileInput {
  /** As the browser gives it: `ma-skill/references/api.md` or `references/api.md`. */
  path: unknown;
  /** Base64. */
  content: unknown;
}

export interface FolderImportResult {
  skill: SkillDocument;
  /** Pack-folder-relative paths written, SKILL.md first. */
  files: string[];
  /** Files left out (system leftovers). */
  skipped: string[];
  /** Files that look like programs: stored, never run by the Studio. */
  scripts: string[];
}

function decode(value: unknown): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new StudioError("invalidRequest", 400);
  return Buffer.from(value, "base64");
}

/** The browser's paths, without the folder the person picked when every file is inside it. */
function relativePaths(paths: string[]): string[] {
  const split = paths.map((path) => path.replace(/\\/g, "/").replace(/^\/+/, "").split("/"));
  const first = split[0]?.[0];
  const wrapped = split.length > 0 && split.every((parts) => parts.length > 1 && parts[0] === first)
    && !split.some((parts) => parts.length === 1 && parts[0] === "SKILL.md");
  return split.map((parts) => (wrapped ? parts.slice(1) : parts).join("/"));
}

export async function importSkillFolder(
  packId: string,
  input: { files: unknown; name?: unknown },
  author: GitAuthor,
): Promise<FolderImportResult> {
  const id = assertPackId(packId);
  if (!Array.isArray(input.files) || input.files.length === 0) throw new StudioError("importEmpty", 400);
  if (input.files.length > IMPORT_MAX_FILES * 2) throw new StudioError("importTooManyFiles", 413, { max: IMPORT_MAX_FILES });
  const entries = (input.files as ImportedFileInput[]).map((file) => {
    if (typeof file?.path !== "string" || !file.path) throw new StudioError("invalidRequest", 400);
    return { path: file.path, content: file.content };
  });
  const paths = relativePaths(entries.map((entry) => entry.path));

  const files = new Map<string, Buffer>();
  const skipped: string[] = [];
  let total = 0;
  entries.forEach((entry, index) => {
    const rel = paths[index];
    const parts = rel.split("/");
    if (parts.some((part) => SKIPPED_NAMES.has(part)) || parts[parts.length - 1].startsWith("._")) {
      skipped.push(rel);
      return;
    }
    try {
      splitRelativePath(rel);
    } catch {
      throw new StudioError("importBadPath", 400, { path: rel.slice(0, 200) });
    }
    if (parts.length > IMPORT_MAX_DEPTH) throw new StudioError("importBadPath", 400, { path: rel.slice(0, 200) });
    if (files.has(rel)) throw new StudioError("importBadPath", 400, { path: rel.slice(0, 200) });
    const content = decode(entry.content);
    if (content.length > IMPORT_MAX_FILE_BYTES) throw new StudioError("importFileTooLarge", 413, { path: rel, max: IMPORT_MAX_FILE_BYTES / (1024 * 1024) });
    total += content.length;
    files.set(rel, content);
  });
  if (files.size > IMPORT_MAX_FILES) throw new StudioError("importTooManyFiles", 413, { max: IMPORT_MAX_FILES });
  if (total > IMPORT_MAX_TOTAL_BYTES) throw new StudioError("importTooLarge", 413, { max: IMPORT_MAX_TOTAL_BYTES / (1024 * 1024) });
  const skillFile = files.get("SKILL.md");
  if (!skillFile) throw new StudioError("importNoSkillFile", 400);

  const original = skillFile.toString("utf8");
  if (!original.trim()) throw new StudioError("importEmpty", 400);
  const fields = readSkillFields(original);
  const chosen = typeof input.name === "string" && input.name.trim() ? input.name.trim() : fields.declaredName;
  if (!chosen) throw new StudioError("importNameMissing", 400);
  const name = assertSkillName(chosen);
  const raw = fields.declaredName ? withSkillName(original, name) : composeSkill({ name, description: fields.description, body: fields.body }, original);
  const others = [...files.keys()].filter((rel) => rel !== "SKILL.md").sort();
  const known = new Set(others.flatMap((rel) => {
    const parts = rel.split("/");
    return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
  }));

  return withPacksLock(async () => {
    readPackMeta(id);
    assertSkillAbsent(id, name);
    assertNoErrors(validateSkill({ dirName: name, raw, fileExists: (rel) => known.has(rel.replace(/\/+$/, "")) }));
    const dir = resolvePackPath(id, skillDirRel(name));
    try {
      writePackTextAtomic(resolvePackPath(id, skillFileRel(name)), raw);
      for (const rel of others) writePackBytesAtomic(resolvePackPath(id, `${skillDirRel(name)}/${rel}`), files.get(rel)!, IMPORT_MAX_FILE_BYTES);
    } catch (error) {
      // Nothing half-imported is left behind.
      removePackEntry(dir);
      throw error;
    }
    await commitPackChange(id, [skillDirRel(name)], { kind: "import-skill", name }, author);
    return {
      skill: readSkill(id, name),
      files: [skillFileRel(name), ...others.map((rel) => `${skillDirRel(name)}/${rel}`)],
      skipped,
      scripts: others.filter((rel) => rel.startsWith("scripts/") || SCRIPT_EXTENSIONS.test(rel)),
    };
  });
}
