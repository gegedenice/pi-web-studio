import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { alice, bob, gitIn, loadStudio, setupStudioEnv } from "./studio-test-env.mjs";

const [packs, skills, history, git, paths] = await loadStudio("packs", "skills", "history", "git", "paths");

const authors = (dir) => gitIn(dir, "log", "--format=%an <%ae>|%s").trim().split("\n");

test("creating a pack writes its files from the templates in one version, after an initialised repository", async (t) => {
  const { packsDir } = setupStudioEnv(t);
  const meta = await packs.createPack({ id: "literature-review", title: "Revue de littérature", description: "Aide à la revue." }, alice);
  assert.equal(meta.status, "en-conception");
  assert.equal(meta.version, "0.1");
  assert.deepEqual(meta.owners, ["alice"]);
  for (const file of ["AGENTS.md", ".pi/APPEND_SYSTEM.md", ".pi/settings.json", ".studio/pack.json"]) {
    assert.ok(existsSync(join(packsDir, "literature-review", file)), file);
  }
  assert.ok(!existsSync(join(packsDir, "literature-review", ".pi/SYSTEM.md")));
  assert.match(readFileSync(join(packsDir, "literature-review/AGENTS.md"), "utf8"), /^# Pack : Revue de littérature/);
  assert.deepEqual(JSON.parse(readFileSync(join(packsDir, "literature-review/.studio/pack.json"), "utf8")).id, "literature-review");
  assert.deepEqual(authors(packsDir), [
    "Alice Martin <alice@example.org>|[literature-review] Crée le pack",
    "Alice Martin <alice@example.org>|Initialise le dépôt des packs",
  ]);
  assert.match(readFileSync(join(packsDir, ".gitignore"), "utf8"), /\.pi\/mcp-traces\//);
  assert.equal(gitIn(packsDir, "status", "--porcelain").trim(), "");

  await assert.rejects(packs.createPack({ id: "literature-review", title: "Autre" }, alice), { code: "packExists" });
  await assert.rejects(packs.createPack({ id: "Revue", title: "x" }, alice), { code: "invalidPackId" });
  await assert.rejects(packs.createPack({ id: "ok", title: "  " }, alice), { code: "titleMissing" });

  const list = await packs.listPacks();
  assert.deepEqual(list.map((pack) => [pack.id, pack.title]), [["literature-review", "Revue de littérature"]]);
  assert.ok(list[0].updatedAt);
});

test("an existing repository is reused, and a folder without pack.json is not a pack", async (t) => {
  const { packsDir } = setupStudioEnv(t);
  mkdirSync(join(packsDir, "notes"), { recursive: true });
  gitIn(packsDir, "init", "-q");
  writeFileSync(join(packsDir, "notes/README.md"), "x");
  await packs.createPack({ id: "p1", title: "P1" }, alice);
  assert.equal(existsSync(join(packsDir, ".gitignore")), false, "the Studio does not add .gitignore to an existing repository");
  assert.deepEqual((await packs.listPacks()).map((pack) => pack.id), ["p1"]);
  assert.equal(gitIn(packsDir, "status", "--porcelain").trim(), "?? notes/", "other files are left uncommitted");
});

test("a skill is created from the template, saved, renamed, deleted and restored, one version each, with its author", async (t) => {
  const { packsDir } = setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "LR" }, alice);
  const created = await skills.createSkill("lr", { name: "openalex-search", description: "Recherche : OpenAlex, « travaux »." }, alice);
  assert.deepEqual(created.issues, []);
  assert.equal(created.description, "Recherche : OpenAlex, « travaux ».");
  await assert.rejects(skills.createSkill("lr", { name: "openalex-search", description: "x" }, alice), { code: "skillExists" });
  await assert.rejects(skills.createSkill("lr", { name: "openalex-search-2", description: "" }, alice), { code: "validationFailed" });

  const saved = await skills.saveSkill("lr", "openalex-search", { mode: "form", description: "Nouvelle description", body: "# Corps\n\nVoir [x](references/x.md).\n" }, created.hash, bob, "Précise la description");
  assert.deepEqual(saved.issues.map((issue) => issue.code), ["linkMissing"], "a warning does not block the save");
  await assert.rejects(skills.saveSkill("lr", "openalex-search", { mode: "form", description: "Encore", body: "x" }, created.hash, bob), { code: "conflict" });
  await assert.rejects(skills.saveSkill("lr", "openalex-search", { mode: "raw", raw: "---\nname: autre\ndescription: x\n---\n" }, saved.hash, bob), (error) => {
    assert.equal(error.code, "validationFailed");
    assert.deepEqual(error.issues.map((issue) => issue.code), ["nameMismatch"]);
    return true;
  });

  const renamed = await skills.renameSkill("lr", "openalex-search", "openalex", alice);
  assert.equal(renamed.declaredName, "openalex");
  assert.deepEqual(skills.listSkills("lr").map((skill) => skill.name), ["openalex"]);
  await skills.deleteSkill("lr", "openalex", alice);
  assert.deepEqual(skills.listSkills("lr"), []);

  const deleted = await history.deletedSkills("lr");
  assert.deepEqual(deleted.map((item) => item.name), ["openalex"]);
  await history.restoreDeletedSkill("lr", "openalex", deleted[0].rev, bob);
  assert.equal(skills.readSkill("lr", "openalex").description, "Nouvelle description");
  assert.deepEqual(await history.deletedSkills("lr"), []);

  assert.deepEqual(authors(packsDir).slice(0, 6), [
    "Bob Durand <bob@example.org>|[lr] Restaure skill openalex (supprimée le " + authors(packsDir)[0].split("supprimée le ")[1],
    "Alice Martin <alice@example.org>|[lr] Supprime skill openalex",
    "Alice Martin <alice@example.org>|[lr] Renomme skill openalex-search en openalex",
    "Bob Durand <bob@example.org>|[lr] Précise la description",
    "Alice Martin <alice@example.org>|[lr] Crée skill openalex-search",
    "Alice Martin <alice@example.org>|[lr] Crée le pack",
  ]);
  assert.match(gitIn(packsDir, "log", "-1", "--skip=3", "--format=%b"), /Modifie skill openalex-search/, "the generated summary stays in the body under a note");
});

test("restoring a first version is a new version; earlier versions are untouched", async (t) => {
  const { packsDir } = setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "LR" }, alice);
  const first = await skills.createSkill("lr", { name: "crossref", description: "Première" }, alice);
  const second = await skills.saveSkill("lr", "crossref", { mode: "form", description: "Deuxième", body: first.body }, first.hash, alice);
  await skills.saveSkill("lr", "crossref", { mode: "form", description: "Troisième", body: first.body }, second.hash, alice);
  const before = gitIn(packsDir, "rev-list", "HEAD").trim().split("\n");

  const versions = await history.fileHistory("lr", ".pi/skills/crossref/SKILL.md");
  assert.equal(versions.length, 3);
  const oldest = versions.at(-1);
  assert.equal((await history.fileAtVersion("lr", ".pi/skills/crossref/SKILL.md", oldest.rev)).content.includes("Première"), true);
  await history.restoreFile("lr", ".pi/skills/crossref/SKILL.md", oldest.rev, bob);
  assert.equal(skills.readSkill("lr", "crossref").description, "Première");

  const after = gitIn(packsDir, "rev-list", "HEAD").trim().split("\n");
  assert.equal(after.length, before.length + 1);
  assert.deepEqual(after.slice(1), before, "history is only added to");
  assert.match(gitIn(packsDir, "log", "-1", "--format=%an|%s"), /^Bob Durand\|\[lr\] Restaure skill crossref \(version du /);
  await assert.rejects(history.restoreFile("lr", ".pi/skills/crossref/SKILL.md", "0000000", bob), { code: "versionNotFound" });
  await assert.rejects(history.restoreFile("lr", ".pi/skills/crossref/SKILL.md", "HEAD~1", bob), { code: "invalidVersion" });
});

test("a renamed skill keeps its history, and an old version is restored under the new name", async (t) => {
  setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "LR" }, alice);
  await skills.createSkill("lr", { name: "old-name", description: "Avant" }, alice);
  await skills.renameSkill("lr", "old-name", "new-name", alice);
  const versions = await history.fileHistory("lr", ".pi/skills/new-name/SKILL.md");
  assert.equal(versions.length, 2);
  assert.equal(versions[1].path, ".pi/skills/old-name/SKILL.md");
  await history.restoreFile("lr", ".pi/skills/new-name/SKILL.md", versions[1].rev, alice);
  assert.deepEqual(skills.readSkill("lr", "new-name").issues, []);
});

test("a save commits only its own file; other changes stay as they are", async (t) => {
  const { packsDir } = setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "LR" }, alice);
  writeFileSync(join(packsDir, "lr/notes.md"), "brouillon");
  writeFileSync(join(packsDir, "lr/AGENTS.md"), "modifié à la main");
  gitIn(packsDir, "add", "lr/notes.md");
  const doc = history.readEditableFile("lr", ".pi/APPEND_SYSTEM.md");
  await history.writeEditableFile("lr", ".pi/APPEND_SYSTEM.md", "Nouvelles consignes\n", doc.hash, alice);
  assert.deepEqual(gitIn(packsDir, "show", "--name-only", "--format=", "HEAD").trim().split("\n"), ["lr/.pi/APPEND_SYSTEM.md"]);
  assert.deepEqual(gitIn(packsDir, "status", "--porcelain").split("\n").filter(Boolean).sort(), [" M lr/AGENTS.md", "A  lr/notes.md"]);
  assert.match(gitIn(packsDir, "log", "-1", "--format=%s"), /Modifie consignes système/);
});

test("simultaneous saves are serialised: one version each, no index.lock error", async (t) => {
  const { packsDir } = setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "LR" }, alice);
  const names = ["a", "b", "c", "d", "e"];
  await Promise.all(names.map((name, i) => skills.createSkill("lr", { name: `skill-${name}`, description: `D${i}` }, i % 2 ? alice : bob)));
  assert.equal(gitIn(packsDir, "rev-list", "--count", "HEAD").trim(), String(2 + names.length));
  assert.equal(gitIn(packsDir, "status", "--porcelain").trim(), "");
});

test("editable files: whitelist, conflicts, settings must be a JSON object", async (t) => {
  setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "LR" }, alice);
  assert.throws(() => history.readEditableFile("lr", ".studio/pack.json"), { code: "fileNotEditable" });
  assert.throws(() => history.readEditableFile("lr", "../autre/AGENTS.md"), { code: "invalidPath" });
  const system = history.readEditableFile("lr", ".pi/SYSTEM.md");
  assert.deepEqual([system.exists, system.hash], [false, ""]);
  await history.writeEditableFile("lr", ".pi/SYSTEM.md", "Remplace tout.\n", "", alice);
  await assert.rejects(history.writeEditableFile("lr", ".pi/SYSTEM.md", "x", "", alice), { code: "conflict" });
  const settings = history.readEditableFile("lr", ".pi/settings.json");
  await assert.rejects(history.writeEditableFile("lr", ".pi/settings.json", "[1]", settings.hash, alice), { code: "settingsInvalid" });
});

test("configuration: metadata and the default model in .pi/settings.json", async (t) => {
  const { packsDir } = setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "LR" }, alice);
  await packs.updatePackConfig("lr", { title: "Revue", status: "en-test", defaultModel: { provider: "llama", modelId: "qwen3-vl-8b" } }, alice);
  assert.deepEqual(JSON.parse(readFileSync(join(packsDir, "lr/.pi/settings.json"), "utf8")), { defaultProvider: "llama", defaultModel: "qwen3-vl-8b" });
  assert.equal(packs.readPackMeta("lr").title, "Revue");
  assert.deepEqual(packs.readDefaultModel("lr"), { provider: "llama", modelId: "qwen3-vl-8b" });
  await packs.updatePackConfig("lr", { defaultModel: null }, alice);
  assert.equal(packs.readDefaultModel("lr"), null);
  await assert.rejects(packs.updatePackConfig("lr", { status: "fini" }, alice), { code: "invalidStatus" });
  const count = gitIn(packsDir, "rev-list", "--count", "HEAD").trim();
  await packs.updatePackConfig("lr", { title: "Revue" }, alice);
  assert.equal(gitIn(packsDir, "rev-list", "--count", "HEAD").trim(), count, "no change, no version");
});

test("changes made outside the Studio are listed, kept or discarded as new versions", async (t) => {
  const { packsDir } = setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "LR" }, alice);
  await packs.createPack({ id: "other", title: "Autre" }, alice);
  writeFileSync(join(packsDir, "lr/AGENTS.md"), "réécrit par une session\n");
  writeFileSync(join(packsDir, "lr/sortie.md"), "fichier créé par l'agent\n");
  writeFileSync(join(packsDir, "other/AGENTS.md"), "autre pack\n");
  assert.deepEqual(await packs.externalChanges("lr"), [
    { path: "AGENTS.md", kind: "modified" },
    { path: "sortie.md", kind: "added" },
  ]);

  const before = Number(gitIn(packsDir, "rev-list", "--count", "HEAD"));
  await history.discardExternalChanges("lr", bob);
  assert.deepEqual(await packs.externalChanges("lr"), []);
  assert.equal(existsSync(join(packsDir, "lr/sortie.md")), false);
  assert.match(readFileSync(join(packsDir, "lr/AGENTS.md"), "utf8"), /^# Pack : LR/);
  assert.equal(Number(gitIn(packsDir, "rev-list", "--count", "HEAD")), before + 1);
  assert.match(gitIn(packsDir, "log", "-1", "--format=%an|%s%n%b"), /^Bob Durand\|\[lr\] Annule les modifications faites hors Studio\n- AGENTS.md\n- sortie.md/);

  writeFileSync(join(packsDir, "lr/AGENTS.md"), "gardé\n");
  await history.keepExternalChanges("lr", alice);
  assert.deepEqual(await packs.externalChanges("lr"), []);
  assert.equal(gitIn(packsDir, "show", "HEAD:lr/AGENTS.md"), "gardé\n");
  assert.deepEqual(await packs.externalChanges("other"), [{ path: "AGENTS.md", kind: "modified" }], "another pack's changes are left alone");
});

test("paths: no escape through .., absolute paths or symbolic links", async (t) => {
  const { packsDir, base } = setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "LR" }, alice);
  assert.throws(() => paths.resolvePackPath("lr", "../x"), { code: "invalidPath" });
  assert.throws(() => paths.resolvePackPath("lr", "/etc/passwd"), { code: "invalidPath" });
  assert.throws(() => paths.resolvePackPath("lr", "a\\b"), { code: "invalidPath" });
  assert.throws(() => paths.resolvePackPath("lr", "a//b"), { code: "invalidPath" });
  assert.throws(() => paths.resolvePackPath("../lr"), { code: "invalidPackId" });

  mkdirSync(join(base, "outside"));
  writeFileSync(join(base, "outside/SKILL.md"), "---\nname: evil\ndescription: x\n---\n");
  symlinkSync(join(base, "outside"), join(packsDir, "lr/.pi/skills-link"));
  mkdirSync(join(packsDir, "lr/.pi/skills"), { recursive: true });
  symlinkSync(join(base, "outside"), join(packsDir, "lr/.pi/skills/evil"));
  symlinkSync(join(base, "outside/SKILL.md"), join(packsDir, "lr/AGENTS-link.md"));
  assert.throws(() => paths.resolvePackPath("lr", ".pi/skills-link/SKILL.md"), { code: "symlinkRefused" });
  assert.throws(() => skills.readSkill("lr", "evil"), { code: "symlinkRefused" });
  assert.deepEqual(skills.listSkills("lr"), [], "a linked skill folder is not listed");
  symlinkSync(join(base, "outside"), join(packsDir, "linked-pack"));
  assert.throws(() => paths.resolvePackPath("linked-pack", "AGENTS.md"), { code: "symlinkRefused" });
  assert.deepEqual((await packs.listPacks()).map((pack) => pack.id), ["lr"]);
});

test("the journey's design step follows instructions and valid skills", async (t) => {
  setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "LR" }, alice);
  assert.equal(packs.packJourney("lr", 0, false).design, "progress");
  assert.deepEqual(packs.packJourney("lr", 1, true), { design: "ready", connect: "later", evaluate: "todo" });
  const details = await packs.packDetails("lr", { valid: 0, total: 0 });
  assert.deepEqual(details.promptFiles, { append: true, system: false });
  assert.equal(details.piLoadsProject, false, "the temporary folder is not trusted");
  assert.deepEqual(details.externalChanges, []);
  assert.equal(await git.lastCommitDate("lr/"), details.updatedAt);
});
