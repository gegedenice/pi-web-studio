import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { alice, gitIn, loadStudio, setupStudioEnv } from "./studio-test-env.mjs";

const [packs, skills, history] = await loadStudio("packs", "skills", "history");

test("a skill's other files: listed with their kind, edited, added and deleted, one version each", async (t) => {
  const { packsDir } = setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "Revue" }, alice);
  await skills.createSkill("lr", { name: "openalex-search", description: "Recherche." }, alice);
  const dir = join(packsDir, "lr/.pi/skills/openalex-search");
  mkdirSync(join(dir, "references"), { recursive: true });
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "references/passes.md"), "# Passes\n");
  writeFileSync(join(dir, "scripts/compte.py"), "print(1)\n");
  writeFileSync(join(dir, "assets/logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1]));
  gitIn(packsDir, "add", "-A");
  gitIn(packsDir, "-c", "user.name=x", "-c", "user.email=x@x", "commit", "-qm", "fichiers");

  assert.deepEqual(skills.skillFileInfo("lr", "openalex-search").map(({ path, kind, text }) => [path, kind, text]), [
    ["assets/logo.png", "asset", false],
    ["references/passes.md", "reference", true],
    ["scripts/compte.py", "script", true],
  ]);

  const path = ".pi/skills/openalex-search/references/passes.md";
  const doc = history.readEditableFile("lr", path);
  assert.equal(doc.content, "# Passes\n");
  await history.writeEditableFile("lr", path, "# Passes\n\n1. Recherche large.\n", doc.hash, alice);
  assert.equal(readFileSync(join(dir, "references/passes.md"), "utf8"), "# Passes\n\n1. Recherche large.\n");
  assert.equal(gitIn(packsDir, "log", "-1", "--format=%an|%s").trim(), "Alice Martin|[lr] Modifie skill openalex-search : references/passes.md");
  assert.equal((await history.fileHistory("lr", path)).length, 2, "the file has its own versions");

  // A new file: a save over a file that does not exist yet.
  await history.writeEditableFile("lr", ".pi/skills/openalex-search/references/methode.md", "", "", alice);
  assert.equal(gitIn(packsDir, "log", "-1", "--format=%s").trim(), "[lr] Ajoute skill openalex-search : references/methode.md");

  // Refusals: a binary file, a skill that does not exist, a path leaving the skill, SKILL.md itself.
  assert.throws(() => history.readEditableFile("lr", ".pi/skills/openalex-search/assets/logo.png"), { code: "fileBinary" });
  await assert.rejects(history.writeEditableFile("lr", ".pi/skills/inconnue/references/a.md", "x", "", alice), { code: "skillNotFound" });
  await assert.rejects(history.writeEditableFile("lr", ".pi/skills/openalex-search/../../AGENTS.md", "x", "", alice), { code: "invalidPath" });
  assert.throws(() => history.readEditableFile("lr", ".pi/skills/openalex-search/SKILL.md"), { code: "fileNotEditable" });

  await history.deleteSkillAnnexFile("lr", ".pi/skills/openalex-search/scripts/compte.py", alice);
  assert.equal(existsSync(join(dir, "scripts/compte.py")), false);
  assert.equal(gitIn(packsDir, "log", "-1", "--format=%s").trim(), "[lr] Supprime skill openalex-search : scripts/compte.py");
  await assert.rejects(history.deleteSkillAnnexFile("lr", ".pi/skills/openalex-search/scripts/compte.py", alice), { code: "fileNotFound" });
  await assert.rejects(history.deleteSkillAnnexFile("lr", "AGENTS.md", alice), { code: "fileNotEditable" });
});
