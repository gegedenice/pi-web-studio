import { existsSync } from "node:fs";
import { StudioError } from "./errors";
import { contentHash, readPackText, removePackEntry, writePackTextAtomic } from "./files";
import { assertRevision, git, type GitAuthor, listTree, log, showFile, withPacksLock } from "./git";
import { commitPackChange, externalChanges, readPackMeta } from "./packs";
import {
  assertPackId,
  assertSkillName,
  isEditablePackFile,
  packRelative,
  repoPath,
  resolvePackPath,
  SETTINGS_FILE,
  skillDirRel,
  skillFileRel,
  splitRelativePath,
} from "./paths";
import { withSkillName } from "./skill-file";
import { validateSkillFile } from "./skills";
import type { DeletedSkill, ExternalChange, HistoryEntry, TextDocument } from "./types";
import { hasErrors } from "./validate";

const SKILL_FILE_PATTERN = /^\.pi\/skills\/([^/]+)\/SKILL\.md$/;
const SUITE_FILE_PATTERN = /^tests\/([^/]+)\.md$/;

/** Files the Studio versions one by one: the editable pack files and each SKILL.md. */
function assertVersionedFile(relPath: string): string {
  splitRelativePath(relPath);
  const skill = SKILL_FILE_PATTERN.exec(relPath);
  if (skill) {
    assertSkillName(skill[1]);
    return relPath;
  }
  const suite = SUITE_FILE_PATTERN.exec(relPath);
  if (suite) {
    assertSkillName(suite[1]);
    return relPath;
  }
  if (!isEditablePackFile(relPath)) throw new StudioError("fileNotEditable", 403);
  return relPath;
}

/** Files edited through their own screen (skills, suites), never through the generic file route. */
function hasOwnEditor(relPath: string): boolean {
  return SKILL_FILE_PATTERN.test(relPath) || SUITE_FILE_PATTERN.test(relPath);
}

export function readEditableFile(packId: string, relPath: string): TextDocument {
  const id = assertPackId(packId);
  const rel = assertVersionedFile(relPath);
  if (hasOwnEditor(rel)) throw new StudioError("fileNotEditable", 403);
  readPackMeta(id);
  const content = readPackText(resolvePackPath(id, rel));
  return { path: rel, content: content ?? "", hash: content === undefined ? "" : contentHash(content), exists: content !== undefined };
}

/** AGENTS.md, the system prompt files and (advanced mode) `.pi/settings.json`. */
export async function writeEditableFile(
  packId: string,
  relPath: string,
  content: unknown,
  baseHash: unknown,
  author: GitAuthor,
  note?: unknown,
): Promise<TextDocument> {
  const id = assertPackId(packId);
  const rel = assertVersionedFile(relPath);
  if (hasOwnEditor(rel)) throw new StudioError("fileNotEditable", 403);
  if (typeof content !== "string") throw new StudioError("invalidRequest", 400);
  if (rel === SETTINGS_FILE) {
    try {
      const parsed: unknown = JSON.parse(content);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    } catch {
      throw new StudioError("settingsInvalid", 422);
    }
  }
  return withPacksLock(async () => {
    readPackMeta(id);
    const path = resolvePackPath(id, rel);
    const current = readPackText(path);
    const currentHash = current === undefined ? "" : contentHash(current);
    if (baseHash !== currentHash) throw new StudioError("conflict", 409);
    if (content !== current) {
      writePackTextAtomic(path, content);
      await commitPackChange(id, [rel], { kind: "edit-file", path: rel }, author, note);
    }
    return { path: rel, content, hash: contentHash(content), exists: true };
  });
}

/** Versions of one file, newest first, following renames (a renamed skill keeps its past). */
export async function fileHistory(packId: string, relPath: string): Promise<HistoryEntry[]> {
  const id = assertPackId(packId);
  const rel = assertVersionedFile(relPath);
  const entries = await log(repoPath(id, rel), { follow: true });
  return entries.map((entry) => {
    const changed = entry.changes[0];
    const path = changed ? packRelative(id, changed.path) ?? rel : rel;
    return { rev: entry.rev, author: entry.author, date: entry.date, message: entry.subject, path };
  });
}

async function findVersion(packId: string, relPath: string, rev: string): Promise<HistoryEntry> {
  const entry = (await fileHistory(packId, relPath)).find((item) => item.rev.startsWith(rev));
  if (!entry) throw new StudioError("versionNotFound", 404);
  return entry;
}

/** A file's content at one of its versions (preview before restoring). */
export async function fileAtVersion(packId: string, relPath: string, revInput: unknown): Promise<{ content: string; deleted: boolean }> {
  const id = assertPackId(packId);
  const rev = assertRevision(revInput);
  const entry = await findVersion(id, relPath, rev);
  const content = await showFile(entry.rev, repoPath(id, entry.path ?? relPath));
  return { content: content ?? "", deleted: content === undefined };
}

/**
 * Puts a file back as it was at one of its versions, as a new version: history
 * is never rewritten. A SKILL.md from before a rename gets the current name.
 */
export async function restoreFile(packId: string, relPath: string, revInput: unknown, author: GitAuthor): Promise<TextDocument> {
  const id = assertPackId(packId);
  const rel = assertVersionedFile(relPath);
  const rev = assertRevision(revInput);
  return withPacksLock(async () => {
    const entry = await findVersion(id, rel, rev);
    let content = await showFile(entry.rev, repoPath(id, entry.path ?? rel));
    if (content === undefined) throw new StudioError("versionIsDeletion", 409);
    const skill = SKILL_FILE_PATTERN.exec(rel);
    if (skill) {
      content = withSkillName(content, skill[1]);
      const issues = validateSkillFile(id, skill[1], content);
      if (hasErrors(issues)) throw new StudioError("validationFailed", 422, undefined, issues);
    }
    writePackTextAtomic(resolvePackPath(id, rel), content);
    await commitPackChange(id, [rel], { kind: "restore-file", path: rel, date: entry.date }, author);
    return { path: rel, content, hash: contentHash(content), exists: true };
  });
}

/** Every version of the pack, newest first, with the files each one changed. */
export async function packHistory(packId: string): Promise<HistoryEntry[]> {
  const id = assertPackId(packId);
  readPackMeta(id);
  const entries = await log(repoPath(id), { limit: 300 });
  return entries.map((entry) => ({
    rev: entry.rev,
    author: entry.author,
    date: entry.date,
    message: entry.subject,
    changes: entry.changes.flatMap((change) => {
      const path = packRelative(id, change.path);
      if (path === null) return [];
      const previousPath = change.previousPath ? packRelative(id, change.previousPath) ?? undefined : undefined;
      return [{ status: change.status, path, ...(previousPath ? { previousPath } : {}) }];
    }),
  }));
}

/** Skills deleted from the pack and not back since: the latest deletion of each. */
export async function deletedSkills(packId: string): Promise<DeletedSkill[]> {
  const id = assertPackId(packId);
  const found = new Map<string, DeletedSkill>();
  for (const entry of await packHistory(id)) {
    for (const change of entry.changes ?? []) {
      // A rename is not a deletion: the skill lives on under its new name.
      const deletedPath = change.status === "D" ? change.path : undefined;
      const match = deletedPath ? SKILL_FILE_PATTERN.exec(deletedPath) : null;
      if (!match || found.has(match[1])) continue;
      if (existsSync(resolvePackPath(id, skillDirRel(match[1])))) continue;
      found.set(match[1], { name: match[1], rev: entry.rev, date: entry.date, author: entry.author });
    }
  }
  return [...found.values()];
}

/** Brings a deleted skill back, every file of its folder, from the version before its deletion. */
export async function restoreDeletedSkill(packId: string, skillName: unknown, revInput: unknown, author: GitAuthor): Promise<void> {
  const id = assertPackId(packId);
  const name = assertSkillName(skillName);
  const rev = assertRevision(revInput);
  await withPacksLock(async () => {
    const deletion = (await deletedSkills(id)).find((item) => item.name === name && item.rev.startsWith(rev));
    if (!deletion) throw new StudioError("versionNotFound", 404);
    if (existsSync(resolvePackPath(id, skillDirRel(name)))) throw new StudioError("skillExists", 409, { name });
    const before = `${deletion.rev}~1`;
    const files = await listTree(before, repoPath(id, skillDirRel(name)));
    if (!files.length) throw new StudioError("versionNotFound", 404);
    for (const file of files) {
      const rel = packRelative(id, file);
      const content = rel === null ? undefined : await showFile(before, file);
      if (rel === null || content === undefined) continue;
      writePackTextAtomic(resolvePackPath(id, rel), rel === skillFileRel(name) ? withSkillName(content, name) : content);
    }
    await commitPackChange(id, [skillDirRel(name)], { kind: "restore-skill", name, date: deletion.date }, author);
  });
}

/** « Conserver » : saves every change made outside the Studio as one version. */
export async function keepExternalChanges(packId: string, author: GitAuthor): Promise<void> {
  const id = assertPackId(packId);
  await withPacksLock(async () => {
    const changes = await externalChanges(id);
    if (!changes.length) return;
    await commitPackChange(id, changes.map((change) => change.path), { kind: "keep-external", paths: changes.map((change) => change.path) }, author);
  });
}

/**
 * « Annuler » : puts every changed file back as last saved (and removes the
 * files added outside the Studio). The files then match the last version, so
 * the version recorded is empty: it keeps track of what was discarded.
 */
export async function discardExternalChanges(packId: string, author: GitAuthor): Promise<ExternalChange[]> {
  const id = assertPackId(packId);
  return withPacksLock(async () => {
    const changes = await externalChanges(id);
    if (!changes.length) return changes;
    for (const change of changes) {
      const tracked = (await git(["ls-tree", "--name-only", "HEAD", "--", repoPath(id, change.path)])).trim() !== "";
      if (tracked) await git(["checkout", "HEAD", "--", repoPath(id, change.path)]);
      else removePackEntry(resolvePackPath(id, change.path));
    }
    await commitPackChange(
      id,
      changes.map((change) => change.path),
      { kind: "discard-external", paths: changes.map((change) => change.path) },
      author,
      undefined,
      { allowEmpty: true },
    );
    return changes;
  });
}
