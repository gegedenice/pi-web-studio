import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { validateSkill, hasErrors, validatePackId, findRelativeReferences } = await jiti.import("./validate.ts");
const { slugify, isSlug } = await jiti.import("./slug.ts");

const skill = (front, body = "# Titre\n\nCorps.\n") => `---\n${front}\n---\n\n${body}`;
const codes = (issues) => issues.map((issue) => issue.code);
const check = (raw, dirName = "openalex-search", files = []) =>
  validateSkill({ dirName, raw, fileExists: (path) => files.includes(path) });

test("a well-formed skill has no issue", () => {
  assert.deepEqual(check(skill("name: openalex-search\ndescription: Recherche dans OpenAlex.")), []);
});

test("frontmatter must open the file and be closed", () => {
  assert.deepEqual(codes(check("# Sans frontmatter\n")), ["frontmatterMissing"]);
  const late = check("\n---\nname: openalex-search\ndescription: x\n---\nCorps\n");
  assert.deepEqual(codes(late), ["frontmatterNotFirst"]);
  assert.equal(late[0].line, 2);
  assert.deepEqual(codes(check("---\nname: openalex-search\ndescription: x\n")), ["frontmatterUnclosed"]);
});

test("a byte order mark and CRLF line ends are accepted, as Pi accepts them", () => {
  assert.deepEqual(check("﻿---\r\nname: openalex-search\r\ndescription: Ok.\r\n---\r\nCorps\r\n"), []);
});

test("invalid YAML is reported with its line in the file", () => {
  const issues = check("---\nname: openalex-search\ndescription: [non fermé\n---\nCorps\n");
  assert.deepEqual(codes(issues), ["yamlInvalid"]);
  assert.ok(issues[0].line >= 2 && issues[0].line <= 4, `line ${issues[0].line}`);
});

test("name rules: present, valid, at most 64 characters, equal to the folder", () => {
  assert.deepEqual(codes(check(skill("description: x"))), ["nameMissing"]);
  assert.deepEqual(codes(check(skill("name: OpenAlex\ndescription: x"))), ["nameInvalid"]);
  assert.deepEqual(codes(check(skill("name: open--alex\ndescription: x"))), ["nameInvalid"]);
  assert.deepEqual(codes(check(skill("name: openalex-\ndescription: x"))), ["nameInvalid"]);
  const long = "a".repeat(65);
  assert.deepEqual(codes(check(skill(`name: ${long}\ndescription: x`), long)), ["nameTooLong"]);
  const mismatch = check(skill("name: crossref\ndescription: x"));
  assert.deepEqual(codes(mismatch), ["nameMismatch"]);
  assert.deepEqual(mismatch[0].params, { name: "crossref", dir: "openalex-search" });
  assert.equal(mismatch[0].line, 2);
});

test("description rules: present, not blank, at most 1024 characters", () => {
  assert.deepEqual(codes(check(skill("name: openalex-search"))), ["descriptionMissing"]);
  assert.deepEqual(codes(check(skill("name: openalex-search\ndescription: '   '"))), ["descriptionMissing"]);
  assert.deepEqual(check(skill(`name: openalex-search\ndescription: ${"d".repeat(1024)}`)), []);
  const long = check(skill(`name: openalex-search\ndescription: ${"d".repeat(1025)}`));
  assert.deepEqual(codes(long), ["descriptionTooLong"]);
  assert.equal(long[0].params.length, 1025);
  assert.equal(long[0].line, 3);
});

test("relative links to missing files are warnings, with the line of the link", () => {
  const raw = skill(
    "name: openalex-search\ndescription: x",
    "# T\n\nLire [formats](references/formats.md) puis `scripts/run.sh`.\nVoir [doc](https://openalex.org) et [ancre](#t).\n[ok](references/ok.md)\n[dehors](../autre/SKILL.md)\n",
  );
  const issues = check(raw, "openalex-search", ["references/ok.md"]);
  assert.equal(hasErrors(issues), false);
  assert.deepEqual(issues.map((issue) => [issue.code, issue.params.target, issue.line]), [
    ["linkMissing", "references/formats.md", 8],
    ["linkMissing", "scripts/run.sh", 8],
    ["linkOutside", "../autre/SKILL.md", 11],
  ]);
});

test("references are found in Markdown links and in plain text", () => {
  assert.deepEqual(findRelativeReferences("[a](references/a.md) et assets/logo.png").map((item) => item.target), ["references/a.md", "assets/logo.png"]);
});

test("pack ids follow the skill name rule", () => {
  assert.deepEqual(validatePackId("literature-review"), []);
  assert.deepEqual(codes(validatePackId("")), ["packIdMissing"]);
  assert.deepEqual(codes(validatePackId("Revue")), ["packIdInvalid"]);
  assert.equal(isSlug("a".repeat(64)), true);
  assert.equal(isSlug("a".repeat(65)), false);
});

test("an id is proposed from a French title", () => {
  assert.equal(slugify("Revue de littérature"), "revue-de-litterature");
  assert.equal(slugify("  Éclaireur — bibliographique !"), "eclaireur-bibliographique");
  assert.equal(isSlug(slugify("x".repeat(70) + " fin")), true);
});
