import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { alice, bob, gitIn, loadStudio, setupStudioEnv } from "../studio-test-env.mjs";

const [validate, publish, exporter, secrets, packs, skills, suites, servers, inspect, runner, executor, runs] = await loadStudio(
  "release/validate", "release/publish", "release/export", "release/secrets", "packs", "skills", "tests/suites",
  "mcp/servers", "mcp/inspect", "tests/runner", "tests/executor", "tests/runs",
);
const { trustPacksDirectory } = await import("../trust-packs.mjs");

const byId = (validation) => Object.fromEntries(validation.checks.map((check) => [check.id, check]));

async function readyPack(t, { trust = true } = {}) {
  const env = setupStudioEnv(t);
  if (trust) trustPacksDirectory({ agentDir: join(env.base, "agent"), packsDir: env.packsDir });
  await packs.createPack({ id: "lr", title: "Revue" }, alice);
  await skills.createSkill("lr", { name: "openalex-search", description: "Recherche dans OpenAlex." }, alice);
  return env;
}

test("secrets: literal tokens in .pi/mcp.json and credential keys in settings, never references", () => {
  assert.deepEqual(secrets.findMcpSecrets(JSON.stringify({ mcpServers: { a: { url: "https://x/mcp", headers: { Authorization: "Bearer ${TOKEN}" } } } })), []);
  assert.deepEqual(secrets.findMcpSecrets(JSON.stringify({ mcpServers: { a: { url: "https://x/mcp", headers: { Authorization: "Bearer abcdef0123456789" } } } })), [{ file: ".pi/mcp.json", where: "a › en-tête Authorization" }]);
  assert.deepEqual(secrets.findSettingsSecrets(JSON.stringify({ defaultModel: "Qwen3-VL-8B-Instruct-GGUF", defaultProvider: "llamacpp" })), []);
  assert.deepEqual(secrets.findSettingsSecrets(JSON.stringify({ providers: { x: { apiKey: "sk-live-0123456789abcdef" } } })), [{ file: ".pi/settings.json", where: "providers › x › apiKey" }]);
  assert.deepEqual(secrets.findSettingsSecrets(JSON.stringify({ apiKey: "$LLAMA_API_KEY" })), []);
});

test("validation: red, orange and green from the other lots' checks, MCP servers inspected now", async (t) => {
  const { packsDir } = await readyPack(t);
  let validation = await validate.validatePack("lr", inspect.createFakeInspector({}));
  let checks = byId(validation);
  assert.deepEqual(Object.keys(checks), ["trust", "instructions", "skills", "mcpFile", "mcpReach", "secrets", "suites", "campaign", "parents", "external"]);
  assert.equal(checks.trust.level, "ok");
  assert.equal(checks.instructions.level, "ok");
  assert.equal(checks.skills.level, "ok", JSON.stringify(checks.skills));
  assert.deepEqual([checks.mcpFile.key, checks.mcpReach.key], ["mcpNone", "mcpReachNone"]);
  assert.deepEqual([checks.suites.level, checks.campaign.level], ["warning", "warning"]);
  assert.equal(validation.level, "warning");

  // A stdio entry and a literal token: red. A server that fails: red.
  mkdirSync(join(packsDir, "lr/.pi"), { recursive: true });
  writeFileSync(join(packsDir, "lr/.pi/mcp.json"), JSON.stringify({ mcpServers: {
    fs: { command: "npx", args: ["srv"] },
    hal: { url: "https://api.hal.science/mcp", exposure: "direct" },
    leak: { url: "https://x.example/mcp", headers: { Authorization: "Bearer abcdef0123456789abcdef" } },
  } }, null, 2));
  const calls = [];
  validation = await validate.validatePack("lr", inspect.createFakeInspector({ hal: { state: "failed", error: "ECONNREFUSED" }, leak: { state: "connected", toolCount: 2 } }, calls));
  checks = byId(validation);
  assert.equal(validation.level, "error");
  assert.deepEqual([checks.mcpFile.level, checks.mcpFile.details.map((item) => item.key)], ["error", ["serverOutside.stdio", "serverOutsideOther"]]);
  assert.deepEqual(calls.sort(), ["hal", "leak"], "the stdio server is never connected");
  assert.deepEqual(checks.mcpReach.details.map((item) => [item.key, item.params.name]), [["inspect.failed", "hal"], ["inspectOk", "leak"]]);
  assert.deepEqual([checks.secrets.level, checks.secrets.details[0].params], ["error", { file: ".pi/mcp.json", where: "leak › en-tête Authorization" }]);
  assert.equal(checks.external.level, "warning", "the hand-written file is a change outside the Studio");
});

test("validation: an untrusted pack, a missing prompt, a broken suite, a parent AGENTS.md, a campaign with a KO", async (t) => {
  const { packsDir } = await readyPack(t, { trust: false });
  writeFileSync(join(packsDir, "lr/.pi/APPEND_SYSTEM.md"), "");
  writeFileSync(join(packsDir, "AGENTS.md"), "Pour tous les packs");
  const suite = await suites.createSuite("lr", { name: "recherche", titre: "Recherche" }, alice);
  await suites.saveSuite("lr", "recherche", { mode: "table", meta: {}, cases: [{ id: "R-01", requete: "Q", attendu: "", sources: "" }] }, suite.hash, alice);
  const started = await runner.startCampaign("lr", { model: { provider: "p", modelId: "m" } }, alice, executor.createFakeExecutor());
  await started.done;
  await runs.saveVerdicts("lr", started.run.runId, [{ suite: "recherche", id: "R-01", verdict: "ko" }], alice);
  writeFileSync(join(packsDir, "lr/tests/casse.md"), "pas de tableau");
  const checks = byId(await validate.validatePack("lr", inspect.createFakeInspector({})));
  assert.deepEqual([checks.trust.level, checks.instructions.key, checks.suites.level, checks.campaign.key, checks.parents.level], ["error", "promptMissing", "error", "campaignKo", "warning"]);
  assert.equal(checks.parents.details[0].params.path, join(packsDir, "AGENTS.md"));
});

test("publish: refused on red, on unsaved outside changes, on warnings not accepted; then version, status, commit and tag", async (t) => {
  const { packsDir } = await readyPack(t);
  const fake = inspect.createFakeInspector({});
  await assert.rejects(publish.publishVersion("lr", { note: "" }, alice, fake), { code: "noteMissing" });
  await assert.rejects(publish.publishVersion("lr", { note: "Première" }, alice, fake), { code: "publishWarnings" });

  writeFileSync(join(packsDir, "lr/AGENTS.md"), "modifié à la main");
  await assert.rejects(publish.publishVersion("lr", { note: "Première", acceptWarnings: true }, alice, fake), { code: "publishExternalChanges" });
  gitIn(packsDir, "checkout", "--", "lr/AGENTS.md");

  assert.equal(await publish.nextVersion("lr"), "0.1", "the first publication publishes the current version");
  const first = await publish.publishVersion("lr", { note: "Première version\npour les tests", acceptWarnings: true }, alice, fake);
  assert.deepEqual([first.version.version, first.version.tag, first.version.author, first.version.note, first.validated], ["0.1", "lr/v0.1", "Alice Martin", "Première version\npour les tests", false]);
  assert.equal(packs.readPackMeta("lr").status, "en-conception", "warnings left: the status does not change");
  assert.equal(gitIn(packsDir, "log", "-1", "--format=%an|%s").trim(), "Alice Martin|[lr] Publie la version 0.1");
  assert.equal(gitIn(packsDir, "rev-parse", "lr/v0.1^{commit}").trim(), gitIn(packsDir, "rev-parse", "HEAD").trim());

  assert.equal(await publish.nextVersion("lr"), "0.2");
  assert.equal(await publish.nextVersion("lr", "major"), "1.0");
  assert.deepEqual([publish.bumpVersion("0.9", "minor"), publish.bumpVersion("1", "minor"), publish.bumpVersion("1.2.3", "minor")], ["0.10", "1.1", "1.2.4"]);

  // All green: a suite, a fully judged campaign without KO; the status becomes "valide".
  const suite = await suites.createSuite("lr", { name: "recherche", titre: "Recherche" }, alice);
  await suites.saveSuite("lr", "recherche", { mode: "table", meta: {}, cases: [{ id: "R-01", requete: "Q", attendu: "", sources: "" }] }, suite.hash, alice);
  const started = await runner.startCampaign("lr", { model: { provider: "p", modelId: "m" } }, alice, executor.createFakeExecutor());
  await started.done;
  await runs.saveVerdicts("lr", started.run.runId, [{ suite: "recherche", id: "R-01", verdict: "ok" }], alice);
  const green = await publish.publishVersion("lr", { note: "Testée", step: "major" }, bob, fake);
  assert.deepEqual([green.version.version, green.validated, green.validation.level], ["1.0", true, "ok"]);
  assert.equal(packs.readPackMeta("lr").status, "valide");
  assert.deepEqual((await publish.listPublishedVersions("lr")).map((item) => [item.version, item.author]), [["1.0", "Bob Durand"], ["0.1", "Alice Martin"]]);

  // Red blocks.
  writeFileSync(join(packsDir, "lr/.pi/APPEND_SYSTEM.md"), "");
  gitIn(packsDir, "add", "-A");
  gitIn(packsDir, "-c", "user.name=x", "-c", "user.email=x@x", "commit", "-qm", "vide");
  await assert.rejects(publish.publishVersion("lr", { note: "x", acceptWarnings: true }, alice, fake), { code: "publishBlocked" });
});

test("export: the tagged version only, without campaigns unless asked, refused with a secret", async (t) => {
  const { base, packsDir } = await readyPack(t);
  const fake = inspect.createFakeInspector({});
  await assert.rejects(exporter.exportVersion("lr", null), { code: "exportNoVersion" });
  const suite = await suites.createSuite("lr", { name: "recherche", titre: "Recherche" }, alice);
  await suites.saveSuite("lr", "recherche", { mode: "table", meta: {}, cases: [{ id: "R-01", requete: "Q", attendu: "", sources: "" }] }, suite.hash, alice);
  const started = await runner.startCampaign("lr", { model: { provider: "p", modelId: "m" } }, alice, executor.createFakeExecutor());
  await started.done;
  await publish.publishVersion("lr", { note: "v0.1", acceptWarnings: true }, alice, fake);
  // Saved after the publication: not in the export of 0.1.
  await skills.createSkill("lr", { name: "apres", description: "Après la version." }, alice);

  const list = (content) => {
    const file = join(base, "out.zip");
    writeFileSync(file, content);
    return execFileSync("unzip", ["-Z1", file], { encoding: "utf8" }).trim().split("\n").filter((line) => !line.endsWith("/")).sort();
  };
  const plain = await exporter.exportVersion("lr", "0.1");
  assert.equal(plain.fileName, "lr-v0.1.zip");
  const files = list(plain.content);
  assert.ok(files.includes("lr-v0.1/AGENTS.md") && files.includes("lr-v0.1/.pi/skills/openalex-search/SKILL.md") && files.includes("lr-v0.1/tests/recherche.md") && files.includes("lr-v0.1/.studio/pack.json"), files.join("\n"));
  assert.equal(files.some((file) => file.includes(".studio/runs/")), false);
  assert.equal(files.some((file) => file.includes("skills/apres")), false);
  assert.ok(list((await exporter.exportVersion("lr", "0.1", { runs: true })).content).some((file) => file.startsWith("lr-v0.1/.studio/runs/")));
  await assert.rejects(exporter.exportVersion("lr", "9.9"), { code: "versionNotFound" });

  // A version whose configuration holds a literal token is not exported.
  writeFileSync(join(packsDir, "lr/.pi/settings.json"), JSON.stringify({ providers: { x: { apiKey: "sk-live-0123456789abcdef" } } }, null, 2));
  gitIn(packsDir, "add", "-A");
  gitIn(packsDir, "-c", "user.name=x", "-c", "user.email=x@x", "commit", "-qm", "fuite");
  gitIn(packsDir, "-c", "user.name=x", "-c", "user.email=x@x", "tag", "-a", "lr/v0.9", "-m", "à la main");
  await assert.rejects(exporter.exportVersion("lr", "0.9"), { code: "exportSecrets" });
  assert.ok(servers);
});
