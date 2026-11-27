import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { parseSuite, serializeSuite, splitRow } = await createJiti(import.meta.url).import("./parse.ts");
const codes = (issues) => issues.map((issue) => issue.code);

const SPEC = `---
titre: Recherche bibliographique
skill: openalex-search
---

| id | requête | attendu | sources attendues |
|----|---------|---------|-------------------|
| RB-01 | Trouve 5 articles récents sur la désinformation climatique | 5 références 2022+ avec DOI | OpenAlex |

| RB-02 | Deuxième requête | attendu 2 | |
`;

test("the spec's example parses: header, columns, blank lines skipped", () => {
  const suite = parseSuite(SPEC);
  assert.deepEqual(suite.issues, []);
  assert.deepEqual(suite.meta, { titre: "Recherche bibliographique", skill: "openalex-search" });
  assert.deepEqual(suite.cases.map((item) => [item.id, item.line, item.sources]), [["RB-01", 8, "OpenAlex"], ["RB-02", 10, ""]]);
});

test("headings are matched without case, accents or extra spaces, in any order", () => {
  const suite = parseSuite("|  Sources Attendues | REQUETE |  Id  |\n|---|---|---|\n| X | Question ? | A1 |\n");
  assert.deepEqual(suite.issues, []);
  assert.deepEqual(suite.cases[0], { id: "A1", requete: "Question ?", attendu: "", sources: "X", line: 3 });
});

test("escaped pipes stay in the cell and survive a round trip", () => {
  assert.deepEqual(splitRow("| a \\| b | c |"), ["a | b", "c"]);
  const cases = [{ id: "P-1", requete: "Compare A | B", attendu: "deux\nlignes", sources: "" }];
  const parsed = parseSuite(serializeSuite({ titre: "Titre : avec deux-points" }, cases));
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.meta.titre, "Titre : avec deux-points");
  assert.deepEqual(parsed.cases.map((item) => ({ id: item.id, requete: item.requete, attendu: item.attendu, sources: item.sources })), [{ id: "P-1", requete: "Compare A | B", attendu: "deux lignes", sources: "" }]);
});

test("problems are reported with their line", () => {
  const bad = parseSuite("| id | requête |\n|---|---|\n| A | q |\n| A | q2 |\n| | q3 |\n| B c | q |\n| C | q | trop |\n| D | |\n");
  assert.deepEqual(bad.issues.map((issue) => [issue.code, issue.line]), [
    ["suiteIdDuplicate", 4], ["suiteIdMissing", 5], ["suiteIdInvalid", 6], ["suiteRowColumns", 7], ["suiteQueryMissing", 8],
  ]);
  assert.deepEqual(bad.cases.map((item) => item.id), ["A", "D"]);
  assert.deepEqual(codes(parseSuite("Pas de tableau ici.\n").issues), ["suiteTableMissing"]);
  assert.deepEqual(codes(parseSuite("| requête | autre |\n|---|---|\n").issues), ["suiteColumnUnknown", "suiteColumnIdMissing"]);
  assert.deepEqual(codes(parseSuite("---\ntitre: [x\n---\n| id | requête |\n").issues).slice(0, 1), ["suiteHeaderInvalid"]);
  assert.deepEqual(codes(parseSuite("---\ntitre: x\n| id | requête |\n").issues), ["suiteHeaderUnclosed"]);
  assert.deepEqual(codes(parseSuite("| id | requête |\n|---|---|\n").issues), ["suiteEmpty"]);
  assert.deepEqual(codes(parseSuite("| id | requête |\n|---|---|\n| A | q |\n\nNote finale\n").issues), ["suiteTextAfterTable"]);
});
