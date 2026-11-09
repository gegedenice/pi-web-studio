import { dump, load } from "js-yaml";
import type { ValidationIssue } from "../types";

// Test suites (STUDIO.md §2.3): an optional header, then one Markdown table.
// Columns are recognised by their heading, ignoring case, accents and spaces;
// `id` is required and unique in the pack, blank lines are skipped. Problems
// come back as issues with their line, never as exceptions.

export interface SuiteMeta {
  titre?: string;
  skill?: string;
}

export interface SuiteCase {
  id: string;
  requete: string;
  attendu: string;
  sources: string;
  /** 1-based line of the row in the file. */
  line: number;
}

export interface ParsedSuite {
  meta: SuiteMeta;
  cases: SuiteCase[];
  issues: ValidationIssue[];
}

/** Case ids name transcript files (`cases/<id>.md`): letters, digits, `-`, `_`, `.`. */
export const CASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

type Column = "id" | "requete" | "attendu" | "sources";

export function normalizeHeading(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const HEADINGS: Record<string, Column> = {
  "id": "id",
  "identifiant": "id",
  "requete": "requete",
  "question": "requete",
  "attendu": "attendu",
  "resultat attendu": "attendu",
  "reponse attendue": "attendu",
  "sources attendues": "sources",
  "sources": "sources",
};

/** Splits a table row on unescaped `|`, without the outer pipes; `\|` becomes `|`. */
export function splitRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\\" && text[i + 1] === "|") {
      current += "|";
      i++;
    } else if (char === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

const SEPARATOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function isTableLine(line: string): boolean {
  return line.trim().startsWith("|");
}

export function parseSuite(raw: string): ParsedSuite {
  const issues: ValidationIssue[] = [];
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const meta: SuiteMeta = {};
  let index = 0;

  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
    if (end === -1) {
      issues.push({ severity: "error", code: "suiteHeaderUnclosed", line: 1 });
      return { meta, cases: [], issues };
    }
    try {
      const data = load(lines.slice(1, end).join("\n"));
      if (data && typeof data === "object" && !Array.isArray(data)) {
        const record = data as Record<string, unknown>;
        if (typeof record.titre === "string" && record.titre.trim()) meta.titre = record.titre.trim();
        if (typeof record.skill === "string" && record.skill.trim()) meta.skill = record.skill.trim();
      } else if (data !== undefined && data !== null) {
        issues.push({ severity: "error", code: "suiteHeaderInvalid", line: 2 });
      }
    } catch (error) {
      const mark = (error as { mark?: { line?: number } }).mark;
      issues.push({ severity: "error", code: "suiteHeaderInvalid", line: typeof mark?.line === "number" ? mark.line + 2 : 2 });
    }
    index = end + 1;
  }

  while (index < lines.length && !isTableLine(lines[index])) index++;
  if (index >= lines.length) {
    issues.push({ severity: "error", code: "suiteTableMissing", line: Math.min(lines.length, index + 1) || 1 });
    return { meta, cases: [], issues };
  }

  const headerLine = index + 1;
  const headings = splitRow(lines[index]).map(normalizeHeading);
  const columns: (Column | null)[] = headings.map((heading) => HEADINGS[heading] ?? null);
  for (const [position, heading] of headings.entries()) {
    if (!columns[position] && heading) {
      issues.push({ severity: "warning", code: "suiteColumnUnknown", line: headerLine, params: { column: splitRow(lines[index])[position] } });
    }
  }
  if (!columns.includes("id")) issues.push({ severity: "error", code: "suiteColumnIdMissing", line: headerLine });
  if (!columns.includes("requete")) issues.push({ severity: "error", code: "suiteColumnQueryMissing", line: headerLine });
  index++;
  if (index < lines.length && SEPARATOR.test(lines[index])) index++;

  const cases: SuiteCase[] = [];
  const seen = new Map<string, number>();
  for (; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (!isTableLine(line)) break;
    const lineNumber = index + 1;
    const cells = splitRow(line);
    if (cells.length !== columns.length) {
      issues.push({ severity: "error", code: "suiteRowColumns", line: lineNumber, params: { found: cells.length, expected: columns.length } });
      continue;
    }
    const row: Record<Column, string> = { id: "", requete: "", attendu: "", sources: "" };
    columns.forEach((column, position) => {
      if (column) row[column] = cells[position];
    });
    if (!row.id) {
      issues.push({ severity: "error", code: "suiteIdMissing", line: lineNumber });
      continue;
    }
    if (!CASE_ID_PATTERN.test(row.id)) {
      issues.push({ severity: "error", code: "suiteIdInvalid", line: lineNumber, params: { id: row.id } });
      continue;
    }
    const previous = seen.get(row.id);
    if (previous !== undefined) {
      issues.push({ severity: "error", code: "suiteIdDuplicate", line: lineNumber, params: { id: row.id, other: previous } });
      continue;
    }
    seen.set(row.id, lineNumber);
    if (!row.requete) issues.push({ severity: "error", code: "suiteQueryMissing", line: lineNumber, params: { id: row.id } });
    cases.push({ ...row, line: lineNumber });
  }
  for (; index < lines.length; index++) {
    if (lines[index].trim()) {
      issues.push({ severity: "warning", code: "suiteTextAfterTable", line: index + 1 });
      break;
    }
  }
  if (!cases.length && !issues.some((issue) => issue.severity === "error")) {
    issues.push({ severity: "warning", code: "suiteEmpty", line: headerLine });
  }
  return { meta, cases, issues };
}

function escapeCell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

/** The file for a suite edited in the table view: header, then the four columns of the spec. */
export function serializeSuite(meta: SuiteMeta, cases: Pick<SuiteCase, "id" | "requete" | "attendu" | "sources">[]): string {
  const header: Record<string, string> = {};
  if (meta.titre?.trim()) header.titre = meta.titre.trim();
  if (meta.skill?.trim()) header.skill = meta.skill.trim();
  const parts: string[] = [];
  if (Object.keys(header).length) parts.push(`---\n${dump(header, { lineWidth: -1 })}---\n`);
  const rows = [
    "| id | requête | attendu | sources attendues |",
    "|----|---------|---------|-------------------|",
    ...cases.map((item) => `| ${escapeCell(item.id)} | ${escapeCell(item.requete)} | ${escapeCell(item.attendu)} | ${escapeCell(item.sources)} |`),
  ];
  parts.push(rows.join("\n"));
  return `${parts.join("\n")}\n`;
}
