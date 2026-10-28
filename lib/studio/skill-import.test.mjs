import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { alice, gitIn, loadStudio, setupStudioEnv } from "./studio-test-env.mjs";

const [packs, importer, skills] = await loadStudio("packs", "skill-import", "skills");

const b64 = (text) => Buffer.from(text).toString("base64");
const SKILL = "---\nname: openalex-search\ndescription: Recherche dans OpenAlex.\n---\n\nVoir [l'API](references/api.md) et lancer `scripts/search.py`.\n";

test("a whole skill folder: files kept as they are, system leftovers left out, one version", async (t) => {
  const { packsDir } = setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "Revue" }, alice);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]);
  const result = await importer.importSkillFolder("lr", {
    files: [
      { path: "openalex-search/SKILL.md", content: b64(SKILL) },
      { path: "openalex-search/references/api.md", content: b64("# API\n") },
      { path: "openalex-search/scripts/search.py", content: b64("print('ok')\n") },
      { path: "openalex-search/assets/logo.png", content: png.toString("base64") },
      { path: "openalex-search/.DS_Store", content: b64("x") },
      { path: "openalex-search/scripts/__pycache__/search.cpython-312.pyc", content: b64("x") },
    ],
  }, alice);
  assert.equal(result.skill.name, "openalex-search");
  assert.deepEqual(result.files, [
    ".pi/skills/openalex-search/SKILL.md",
    ".pi/skills/openalex-search/assets/logo.png",
    ".pi/skills/openalex-search/references/api.md",
    ".pi/skills/openalex-search/scripts/search.py",
  ]);
  assert.deepEqual(result.scripts, ["scripts/search.py"]);
  assert.equal(result.skipped.length, 2);
  assert.deepEqual(readFileSync(join(packsDir, "lr/.pi/skills/openalex-search/assets/logo.png")), png, "binary files are kept byte for byte");
  assert.deepEqual(skills.listSkills("lr")[0].issues, [], "the link to references/api.md resolves");
  assert.equal(gitIn(packsDir, "log", "-1", "--format=%s").trim(), "[lr] Importe skill openalex-search");
  assert.equal(gitIn(packsDir, "show", "--name-only", "--format=", "HEAD").trim().split("\n").length, 4);
});

test("refusals: no SKILL.md, a path leaving the folder, a skill that exists, a broken SKILL.md, too large", async (t) => {
  setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "Revue" }, alice);
  await assert.rejects(importer.importSkillFolder("lr", { files: [{ path: "x/README.md", content: b64("hi") }] }, alice), { code: "importNoSkillFile" });
  await assert.rejects(importer.importSkillFolder("lr", { files: [{ path: "SKILL.md", content: b64(SKILL) }, { path: "../evil.sh", content: b64("rm") }] }, alice), { code: "importBadPath" });
  await assert.rejects(importer.importSkillFolder("lr", { files: [{ path: "SKILL.md", content: b64("pas d'en-tête") }] }, alice), { code: "importNameMissing" });
  await assert.rejects(importer.importSkillFolder("lr", { files: [{ path: "s/SKILL.md", content: b64("---\nname: a\n---\n") }] }, alice), { code: "validationFailed" });
  await assert.rejects(importer.importSkillFolder("lr", { files: [{ path: "SKILL.md", content: b64(SKILL) }, { path: "big.bin", content: Buffer.alloc(11 * 1024 * 1024).toString("base64") }] }, alice), { code: "importFileTooLarge" });
  // Name chosen by the person, written into SKILL.md.
  const renamed = await importer.importSkillFolder("lr", { files: [{ path: "SKILL.md", content: b64(SKILL) }], name: "recherche" }, alice);
  assert.match(renamed.skill.raw, /^---\nname: recherche\n/);
  await assert.rejects(importer.importSkillFolder("lr", { files: [{ path: "SKILL.md", content: b64(SKILL) }], name: "recherche" }, alice), { code: "skillExists" });
});
