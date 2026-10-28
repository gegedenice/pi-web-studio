import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { alice, bob, gitIn, loadStudio, setupStudioEnv } from "../studio-test-env.mjs";

const [packs, suites, runs, runner, executor, compare, active] = await loadStudio(
  "packs", "tests/suites", "tests/runs", "tests/runner", "tests/executor", "tests/compare", "tests/active-runs",
);

const MODEL_A = { provider: "llamacpp-hote", modelId: "Qwen3-VL-8B-Instruct" };
const MODEL_B = { provider: "autre", modelId: "Mistral-Small" };
const FOUR_CASES = [
  { id: "RB-01", requete: "Question 1", attendu: "A1", sources: "OpenAlex" },
  { id: "RB-02", requete: "Question 2", attendu: "A2", sources: "" },
  { id: "RB-03", requete: "Question 3", attendu: "A3", sources: "" },
  { id: "RB-04", requete: "Question 4", attendu: "A4", sources: "" },
];

async function packWithSuite(t) {
  const env = setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "Revue" }, alice);
  const created = await suites.createSuite("lr", { name: "recherche-bibliographique", titre: "Recherche bibliographique" }, alice);
  await suites.saveSuite("lr", "recherche-bibliographique", { mode: "table", meta: { titre: "Recherche bibliographique" }, cases: FOUR_CASES }, created.hash, alice);
  return env;
}

test("suites: created from the template, saved from the table, ids unique in the whole pack", async (t) => {
  const { packsDir } = setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "Revue" }, alice);
  const created = await suites.createSuite("lr", { name: "recherche-bibliographique", titre: "Recherche : biblio" }, alice);
  assert.deepEqual(created.issues, []);
  assert.equal(created.titre, "Recherche : biblio");
  assert.deepEqual(created.cases.map((item) => item.id), ["RB-01"]);
  const second = await suites.createSuite("lr", { name: "rapport-bilan" }, alice);
  assert.deepEqual(second.cases.map((item) => item.id), ["RB2-01"], "the template's id is moved off the one already taken");

  await assert.rejects(
    suites.saveSuite("lr", "rapport-bilan", { mode: "table", meta: {}, cases: [{ id: "RB-01", requete: "q" }] }, second.hash, alice),
    (error) => error.code === "validationFailed" && error.issues[0].code === "suiteIdTaken",
  );
  const saved = await suites.saveSuite("lr", "rapport-bilan", { mode: "table", meta: { skill: "absente" }, cases: [{ id: "RAP-1", requete: "q | avec barre" }] }, second.hash, bob, "Première question");
  assert.deepEqual(saved.issues.map((issue) => issue.code), ["suiteSkillUnknown"], "a warning does not block");
  assert.equal(saved.cases[0].requete, "q | avec barre");
  assert.match(gitIn(packsDir, "log", "-1", "--format=%an|%s").trim(), /^Bob Durand\|\[lr\] Première question$/);

  await suites.renameSuite("lr", "rapport-bilan", "rapport", alice);
  assert.deepEqual(suites.listSuites("lr").map((item) => item.name), ["rapport", "recherche-bibliographique"]);
  await suites.deleteSuite("lr", "rapport", alice);
  assert.deepEqual(suites.listSuites("lr").map((item) => [item.name, item.caseCount]), [["recherche-bibliographique", 1]]);
});

test("a campaign runs every case in order, records results, transcripts and one version at the end", async (t) => {
  const { packsDir } = await packWithSuite(t);
  const calls = [];
  const fake = executor.createFakeExecutor({ "RB-02": { fail: "model unreachable" } }, calls);
  const started = await runner.startCampaign("lr", { model: MODEL_A, thinkingLevel: "low" }, alice, fake);
  assert.equal(started.run.status, "en-cours");
  assert.equal(started.run.packCommit, gitIn(packsDir, "rev-parse", "--short=7", "HEAD").trim());
  await started.done;

  assert.deepEqual(calls.map((call) => [call.caseId, call.tools.join(","), call.thinkingLevel, call.sessionName]), [
    ["RB-01", "read", "low", "[test] lr · RB-01 · Qwen3-VL-8B-Instruct"],
    ["RB-02", "read", "low", "[test] lr · RB-02 · Qwen3-VL-8B-Instruct"],
    ["RB-03", "read", "low", "[test] lr · RB-03 · Qwen3-VL-8B-Instruct"],
    ["RB-04", "read", "low", "[test] lr · RB-04 · Qwen3-VL-8B-Instruct"],
  ]);
  const run = await runs.readRun("lr", started.run.runId);
  assert.equal(run.status, "terminee");
  assert.deepEqual(run.cases.map((item) => item.status), ["termine", "erreur", "termine", "termine"]);
  assert.equal(run.cases[1].error, "model unreachable", "a failed case does not stop the campaign");
  assert.equal(run.cases[0].answer, "Réponse de Qwen3-VL-8B-Instruct à RB-01");
  const transcript = readFileSync(join(packsDir, "lr", ".studio/runs", run.runId, "cases/RB-01.md"), "utf8");
  assert.match(transcript, /^# RB-01 — recherche-bibliographique/);
  assert.match(transcript, /## Réponse finale\n\nRéponse de Qwen3/);
  assert.match(gitIn(packsDir, "log", "-1", "--format=%an|%s").trim(), new RegExp(`^Alice Martin\\|\\[lr\\] Campagne ${run.runId} : 4 cas, 3 terminés, 1 en erreur$`));
  assert.equal(gitIn(packsDir, "status", "--porcelain").trim(), "");
});

test("a case over the timeout is marked timeout and the campaign goes on", async (t) => {
  await packWithSuite(t);
  const fake = executor.createFakeExecutor({ "RB-01": { hang: true } });
  const started = await runner.startCampaign("lr", { model: MODEL_A, timeoutMs: 10_000 }, alice, fake);
  await started.done;
  const run = await runs.readRun("lr", started.run.runId);
  assert.deepEqual(run.cases.map((item) => item.status), ["timeout", "termine", "termine", "termine"]);
  assert.equal(run.options.timeoutMs, 10_000);
});

test("cases can run several at a time, and a campaign can be stopped", async (t) => {
  await packWithSuite(t);
  const calls = [];
  const fake = executor.createFakeExecutor({ "RB-01": { delayMs: 300 }, "RB-02": { delayMs: 300 }, "RB-03": { delayMs: 300 }, "RB-04": { delayMs: 300 } }, calls);
  const started = await runner.startCampaign("lr", { model: MODEL_A, concurrency: 2 }, alice, fake);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(calls.length, 2, "two cases started together");
  assert.ok(active.isRunActive("lr", started.run.runId));
  assert.deepEqual(await packs.externalChanges("lr"), [], "a running campaign's files are not 'changed outside the Studio'");
  await runner.stopCampaign("lr", started.run.runId);
  await started.done;
  const run = await runs.readRun("lr", started.run.runId);
  assert.equal(run.status, "arretee");
  assert.ok(run.cases.every((item) => item.status === "erreur" && item.error === "stopped"));
  assert.deepEqual(runner.unfinishedCases(run).length, 4);
  await assert.rejects(runner.stopCampaign("lr", started.run.runId), { code: "runNotActive" });
});

test("a subset of cases, the pack's test tools, and refusals before anything is written", async (t) => {
  await packWithSuite(t);
  await packs.updatePackConfig("lr", { testTools: ["read", "grep"] }, alice);
  const calls = [];
  const started = await runner.startCampaign("lr", { model: MODEL_A, cases: ["recherche-bibliographique/RB-03"] }, alice, executor.createFakeExecutor({}, calls));
  await started.done;
  assert.deepEqual(calls.map((call) => [call.caseId, call.tools]), [["RB-03", ["read", "grep"]]]);
  await assert.rejects(runner.startCampaign("lr", { model: { provider: "x" } }, alice, executor.createFakeExecutor()), { code: "invalidModel" });
  await assert.rejects(runner.startCampaign("lr", { model: MODEL_A, cases: ["nope/X"] }, alice, executor.createFakeExecutor()), { code: "campaignEmpty" });
  await assert.rejects(runner.startCampaign("lr", { model: MODEL_A, timeoutMs: 5 }, alice, executor.createFakeExecutor()), { code: "invalidRequest" });
  await assert.rejects(packs.updatePackConfig("lr", { testTools: ["read", "rm"] }, alice), { code: "invalidTools" });
});

test("verdicts are saved as versions, survive a restart, and feed the comparison of two models", async (t) => {
  const { packsDir } = await packWithSuite(t);
  const first = await runner.startCampaign("lr", { model: MODEL_A }, alice, executor.createFakeExecutor());
  await first.done;
  const second = await runner.startCampaign("lr", { model: MODEL_B }, alice, executor.createFakeExecutor({ "RB-04": { fail: "x" } }));
  await second.done;
  assert.notEqual(first.run.runId, second.run.runId);

  await runs.saveVerdicts("lr", first.run.runId, [
    { suite: "recherche-bibliographique", id: "RB-01", verdict: "ok", comment: "Références correctes." },
    { suite: "recherche-bibliographique", id: "RB-02", verdict: "partiel" },
  ], bob);
  assert.match(gitIn(packsDir, "log", "-1", "--format=%an|%s").trim(), new RegExp(`^Bob Durand\\|\\[lr\\] Verdicts de la campagne ${first.run.runId} \\(2 cas\\)$`));
  await assert.rejects(runs.saveVerdicts("lr", first.run.runId, [{ suite: "recherche-bibliographique", id: "RB-01", verdict: "bof" }], bob), { code: "invalidVerdict" });

  // A restart: nothing in memory, everything read back from the files.
  const reread = await runs.readRun("lr", first.run.runId);
  assert.deepEqual(reread.cases.slice(0, 2).map((item) => [item.verdict, item.comment, item.reviewedBy]), [["ok", "Références correctes.", "bob"], ["partiel", "", "bob"]]);

  const table = compare.compareRuns(await runs.readRuns("lr"));
  assert.deepEqual(table.columns.map((column) => column.model), ["llamacpp-hote/Qwen3-VL-8B-Instruct", "autre/Mistral-Small"]);
  assert.equal(table.rows.length, 4);
  assert.equal(table.cells["recherche-bibliographique/RB-01"][first.run.runId].verdict, "ok");
  assert.equal(table.cells["recherche-bibliographique/RB-04"][second.run.runId].status, "erreur");
  assert.deepEqual(compare.compareRuns(await runs.readRuns("lr"), "autre-suite").columns, []);
  assert.deepEqual((await runs.listRuns("lr")).map((item) => [item.model.id, item.reviewed, item.total]), [["Mistral-Small", 0, 4], ["Qwen3-VL-8B-Instruct", 2, 4]]);
  assert.equal(compare.evaluateStep(1, await runs.readRuns("lr")), "progress");
});

test("a campaign left running by a stopped server is recorded as interrupted when read again", async (t) => {
  const { packsDir } = await packWithSuite(t);
  const started = await runner.startCampaign("lr", { model: MODEL_A }, alice, executor.createFakeExecutor({ "RB-01": { delayMs: 200 } }));
  const runFile = join(packsDir, "lr", ".studio/runs", started.run.runId, "run.json");
  await started.done;
  // Simulate the crash: the file says "en cours", no runner holds it.
  const data = JSON.parse(readFileSync(runFile, "utf8"));
  data.status = "en-cours";
  data.cases[2].status = "en-cours";
  data.cases[3].status = "en-attente";
  writeFileSync(runFile, JSON.stringify(data));
  const run = await runs.readRun("lr", started.run.runId);
  assert.equal(run.status, "interrompue");
  assert.deepEqual(run.cases.map((item) => item.status), ["termine", "termine", "erreur", "erreur"]);
  assert.deepEqual(runner.unfinishedCases(run), ["recherche-bibliographique/RB-03", "recherche-bibliographique/RB-04"]);
  assert.match(gitIn(packsDir, "log", "-1", "--format=%an|%s").trim(), /^PI Studio\|\[lr\] Campagne .* : interrompue$/);
  assert.ok(existsSync(runFile));
});

test("a campaign is deleted as one version, kept in the history; a running one is refused", async (t) => {
  const { packsDir } = await packWithSuite(t);
  const first = await runner.startCampaign("lr", { model: MODEL_A }, alice, executor.createFakeExecutor());
  await first.done;
  const slow = await runner.startCampaign("lr", { model: MODEL_B }, alice, executor.createFakeExecutor({ "RB-01": { hang: true } }));
  await assert.rejects(runs.deleteRun("lr", slow.run.runId, bob), { code: "runActive" });
  await runner.stopCampaign("lr", slow.run.runId);
  await slow.done;

  const deleted = await runs.deleteRun("lr", first.run.runId, bob, { sessions: true });
  assert.deepEqual(deleted, { runId: first.run.runId, sessionsDeleted: 0, sessionsKept: 0 }, "the fake executor opens no session");
  assert.equal(existsSync(join(packsDir, "lr/.studio/runs", first.run.runId)), false);
  assert.deepEqual((await runs.listRuns("lr")).map((item) => item.runId), [slow.run.runId]);
  assert.equal(gitIn(packsDir, "log", "-1", "--format=%an|%s").trim(), `Bob Durand|[lr] Supprime la campagne ${first.run.runId}`);
  assert.match(gitIn(packsDir, "show", `HEAD~1:lr/.studio/runs/${first.run.runId}/run.json`), /"runId"/, "the history keeps it");
  await assert.rejects(runs.deleteRun("lr", first.run.runId, bob), { code: "runNotFound" });
});
