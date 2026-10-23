import { existsSync, readdirSync, renameSync } from "node:fs";
import { StudioError } from "../errors";
import { contentHash, readPackText, removePackEntry, writePackTextAtomic } from "../files";
import { type GitAuthor, withPacksLock } from "../git";
import { commitPackChange, readPackMeta } from "../packs";
import { assertPackId, isSlug, resolvePackPath, suiteFileRel, TESTS_DIR } from "../paths";
import { listSkillNames } from "../skills";
import { fillTemplate, readTemplate } from "../templates";
import type { ValidationIssue } from "../types";
import { hasErrors } from "../validate";
import { parseSuite, serializeSuite, type SuiteCase, type SuiteMeta } from "./parse";

export const SUITE_TEMPLATE = "tests/suite.md";

export interface SuiteSummary {
  name: string;
  titre: string;
  skill?: string;
  caseCount: number;
  issues: ValidationIssue[];
}

export interface SuiteDocument extends SuiteSummary {
  raw: string;
  hash: string;
  meta: SuiteMeta;
  cases: SuiteCase[];
}

export function assertSuiteName(value: unknown): string {
  if (!isSlug(value)) throw new StudioError("invalidSuiteName", 400);
  return value;
}

/** Suite files of the pack: `tests/<name>.md` with a valid name; links are skipped. */
export function listSuiteNames(packId: string): string[] {
  let entries;
  try {
    entries = readdirSync(resolvePackPath(packId, TESTS_DIR), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && isSlug(entry.name.slice(0, -3)))
    .map((entry) => entry.name.slice(0, -3))
    .sort((a, b) => a.localeCompare(b));
}

function readRaw(packId: string, name: string): string | undefined {
  return readPackText(resolvePackPath(packId, suiteFileRel(name)));
}

/**
 * A suite's problems, the pack's other suites included: a case id must be
 * unique in the whole pack (its transcript is `cases/<id>.md`), and the skill
 * the header names should exist.
 */
export function validateSuiteInPack(packId: string, name: string, raw: string): { parsed: ReturnType<typeof parseSuite>; issues: ValidationIssue[] } {
  const parsed = parseSuite(raw);
  const issues = [...parsed.issues];
  const owners = new Map<string, string>();
  for (const other of listSuiteNames(packId)) {
    if (other === name) continue;
    for (const item of parseSuite(readRaw(packId, other) ?? "").cases) owners.set(item.id, other);
  }
  for (const item of parsed.cases) {
    const other = owners.get(item.id);
    if (other) issues.push({ severity: "error", code: "suiteIdTaken", line: item.line, params: { id: item.id, suite: other } });
  }
  if (parsed.meta.skill && !listSkillNames(packId).includes(parsed.meta.skill)) {
    issues.push({ severity: "warning", code: "suiteSkillUnknown", line: 2, params: { skill: parsed.meta.skill } });
  }
  return { parsed, issues: issues.sort((a, b) => (a.line ?? 0) - (b.line ?? 0)) };
}

export function listSuites(packId: string): SuiteSummary[] {
  const id = assertPackId(packId);
  readPackMeta(id);
  return listSuiteNames(id).map((name) => {
    const { parsed, issues } = validateSuiteInPack(id, name, readRaw(id, name) ?? "");
    return { name, titre: parsed.meta.titre ?? name, skill: parsed.meta.skill, caseCount: parsed.cases.length, issues };
  });
}

export function readSuite(packId: string, suiteName: string): SuiteDocument {
  const id = assertPackId(packId);
  const name = assertSuiteName(suiteName);
  const raw = readRaw(id, name);
  if (raw === undefined) throw new StudioError("suiteNotFound", 404, { name });
  const { parsed, issues } = validateSuiteInPack(id, name, raw);
  return {
    name,
    titre: parsed.meta.titre ?? name,
    skill: parsed.meta.skill,
    caseCount: parsed.cases.length,
    issues,
    raw,
    hash: contentHash(raw),
    meta: parsed.meta,
    cases: parsed.cases,
  };
}

function assertNoErrors(issues: ValidationIssue[]): void {
  if (hasErrors(issues)) throw new StudioError("validationFailed", 422, undefined, issues);
}

/** "recherche-bibliographique" → "RB": the id prefix the template proposes. */
export function casePrefix(name: string): string {
  return name.split("-").map((part) => part.charAt(0)).join("").toUpperCase().slice(0, 4) || "CAS";
}

export async function createSuite(packId: string, input: { name: unknown; titre?: unknown }, author: GitAuthor): Promise<SuiteDocument> {
  const id = assertPackId(packId);
  const name = assertSuiteName(input.name);
  const titre = typeof input.titre === "string" && input.titre.trim() ? input.titre.trim().slice(0, 200) : name;
  return withPacksLock(async () => {
    readPackMeta(id);
    const path = resolvePackPath(id, suiteFileRel(name));
    if (existsSync(path)) throw new StudioError("suiteExists", 409, { name });
    // The template's rows, under a title written as YAML (never substituted
    // into the header) and ids prefixed so they are free in the pack: RB, RB2…
    const base = casePrefix(name);
    let raw = "";
    for (let n = 1; n <= 50; n++) {
      const rows = parseSuite(fillTemplate(readTemplate(SUITE_TEMPLATE), { titre: "x", prefix: n === 1 ? base : `${base}${n}` })).cases;
      raw = serializeSuite({ titre }, rows);
      if (!hasErrors(validateSuiteInPack(id, name, raw).issues)) break;
    }
    assertNoErrors(validateSuiteInPack(id, name, raw).issues);
    writePackTextAtomic(path, raw);
    await commitPackChange(id, [suiteFileRel(name)], { kind: "create-suite", name }, author);
    return readSuite(id, name);
  });
}

export type SuiteSaveInput =
  | { mode: "table"; meta: unknown; cases: unknown }
  | { mode: "raw"; raw: unknown };

function tableInput(meta: unknown, cases: unknown): string {
  if (!Array.isArray(cases)) throw new StudioError("invalidRequest", 400);
  const record = meta && typeof meta === "object" ? meta as Record<string, unknown> : {};
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return serializeSuite(
    { titre: text(record.titre), skill: text(record.skill) },
    cases.map((item) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return { id: text(row.id).trim(), requete: text(row.requete), attendu: text(row.attendu), sources: text(row.sources) };
    }),
  );
}

/** Saves the table view (rewritten in the spec's layout) or the raw file; errors block, warnings do not. */
export async function saveSuite(
  packId: string,
  suiteName: string,
  input: SuiteSaveInput,
  baseHash: unknown,
  author: GitAuthor,
  note?: unknown,
): Promise<SuiteDocument> {
  const id = assertPackId(packId);
  const name = assertSuiteName(suiteName);
  return withPacksLock(async () => {
    const path = resolvePackPath(id, suiteFileRel(name));
    const current = readPackText(path);
    if (current === undefined) throw new StudioError("suiteNotFound", 404, { name });
    if (typeof baseHash !== "string" || baseHash !== contentHash(current)) throw new StudioError("conflict", 409);
    let raw: string;
    if (input.mode === "raw") {
      if (typeof input.raw !== "string") throw new StudioError("invalidRequest", 400);
      raw = input.raw;
    } else {
      raw = tableInput(input.meta, input.cases);
    }
    assertNoErrors(validateSuiteInPack(id, name, raw).issues);
    if (raw !== current) {
      writePackTextAtomic(path, raw);
      await commitPackChange(id, [suiteFileRel(name)], { kind: "edit-suite", name }, author, note);
    }
    return readSuite(id, name);
  });
}

export async function renameSuite(packId: string, from: unknown, to: unknown, author: GitAuthor): Promise<SuiteDocument> {
  const id = assertPackId(packId);
  const oldName = assertSuiteName(from);
  const newName = assertSuiteName(to);
  if (oldName === newName) return readSuite(id, oldName);
  return withPacksLock(async () => {
    const oldPath = resolvePackPath(id, suiteFileRel(oldName));
    if (!existsSync(oldPath)) throw new StudioError("suiteNotFound", 404, { name: oldName });
    const newPath = resolvePackPath(id, suiteFileRel(newName));
    if (existsSync(newPath)) throw new StudioError("suiteExists", 409, { name: newName });
    renameSync(oldPath, newPath);
    await commitPackChange(id, [suiteFileRel(oldName), suiteFileRel(newName)], { kind: "rename-suite", from: oldName, to: newName }, author);
    return readSuite(id, newName);
  });
}

export async function deleteSuite(packId: string, suiteName: unknown, author: GitAuthor): Promise<void> {
  const id = assertPackId(packId);
  const name = assertSuiteName(suiteName);
  await withPacksLock(async () => {
    const path = resolvePackPath(id, suiteFileRel(name));
    if (!existsSync(path)) throw new StudioError("suiteNotFound", 404, { name });
    removePackEntry(path);
    await commitPackChange(id, [suiteFileRel(name)], { kind: "delete-suite", name }, author);
  });
}
