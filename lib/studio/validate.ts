import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { DESCRIPTION_MAX_LENGTH, isSlug, SLUG_MAX_LENGTH, SLUG_PATTERN } from "./slug";
import type { ValidationIssue } from "./types";

// Skill rules of STUDIO.md (lot 1). They are stricter than Pi, never looser:
// the frontmatter is parsed by Pi's own parser, so a skill the Studio accepts
// is one Pi loads. Pi only warns on a bad name and does not compare it with
// the folder; the Studio blocks both, which keeps skills portable.

export { DESCRIPTION_MAX_LENGTH };

export interface SkillValidationInput {
  /** The skill's folder name. */
  dirName: string;
  raw: string;
  /** Whether a path relative to the skill folder names an existing file. */
  fileExists: (relPath: string) => boolean;
}

export interface ParsedSkill {
  frontmatter: Record<string, unknown> | null;
  body: string;
  /** 1-based line where the body starts in the file. */
  bodyLine: number;
}

function normalize(raw: string): string {
  return raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function errorLine(error: unknown): number | undefined {
  const linePos = (error as { linePos?: { line: number }[] } | undefined)?.linePos;
  const line = Array.isArray(linePos) ? linePos[0]?.line : undefined;
  // The YAML starts on the file's second line, after the opening `---`.
  return typeof line === "number" ? line + 1 : undefined;
}

/** Splits a SKILL.md as Pi does, reporting structural problems as issues. */
export function parseSkill(raw: string, issues: ValidationIssue[] = []): ParsedSkill {
  const text = normalize(raw);
  if (!text.startsWith("---")) {
    const later = /\n---[ \t]*\n/.exec(text);
    issues.push(later
      ? { severity: "error", code: "frontmatterNotFirst", line: lineOf(text, later.index + 1) }
      : { severity: "error", code: "frontmatterMissing", line: 1 });
    return { frontmatter: null, body: text, bodyLine: 1 };
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    issues.push({ severity: "error", code: "frontmatterUnclosed", line: 1 });
    return { frontmatter: null, body: text, bodyLine: 1 };
  }
  const afterClose = text.indexOf("\n", end + 4);
  const bodyStart = afterClose === -1 ? text.length : afterClose + 1;
  const bodyLine = lineOf(text, bodyStart);
  const body = text.slice(bodyStart);
  let frontmatter: unknown;
  try {
    frontmatter = parseFrontmatter<Record<string, unknown>>(text).frontmatter;
  } catch (error) {
    issues.push({ severity: "error", code: "yamlInvalid", line: errorLine(error) ?? 2 });
    return { frontmatter: null, body, bodyLine };
  }
  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    issues.push({ severity: "error", code: "yamlInvalid", line: 2 });
    return { frontmatter: null, body, bodyLine };
  }
  return { frontmatter: frontmatter as Record<string, unknown>, body, bodyLine };
}

/** Relative targets the body refers to: Markdown links and `references/…`-style paths. */
export function findRelativeReferences(body: string): { target: string; offset: number }[] {
  const found: { target: string; offset: number }[] = [];
  const link = /!?\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  for (let match = link.exec(body); match; match = link.exec(body)) {
    found.push({ target: match[1], offset: match.index });
  }
  const bare = /(?:^|[\s`'"(])((?:references|scripts|assets)\/[^\s`'")\]]+)/g;
  for (let match = bare.exec(body); match; match = bare.exec(body)) {
    const offset = match.index + match[0].indexOf(match[1]);
    if (!found.some((item) => item.offset <= offset && offset < item.offset + item.target.length + 4)) {
      found.push({ target: match[1], offset });
    }
  }
  return found.sort((a, b) => a.offset - b.offset);
}

function checkReference(target: string): { kind: "skip" } | { kind: "outside" } | { kind: "file"; path: string } {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#") || target.startsWith("//")) return { kind: "skip" };
  if (target.startsWith("/")) return { kind: "outside" };
  let path = target.split("#")[0].split("?")[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep as written
  }
  path = path.replace(/[.,;:]+$/, "");
  if (!path) return { kind: "skip" };
  const parts: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (!parts.length) return { kind: "outside" };
      parts.pop();
    } else parts.push(segment);
  }
  return parts.length ? { kind: "file", path: parts.join("/") } : { kind: "skip" };
}

export function validateSkill({ dirName, raw, fileExists }: SkillValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { frontmatter, body, bodyLine } = parseSkill(raw, issues);
  if (!frontmatter) return issues;

  const text = normalize(raw);
  const keyLine = (key: string) => {
    const match = new RegExp(`^${key}\\s*:`, "m").exec(text.slice(0, text.indexOf("\n---", 3)));
    return match ? lineOf(text, match.index) : 2;
  };

  const name = frontmatter.name;
  if (typeof name !== "string" || name.trim() === "") {
    issues.push({ severity: "error", code: "nameMissing", line: 2, params: { dir: dirName } });
  } else if (name.length > SLUG_MAX_LENGTH) {
    issues.push({ severity: "error", code: "nameTooLong", line: keyLine("name"), params: { length: name.length, max: SLUG_MAX_LENGTH } });
  } else if (!SLUG_PATTERN.test(name)) {
    issues.push({ severity: "error", code: "nameInvalid", line: keyLine("name"), params: { name } });
  } else if (name !== dirName) {
    issues.push({ severity: "error", code: "nameMismatch", line: keyLine("name"), params: { name, dir: dirName } });
  }

  const description = frontmatter.description;
  if (typeof description !== "string" || description.trim() === "") {
    issues.push({ severity: "error", code: "descriptionMissing", line: 2 });
  } else if (description.length > DESCRIPTION_MAX_LENGTH) {
    issues.push({
      severity: "error",
      code: "descriptionTooLong",
      line: keyLine("description"),
      params: { length: description.length, max: DESCRIPTION_MAX_LENGTH },
    });
  }

  const seen = new Set<string>();
  for (const { target, offset } of findRelativeReferences(body)) {
    const checked = checkReference(target);
    if (checked.kind === "skip" || seen.has(target)) continue;
    seen.add(target);
    const line = bodyLine + lineOf(body, offset) - 1;
    if (checked.kind === "outside") issues.push({ severity: "warning", code: "linkOutside", line, params: { target } });
    else if (!fileExists(checked.path)) issues.push({ severity: "warning", code: "linkMissing", line, params: { target } });
  }
  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

export function validatePackId(id: unknown): ValidationIssue[] {
  if (typeof id !== "string" || id === "") return [{ severity: "error", code: "packIdMissing" }];
  if (!isSlug(id)) return [{ severity: "error", code: "packIdInvalid", params: { id: String(id).slice(0, 80) } }];
  return [];
}
