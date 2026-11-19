import { StudioError } from "../errors";
import { readPackText, writePackTextAtomic } from "../files";
import { createTag, type GitAuthor, listTags, tagExists, withPacksLock } from "../git";
import { commitPackChange, externalChanges, readPackMeta, serializePackMeta } from "../packs";
import { assertPackId, PACK_META_FILE, resolvePackPath } from "../paths";
import type { McpInspector } from "../mcp/inspect";
import { type PackValidation, validatePack } from "./validate";

// "Publier une version" (STUDIO.md lot 4): the next version in pack.json, the
// status `valide` when every check is green, one commit, then the annotated tag
// `<pack>/v<version>` whose message is the note. Never pushed.

export const NOTE_MAX_LENGTH = 2000;

export interface PublishedVersion {
  version: string;
  tag: string;
  date: string;
  author: string;
  note: string;
  rev: string;
}

export type VersionStep = "minor" | "major";

export function tagName(packId: string, version: string): string {
  return `${packId}/v${version}`;
}

/** `0.4` → `0.5` (minor), `0.9` → `0.10`, `0.4` → `1.0` (major). */
export function bumpVersion(version: string, step: VersionStep): string {
  const parts = version.split(".").map((part) => Number(part));
  if (step === "major") return `${parts[0] + 1}.0`;
  if (parts.length === 1) parts.push(0);
  parts[parts.length - 1] += 1;
  return parts.join(".");
}

/** Newest version first: `1.0` before `0.10` before `0.9`. */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (right[index] ?? 0) - (left[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

export async function listPublishedVersions(packId: string): Promise<PublishedVersion[]> {
  const id = assertPackId(packId);
  readPackMeta(id);
  const prefix = `${id}/v`;
  return (await listTags(`refs/tags/${id}/v*`))
    .filter((tag) => tag.name.startsWith(prefix) && /^\d+(\.\d+){0,2}$/.test(tag.name.slice(prefix.length)))
    .map((tag) => ({ version: tag.name.slice(prefix.length), tag: tag.name, date: tag.date, author: tag.tagger, note: tag.message, rev: tag.rev }))
    .sort((a, b) => compareVersions(a.version, b.version));
}

/**
 * The version a publication would get (Q-L4-3): the current one if it was never
 * published, else the next; `major` always moves to the next major version.
 */
export async function nextVersion(packId: string, step: VersionStep = "minor"): Promise<string> {
  const id = assertPackId(packId);
  const current = readPackMeta(id).version;
  if (step === "major") return bumpVersion(current, "major");
  return (await tagExists(tagName(id, current))) ? bumpVersion(current, "minor") : current;
}

export interface PublishInput {
  note: unknown;
  step?: unknown;
  /** The person ticked "Publier malgré les avertissements" (Q-L4-2). */
  acceptWarnings?: unknown;
}

export interface PublishOutcome {
  version: PublishedVersion;
  validation: PackValidation;
  /** The status became `valide` (every check green). */
  validated: boolean;
}

export async function publishVersion(packId: string, input: PublishInput, author: GitAuthor & { id?: string }, inspector?: McpInspector): Promise<PublishOutcome> {
  const id = assertPackId(packId);
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (!note) throw new StudioError("noteMissing", 400);
  if (note.length > NOTE_MAX_LENGTH) throw new StudioError("noteTooLong", 400, { max: NOTE_MAX_LENGTH });
  const step: VersionStep = input.step === "major" ? "major" : "minor";
  // What is published is what the Studio saved (Q-L4-5).
  if ((await externalChanges(id)).length) throw new StudioError("publishExternalChanges", 409);
  const validation = await validatePack(id, inspector);
  if (validation.level === "error") throw new StudioError("publishBlocked", 422);
  if (validation.level === "warning" && input.acceptWarnings !== true) throw new StudioError("publishWarnings", 409);

  return withPacksLock(async () => {
    const meta = readPackMeta(id);
    const version = await nextVersion(id, step);
    const tag = tagName(id, version);
    if (await tagExists(tag)) throw new StudioError("versionExists", 409, { version });
    const validated = validation.level === "ok";
    const next = { ...meta, version, ...(validated ? { status: "valide" as const } : {}) };
    const path = resolvePackPath(id, PACK_META_FILE);
    if (serializePackMeta(next) !== readPackText(path)) writePackTextAtomic(path, serializePackMeta(next));
    const rev = await commitPackChange(id, [PACK_META_FILE], { kind: "publish", version }, author, undefined, { allowEmpty: true });
    if (!rev) throw new StudioError("unexpected", 500);
    await createTag(tag, rev, note, author);
    const [published] = (await listPublishedVersions(id)).filter((item) => item.tag === tag);
    return { version: published, validation, validated };
  });
}
