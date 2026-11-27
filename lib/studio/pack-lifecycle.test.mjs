import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { alice, bob, gitIn, loadStudio, setupStudioEnv } from "./studio-test-env.mjs";

const [lifecycle, packs, skills, history, publish, exporter, inspect, activeRuns] = await loadStudio(
  "pack-lifecycle", "packs", "skills", "history", "release/publish", "release/export", "mcp/inspect", "tests/active-runs",
);
const { trustPacksDirectory } = await import("./trust-packs.mjs");

const subjects = (dir) => gitIn(dir, "log", "--format=%an|%s").trim().split("\n");

async function publishedPack(t) {
  const env = setupStudioEnv(t);
  trustPacksDirectory({ agentDir: join(env.base, "agent"), packsDir: env.packsDir });
  await packs.createPack({ id: "lr", title: "Revue" }, alice);
  const skill = await skills.createSkill("lr", { name: "openalex-search", description: "Recherche dans OpenAlex." }, alice);
  await skills.saveSkill("lr", "openalex-search", { mode: "form", description: "Recherche précise dans OpenAlex.", body: "# Corps\n" }, skill.hash, bob);
  await skills.createSkill("lr", { name: "brouillon", description: "À jeter." }, alice);
  await skills.deleteSkill("lr", "brouillon", alice);
  await publish.publishVersion("lr", { note: "Première", acceptWarnings: true }, alice, inspect.createFakeInspector({}));
  return env;
}

test("a rename moves the folder in one version and keeps the history, deleted skills and published versions", async (t) => {
  const { packsDir } = await publishedPack(t);
  const before = packs.readPackMeta("lr");
  const meta = await lifecycle.renamePack("lr", "revue-litterature", bob);
  assert.deepEqual([meta.id, meta.formerIds, meta.title, meta.version], ["revue-litterature", ["lr"], before.title, before.version]);
  assert.ok(!existsSync(join(packsDir, "lr")));
  assert.equal(JSON.parse(readFileSync(join(packsDir, "revue-litterature/.studio/pack.json"), "utf8")).id, "revue-litterature");
  assert.equal(subjects(packsDir)[0], "Bob Durand|[revue-litterature] Renomme le pack lr en revue-litterature");
  assert.equal(gitIn(packsDir, "status", "--porcelain").trim(), "");
  assert.equal(packs.findRenamedPack("lr"), "revue-litterature", "the old address leads to the pack");

  // The pack's history goes back to its creation, without the rename's moves.
  const entries = await history.packHistory("revue-litterature");
  assert.match(entries[0].message, /Renomme le pack/);
  assert.deepEqual(entries[0].changes.map((change) => change.path), [".studio/pack.json"]);
  assert.match(entries.at(-1).message, /Crée le pack/);

  // A file's versions from before the rename can be read and restored.
  const skillFile = ".pi/skills/openalex-search/SKILL.md";
  const versions = await history.fileHistory("revue-litterature", skillFile);
  assert.equal(versions.length, 2);
  assert.equal(versions.at(-1).slug, "lr");
  const first = await history.fileAtVersion("revue-litterature", skillFile, versions.at(-1).rev);
  assert.match(first.content, /description: Recherche dans OpenAlex\./);
  await history.restoreFile("revue-litterature", skillFile, versions.at(-1).rev, alice);
  assert.match(readFileSync(join(packsDir, "revue-litterature", skillFile), "utf8"), /description: Recherche dans OpenAlex\./);

  // A skill deleted before the rename can come back.
  const [deleted] = await history.deletedSkills("revue-litterature");
  assert.deepEqual([deleted.name, deleted.slug], ["brouillon", "lr"]);
  await history.restoreDeletedSkill("revue-litterature", "brouillon", deleted.rev, alice);
  assert.ok(existsSync(join(packsDir, "revue-litterature/.pi/skills/brouillon/SKILL.md")));

  // Published versions stay listed and exportable; the next one does not reuse 0.1.
  const [published] = await publish.listPublishedVersions("revue-litterature");
  assert.deepEqual([published.version, published.tag, published.slug], ["0.1", "lr/v0.1", "lr"]);
  const zip = await exporter.exportVersion("revue-litterature", "0.1");
  assert.equal(zip.fileName, "revue-litterature-v0.1.zip");
  assert.ok(zip.content.length > 100);
  assert.equal(await publish.nextVersion("revue-litterature"), "0.2");
});

test("a rename is refused on a bad or taken slug, with changes made outside the Studio, or while the pack is at work", async (t) => {
  const { packsDir } = await publishedPack(t);
  await packs.createPack({ id: "autre", title: "Autre" }, alice);
  await assert.rejects(lifecycle.renamePack("lr", "Revue", alice), { code: "invalidPackId" });
  await assert.rejects(lifecycle.renamePack("lr", "autre", alice), { code: "packExists" });
  assert.equal((await lifecycle.renamePack("lr", "lr", alice)).id, "lr", "the same slug changes nothing");

  writeFileSync(join(packsDir, "lr/AGENTS.md"), "modifié à la main");
  await assert.rejects(lifecycle.renamePack("lr", "revue", alice), { code: "renameExternalChanges" });
  gitIn(packsDir, "checkout", "--", "lr/AGENTS.md");

  activeRuns.markRunActive("lr", "run-1", new AbortController());
  await assert.rejects(lifecycle.renamePack("lr", "revue", alice), { code: "packBusyRun" });
  await assert.rejects(lifecycle.deletePack("lr", "lr", alice), { code: "packBusyRun" });
  activeRuns.markRunDone("lr", "run-1");
  assert.ok(existsSync(join(packsDir, "lr")), "nothing moved");

  // A slug that still names published versions is not given to another pack.
  await lifecycle.renamePack("lr", "revue", alice);
  await assert.rejects(packs.createPack({ id: "lr", title: "Nouveau" }, alice), { code: "slugUsedBefore" });
  await assert.rejects(lifecycle.renamePack("autre", "lr", alice), { code: "slugUsedBefore" });
  // …but the pack may take it back.
  const back = await lifecycle.renamePack("revue", "lr", alice);
  assert.deepEqual([back.id, back.formerIds], ["lr", ["revue"]]);
  assert.equal((await publish.listPublishedVersions("lr")).length, 1);
});

test("a deletion needs the slug typed, removes the folder in one version and leaves the tags", async (t) => {
  const { packsDir } = await publishedPack(t);
  await assert.rejects(lifecycle.deletePack("lr", "LR", alice), { code: "deleteConfirmMismatch" });
  writeFileSync(join(packsDir, "lr/notes.txt"), "fichier hors Studio");
  await lifecycle.deletePack("lr", "lr", bob);
  assert.ok(!existsSync(join(packsDir, "lr")));
  assert.equal(subjects(packsDir)[0], "Bob Durand|[lr] Supprime le pack");
  assert.equal(gitIn(packsDir, "status", "--porcelain").trim(), "");
  assert.deepEqual((await packs.listPacks()).map((pack) => pack.id), []);
  assert.equal(gitIn(packsDir, "tag", "--list").trim(), "lr/v0.1", "published versions stay in the repository");
  await assert.rejects(lifecycle.deletePack("lr", "lr", alice), { code: "packNotFound" });
  await assert.rejects(packs.createPack({ id: "lr", title: "Revue" }, alice), { code: "slugUsedBefore" });

  // A pack never published leaves its slug free.
  await packs.createPack({ id: "essai", title: "Essai" }, alice);
  await lifecycle.deletePack("essai", "essai", alice);
  assert.equal((await packs.createPack({ id: "essai", title: "Essai 2" }, alice)).title, "Essai 2");
});
