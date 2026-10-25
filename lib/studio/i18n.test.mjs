import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import { repoRoot } from "./studio-test-env.mjs";

const jiti = createJiti(import.meta.url);
const { studioFrMessages: fr } = await jiti.import("./i18n/fr.ts");
const { studioEnMessages: en } = await jiti.import("./i18n/en.ts");

const sources = (dir) => readdirSync(join(repoRoot, dir), { recursive: true })
  .filter((file) => /\.tsx?$/.test(file) && !file.includes("i18n"))
  .map((file) => readFileSync(join(repoRoot, dir, file), "utf8"));
const code = [...sources("components/studio"), ...sources("lib/studio")].join("\n");
const placeholders = (message) => [...message.matchAll(/\{([\w.-]+)\}/g)].map((match) => match[1]).sort();

test("French and English have the same keys and placeholders", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  for (const key of Object.keys(fr)) assert.deepEqual(placeholders(en[key]), placeholders(fr[key]), key);
});

test("every key the Studio uses exists", () => {
  const used = new Set([...code.matchAll(/t\("(studio\.[\w.-]+)"/g)].map((match) => match[1]));
  for (const value of ["en-conception", "en-test", "valide", "archive"]) used.add(`studio.status.${value}`);
  for (const value of ["todo", "progress", "ready", "later"]) used.add(`studio.journey.state.${value}`);
  for (const value of ["modified", "added", "deleted"]) used.add(`studio.external.${value}`);
  for (const match of code.matchAll(/new StudioError\("(\w+)"/g)) used.add(`studio.error.${match[1]}`);
  for (const value of ["network", "unauthenticated", "unexpected"]) used.add(`studio.error.${value}`);
  for (const match of code.matchAll(/code: "(\w+)"/g)) {
    if (!["validationFailed", "unexpected", "network"].includes(match[1])) {
      used.add(`studio.validation.${match[1]}`);
      used.add(`studio.validation.${match[1]}.fix`);
    }
  }
  const missing = [...used].filter((key) => !(key in fr));
  assert.deepEqual(missing, []);
});

test("the default view never shows Git or file-format jargon", () => {
  // Advanced mode only: the raw file editors name their format.
  const advanced = new Set(["studio.skills.rawLabel", "studio.config.settingsLabel", "studio.config.settingsIntro", "studio.mcp.rawLabel", "studio.mcp.rawIntro"]);
  const forbidden = /\b(commit|branch|branche|HEAD|diff|JSON|YAML|stdio|cwd)\b/i;
  const offending = Object.entries(fr).filter(([key, value]) => !advanced.has(key) && forbidden.test(value)).map(([key]) => key);
  assert.deepEqual(offending, []);
});
