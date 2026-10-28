import { existsSync, lstatSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { StudioError } from "./errors";
import { contentHash, listFilesRecursive, readPackText, removePackEntry, writePackTextAtomic } from "./files";
import { type GitAuthor, withPacksLock } from "./git";
import { commitPackChange, readPackMeta } from "./packs";
import { assertPackId, assertSkillName, isSlug, resolvePackPath, SKILLS_DIR, skillDirRel, skillFileRel } from "./paths";
import { composeSkill, readSkillFields, withSkillName } from "./skill-file";
import { renderSkillTemplate } from "./templates";
import type { SkillDocument, SkillSummary, ValidationIssue } from "./types";
import { hasErrors, validateSkill } from "./validate";

function fileExistsIn(skillDir: string): (relPath: string) => boolean {
  return (relPath) => {
    try {
      const stats = lstatSync(join(skillDir, relPath));
      return stats.isFile() || stats.isDirectory();
    } catch {
      return false;
    }
  };
}

export function validateSkillFile(packId: string, name: string, raw: string): ValidationIssue[] {
  return validateSkill({ dirName: name, raw, fileExists: fileExistsIn(resolvePackPath(packId, skillDirRel(name))) });
}

/** Skill folders of the pack (`.pi/skills/<name>/SKILL.md`), links skipped. */
export function listSkillNames(packId: string): string[] {
  const dir = resolvePackPath(packId, SKILLS_DIR);
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export function listSkills(packId: string): SkillSummary[] {
  const id = assertPackId(packId);
  readPackMeta(id);
  return listSkillNames(id).map((name) => {
    let raw = "";
    let issues: ValidationIssue[];
    try {
      raw = readPackText(resolvePackPath(id, skillFileRel(name))) ?? "";
      issues = isSlug(name) ? validateSkillFile(id, name, raw) : [{ severity: "error", code: "folderInvalid", params: { dir: name } }];
    } catch (error) {
      issues = [{ severity: "error", code: error instanceof StudioError ? error.code : "unreadable" }];
    }
    return { name, description: readSkillFields(raw).description, issues };
  });
}

export function readSkill(packId: string, skillName: string): SkillDocument {
  const id = assertPackId(packId);
  const name = assertSkillName(skillName);
  const raw = readPackText(resolvePackPath(id, skillFileRel(name)));
  if (raw === undefined) throw new StudioError("skillNotFound", 404, { name });
  const fields = readSkillFields(raw);
  return {
    name,
    declaredName: fields.declaredName,
    description: fields.description,
    body: fields.body,
    raw,
    hash: contentHash(raw),
    issues: validateSkillFile(id, name, raw),
  };
}

export function assertNoErrors(issues: ValidationIssue[]): void {
  if (hasErrors(issues)) throw new StudioError("validationFailed", 422, undefined, issues);
}

export type SkillSaveInput =
  | { mode: "form"; description: unknown; body: unknown }
  | { mode: "raw"; raw: unknown };

/**
 * Saves a skill from the form (name kept, description and body replaced) or
 * from the raw file (advanced mode). Errors block the save; warnings do not.
 * `baseHash` is the content the editor loaded: a file changed since answers
 * 409 instead of overwriting someone else's version.
 */
export async function saveSkill(
  packId: string,
  skillName: string,
  input: SkillSaveInput,
  baseHash: unknown,
  author: GitAuthor,
  note?: unknown,
): Promise<{ hash: string; issues: ValidationIssue[] }> {
  const id = assertPackId(packId);
  const name = assertSkillName(skillName);
  return withPacksLock(async () => {
    const path = resolvePackPath(id, skillFileRel(name));
    const current = readPackText(path);
    if (current === undefined) throw new StudioError("skillNotFound", 404, { name });
    if (typeof baseHash !== "string" || baseHash !== contentHash(current)) throw new StudioError("conflict", 409);
    let raw: string;
    if (input.mode === "raw") {
      if (typeof input.raw !== "string") throw new StudioError("invalidRequest", 400);
      raw = input.raw;
    } else {
      if (typeof input.description !== "string" || typeof input.body !== "string") throw new StudioError("invalidRequest", 400);
      raw = composeSkill({ name, description: input.description.trim(), body: input.body }, current);
    }
    const issues = validateSkillFile(id, name, raw);
    assertNoErrors(issues);
    if (raw !== current) {
      writePackTextAtomic(path, raw);
      await commitPackChange(id, [skillFileRel(name)], { kind: "edit-skill", name }, author, note);
    }
    return { hash: contentHash(raw), issues };
  });
}

export function assertSkillAbsent(packId: string, name: string): void {
  if (existsSync(resolvePackPath(packId, skillDirRel(name)))) throw new StudioError("skillExists", 409, { name });
}

export async function createSkill(
  packId: string,
  input: { name: unknown; description: unknown },
  author: GitAuthor,
): Promise<SkillDocument> {
  const id = assertPackId(packId);
  const name = assertSkillName(input.name);
  const description = typeof input.description === "string" ? input.description.trim() : "";
  return withPacksLock(async () => {
    readPackMeta(id);
    assertSkillAbsent(id, name);
    const raw = renderSkillTemplate({ name, description });
    assertNoErrors(validateSkillFile(id, name, raw));
    writePackTextAtomic(resolvePackPath(id, skillFileRel(name)), raw);
    await commitPackChange(id, [skillDirRel(name)], { kind: "create-skill", name }, author);
    return readSkill(id, name);
  });
}

/**
 * Imports a pasted or uploaded SKILL.md. Its folder is the name chosen in the
 * dialog, or the file's own `name`; the file's `name` is set to match. Nothing
 * else is imported (no `scripts/`), and nothing in it is ever run.
 */
export async function importSkill(
  packId: string,
  input: { raw: unknown; name?: unknown },
  author: GitAuthor,
): Promise<SkillDocument> {
  const id = assertPackId(packId);
  if (typeof input.raw !== "string" || !input.raw.trim()) throw new StudioError("importEmpty", 400);
  const fields = readSkillFields(input.raw);
  const chosen = typeof input.name === "string" && input.name.trim() ? input.name.trim() : fields.declaredName;
  if (!chosen) throw new StudioError("importNameMissing", 400);
  const name = assertSkillName(chosen);
  const raw = fields.declaredName ? withSkillName(input.raw, name) : composeSkill({ name, description: fields.description, body: fields.body }, input.raw);
  return withPacksLock(async () => {
    readPackMeta(id);
    assertSkillAbsent(id, name);
    assertNoErrors(validateSkill({ dirName: name, raw, fileExists: () => false }));
    writePackTextAtomic(resolvePackPath(id, skillFileRel(name)), raw);
    await commitPackChange(id, [skillDirRel(name)], { kind: "import-skill", name }, author);
    return readSkill(id, name);
  });
}

/** Moves the folder and sets the file's `name`, in one version. */
export async function renameSkill(packId: string, from: unknown, to: unknown, author: GitAuthor): Promise<SkillDocument> {
  const id = assertPackId(packId);
  const oldName = assertSkillName(from);
  const newName = assertSkillName(to);
  if (oldName === newName) return readSkill(id, oldName);
  return withPacksLock(async () => {
    const oldDir = resolvePackPath(id, skillDirRel(oldName));
    if (!existsSync(oldDir)) throw new StudioError("skillNotFound", 404, { name: oldName });
    assertSkillAbsent(id, newName);
    const newDir = resolvePackPath(id, skillDirRel(newName));
    renameSync(oldDir, newDir);
    const file = resolvePackPath(id, skillFileRel(newName));
    const raw = readPackText(file);
    if (raw !== undefined) writePackTextAtomic(file, withSkillName(raw, newName));
    await commitPackChange(id, [skillDirRel(oldName), skillDirRel(newName)], { kind: "rename-skill", from: oldName, to: newName }, author);
    return readSkill(id, newName);
  });
}

export async function deleteSkill(packId: string, skillName: unknown, author: GitAuthor): Promise<void> {
  const id = assertPackId(packId);
  const name = assertSkillName(skillName);
  await withPacksLock(async () => {
    const dir = resolvePackPath(id, skillDirRel(name));
    if (!existsSync(dir)) throw new StudioError("skillNotFound", 404, { name });
    removePackEntry(dir);
    await commitPackChange(id, [skillDirRel(name)], { kind: "delete-skill", name }, author);
  });
}

/** Files of a skill folder, relative to it (shown in the skill's details). */
export function skillFiles(packId: string, skillName: string): string[] {
  return listFilesRecursive(resolvePackPath(assertPackId(packId), skillDirRel(assertSkillName(skillName))));
}
