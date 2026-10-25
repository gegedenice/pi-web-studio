import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import { gitIn, repoRoot, setupStudioEnv } from "../../../lib/studio/studio-test-env.mjs";

const jiti = createJiti(import.meta.url, { alias: { "@": repoRoot }, interopDefault: true });
const packsRoute = await jiti.import("./packs/route.ts");
const packRoute = await jiti.import("./packs/[pack]/route.ts");
const filesRoute = await jiti.import("./packs/[pack]/files/route.ts");
const skillsRoute = await jiti.import("./packs/[pack]/skills/route.ts");
const skillRoute = await jiti.import("./packs/[pack]/skills/[skill]/route.ts");
const historyRoute = await jiti.import("./packs/[pack]/history/route.ts");
const meRoute = await jiti.import("./me/route.ts");

const url = (path) => `http://127.0.0.1:30141/api/studio${path}`;
const request = (method, path, body, headers = {}) => new Request(url(path), {
  method,
  headers: { "content-type": "application/json", ...headers },
  ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
});
const params = (values) => ({ params: Promise.resolve(values) });
const json = async (response) => ({ status: response.status, body: await response.json() });

function quiet(t) {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  t.after(() => { console.warn = warn; console.error = error; });
}

test("the lot 1 journey through the API: create, add a skill, save, restore, with the proxy's user", async (t) => {
  const { base, packsDir } = setupStudioEnv(t, { STUDIO_TRUSTED_PROXY: "true" });
  quiet(t);
  writeFileSync(join(base, "studio-users.json"), JSON.stringify({ geraldine: { name: "Géraldine", email: "g@example.org" } }));
  const as = { "remote-user": "geraldine" };

  assert.deepEqual((await json(await meRoute.GET(request("GET", "/me", undefined, as)))).body, { id: "geraldine", name: "Géraldine", fallback: false });

  let res = await json(await packsRoute.POST(request("POST", "/packs", { id: "literature-review", title: "Revue de littérature" }, as)));
  assert.equal(res.status, 201);
  res = await json(await packsRoute.POST(request("POST", "/packs", { id: "literature-review", title: "Encore" }, as)));
  assert.deepEqual([res.status, res.body.code], [409, "packExists"]);
  res = await json(await packsRoute.POST(request("POST", "/packs", "pas du json", as)));
  assert.deepEqual([res.status, res.body.code], [400, "invalidRequest"]);
  assert.equal((await json(await packsRoute.GET())).body.packs.length, 1);

  const pack = params({ pack: "literature-review" });
  res = await json(await skillsRoute.POST(request("POST", "/packs/literature-review/skills", { name: "openalex-search", description: "Recherche OpenAlex." }, as), pack));
  assert.equal(res.status, 201);
  const first = res.body.skill;

  const skill = params({ pack: "literature-review", skill: "openalex-search" });
  res = await json(await skillRoute.PUT(request("PUT", "/x", { description: "", body: "x", baseHash: first.hash }, as), skill));
  assert.deepEqual([res.status, res.body.code, res.body.issues.map((issue) => issue.code)], [422, "validationFailed", ["descriptionMissing"]]);
  res = await json(await skillRoute.PUT(request("PUT", "/x", { description: "Modifiée", body: first.body, baseHash: first.hash }, as), skill));
  assert.equal(res.status, 200);
  res = await json(await skillRoute.PUT(request("PUT", "/x", { description: "Encore", body: first.body, baseHash: first.hash }, as), skill));
  assert.deepEqual([res.status, res.body.code], [409, "conflict"]);

  res = await json(await historyRoute.GET(request("GET", "/x?path=.pi/skills/openalex-search/SKILL.md"), pack));
  assert.equal(res.body.versions.length, 2);
  const oldest = res.body.versions.at(-1).rev;
  res = await json(await historyRoute.GET(request("GET", `/x?path=.pi/skills/openalex-search/SKILL.md&rev=${oldest}`), pack));
  assert.match(res.body.version.content, /Recherche OpenAlex\./);
  res = await json(await historyRoute.POST(request("POST", "/x", { action: "restore-file", path: ".pi/skills/openalex-search/SKILL.md", rev: oldest }, as), pack));
  assert.equal(res.status, 200);
  assert.equal((await json(await skillRoute.GET(request("GET", "/x"), skill))).body.skill.description, "Recherche OpenAlex.");

  const log = gitIn(packsDir, "log", "--format=%an <%ae>|%s").trim().split("\n");
  assert.equal(log.length, 5);
  assert.ok(log.slice(0, 4).every((line) => line.startsWith("Géraldine <g@example.org>|[literature-review] ")), log.join("\n"));

  res = await json(await packRoute.GET(request("GET", "/x"), pack));
  assert.equal(res.body.pack.journey.design, "ready");
  assert.deepEqual(res.body.skills.map((item) => item.name), ["openalex-search"]);
});

test("files: only the editable ones, and paths that leave the pack are refused", async (t) => {
  setupStudioEnv(t);
  quiet(t);
  await packsRoute.POST(request("POST", "/packs", { id: "p", title: "P" }));
  const pack = params({ pack: "p" });
  let res = await json(await filesRoute.GET(request("GET", "/x?path=AGENTS.md"), pack));
  assert.equal(res.body.file.exists, true);
  res = await json(await filesRoute.PUT(request("PUT", "/x", { path: "AGENTS.md", content: "Nouveau\n", baseHash: res.body.file.hash, note: "Réécrit" }), pack));
  assert.equal(res.status, 200);
  res = await json(await filesRoute.GET(request("GET", "/x?path=../../etc/passwd"), pack));
  assert.deepEqual([res.status, res.body.code], [400, "invalidPath"]);
  res = await json(await filesRoute.GET(request("GET", "/x?path=.studio/pack.json"), pack));
  assert.deepEqual([res.status, res.body.code], [403, "fileNotEditable"]);
  res = await json(await packRoute.GET(request("GET", "/x"), params({ pack: "absent" })));
  assert.deepEqual([res.status, res.body.code], [404, "packNotFound"]);
  res = await json(await packRoute.GET(request("GET", "/x"), params({ pack: "../p" })));
  assert.deepEqual([res.status, res.body.code], [400, "invalidPackId"]);
});

test("a deleted skill is listed in the pack history and comes back from it", async (t) => {
  setupStudioEnv(t);
  quiet(t);
  await packsRoute.POST(request("POST", "/packs", { id: "p", title: "P" }));
  const pack = params({ pack: "p" });
  await skillsRoute.POST(request("POST", "/x", { import: "---\nname: crossref\ndescription: Vérifie les DOI.\n---\n\n# Crossref\n" }), pack);
  assert.equal((await json(await skillRoute.DELETE(request("DELETE", "/x"), params({ pack: "p", skill: "crossref" })))).status, 200);
  let res = await json(await historyRoute.GET(request("GET", "/x"), pack));
  assert.deepEqual(res.body.deletedSkills.map((item) => item.name), ["crossref"]);
  assert.ok(res.body.versions.length >= 3);
  res = await json(await historyRoute.POST(request("POST", "/x", { action: "restore-skill", name: "crossref", rev: res.body.deletedSkills[0].rev }), pack));
  assert.equal(res.status, 200);
  assert.deepEqual((await json(await skillsRoute.GET(request("GET", "/x"), pack))).body.skills.map((item) => item.name), ["crossref"]);
});

const testsRoute = await jiti.import("./packs/[pack]/tests/route.ts");
const suiteRoute = await jiti.import("./packs/[pack]/tests/[suite]/route.ts");
const runsRoute = await jiti.import("./packs/[pack]/runs/route.ts");
const runRoute = await jiti.import("./packs/[pack]/runs/[run]/route.ts");
const compareRoute = await jiti.import("./packs/[pack]/compare/route.ts");
const runner = await jiti.import("../../../lib/studio/tests/runner.ts");
const { createFakeExecutor } = await jiti.import("../../../lib/studio/tests/executor.ts");

test("lot 2 through the API: suites, a campaign's verdicts, comparison, test tools", async (t) => {
  const { packsDir } = setupStudioEnv(t);
  quiet(t);
  await packsRoute.POST(request("POST", "/packs", { id: "lr", title: "Revue" }));
  const pack = params({ pack: "lr" });

  let res = await json(await testsRoute.POST(request("POST", "/packs/lr/tests", { name: "Pas Un Nom" }), pack));
  assert.deepEqual([res.status, res.body.code], [400, "invalidSuiteName"]);
  res = await json(await testsRoute.POST(request("POST", "/packs/lr/tests", { name: "recherche", titre: "Recherche" }), pack));
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.suite.cases.map((item) => item.id), ["R-01"]);
  res = await json(await testsRoute.POST(request("POST", "/packs/lr/tests", { name: "recherche" }), pack));
  assert.deepEqual([res.status, res.body.code], [409, "suiteExists"]);

  const suite = params({ pack: "lr", suite: "recherche" });
  const { hash } = (await json(await suiteRoute.GET(request("GET", "/x"), suite))).body.suite;
  res = await json(await suiteRoute.PUT(request("PUT", "/x", { meta: { titre: "Recherche" }, cases: [{ id: "R-01", requete: "" }, { id: "R-01", requete: "b" }], baseHash: hash }), suite));
  assert.deepEqual([res.status, res.body.code, res.body.issues.map((issue) => issue.code)], [422, "validationFailed", ["suiteQueryMissing", "suiteIdDuplicate"]]);
  res = await json(await suiteRoute.PUT(request("PUT", "/x", { meta: { titre: "Recherche" }, cases: [{ id: "R-01", requete: "a" }, { id: "R-02", requete: "b" }], baseHash: hash }), suite));
  assert.equal(res.status, 200);
  res = await json(await suiteRoute.PUT(request("PUT", "/x", { raw: "x", baseHash: hash }), suite));
  assert.deepEqual([res.status, res.body.code], [409, "conflict"]);
  assert.equal((await json(await testsRoute.GET(request("GET", "/x"), pack))).body.suites[0].caseCount, 2);

  res = await json(await runsRoute.POST(request("POST", "/packs/lr/runs", { model: { provider: "x" } }), pack));
  assert.deepEqual([res.status, res.body.code], [400, "invalidModel"]);

  const started = await runner.startCampaign("lr", { model: { provider: "fake", modelId: "m1" } }, { id: "alice", name: "Alice", email: "a@x" }, createFakeExecutor({ "R-01": { answer: "A" }, "R-02": { answer: "B" } }));
  await started.done;
  const runId = started.run.runId;
  const run = params({ pack: "lr", run: runId });
  res = await json(await runRoute.GET(request("GET", "/x"), run));
  assert.deepEqual([res.body.active, res.body.unfinished, res.body.run.cases.map((item) => item.answer)], [false, [], ["A", "B"]]);
  res = await json(await runRoute.POST(request("POST", "/x", { action: "stop" }), run));
  assert.deepEqual([res.status, res.body.code], [409, "runNotActive"]);
  res = await json(await runRoute.POST(request("POST", "/x", { action: "rerun" }), run));
  assert.deepEqual([res.status, res.body.code], [400, "campaignEmpty"]);
  res = await json(await runRoute.PUT(request("PUT", "/x", { verdicts: [{ suite: "recherche", id: "R-01", verdict: "bien" }] }), run));
  assert.deepEqual([res.status, res.body.code], [400, "invalidVerdict"]);
  res = await json(await runRoute.PUT(request("PUT", "/x", { verdicts: [{ suite: "recherche", id: "R-01", verdict: "ok" }, { suite: "recherche", id: "R-02", verdict: "ko", comment: "Hors sujet" }] }), run));
  assert.deepEqual(res.body.run.cases.map((item) => [item.verdict, item.comment, item.reviewedBy]), [["ok", "", "studio"], ["ko", "Hors sujet", "studio"]]);
  res = await json(await runRoute.GET(request("GET", "/x"), params({ pack: "lr", run: "../x" })));
  assert.deepEqual([res.status, res.body.code], [400, "invalidRun"]);

  res = await json(await compareRoute.GET(request("GET", "/packs/lr/compare?suite=recherche"), pack));
  assert.deepEqual(res.body.comparison.columns.map((column) => column.model), ["fake/m1"]);
  assert.equal(res.body.comparison.cells["recherche/R-02"][runId].verdict, "ko");
  assert.equal((await json(await packRoute.GET(request("GET", "/x"), pack))).body.pack.journey.evaluate, "ready");
  assert.equal((await json(await runsRoute.GET(request("GET", "/x"), pack))).body.runs[0].reviewed, 2);

  res = await json(await packRoute.PATCH(request("PATCH", "/x", { testTools: ["read", "rm"] }), pack));
  assert.deepEqual([res.status, res.body.code], [400, "invalidTools"]);
  res = await json(await packRoute.PATCH(request("PATCH", "/x", { testTools: ["read", "grep"] }), pack));
  assert.deepEqual(res.body.meta.tests, { tools: ["read", "grep"] });
  res = await json(await packRoute.PATCH(request("PATCH", "/x", { testTools: null }), pack));
  assert.equal(res.body.meta.tests, undefined);

  const log = gitIn(packsDir, "log", "--format=%s", "--", "lr/tests", "lr/.studio/runs").trim().split("\n").map((line) => line.replace(/ \(version du .*\)$/, ""));
  assert.deepEqual(log, [`[lr] Verdicts de la campagne ${runId} (2 cas)`, `[lr] Campagne ${runId} : 2 cas, 2 terminés`, "[lr] Modifie suite recherche", "[lr] Crée suite recherche"]);
});

const mcpRoute = await jiti.import("./packs/[pack]/mcp/route.ts");
const mcpServerRoute = await jiti.import("./packs/[pack]/mcp/[server]/route.ts");
const mcpInspectRoute = await jiti.import("./packs/[pack]/mcp/[server]/inspect/route.ts");

test("lot 3 through the API: a server added, refused as stdio, switched, inspected without its token, deleted", async (t) => {
  const { packsDir } = setupStudioEnv(t);
  quiet(t);
  await packsRoute.POST(request("POST", "/packs", { id: "lr", title: "Revue" }));
  const pack = params({ pack: "lr" });
  const form = { name: "openalex", url: "https://mcp.example.fr/mcp", description: "", auth: "bearer-env", tokenVariable: "STUDIO_ROUTE_TOKEN", timeout: null };

  let res = await json(await mcpRoute.POST(request("POST", "/x", { server: { command: "npx", args: ["-y", "srv"] } }), pack));
  assert.deepEqual([res.status, res.body.code, res.body.params], [422, "mcpTransportRefused", { transport: "stdio" }]);
  res = await json(await mcpRoute.POST(request("POST", "/x", { server: { ...form, url: "npx -y srv" } }), pack));
  assert.deepEqual([res.status, res.body.code, res.body.issues.map((issue) => issue.code)], [422, "validationFailed", ["urlCommand"]]);
  res = await json(await mcpRoute.POST(request("POST", "/x", { server: form }), pack));
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.server.form.tokenVariable, "STUDIO_ROUTE_TOKEN");

  const server = params({ pack: "lr", server: "openalex" });
  res = await json(await mcpServerRoute.PATCH(request("PATCH", "/x", { enabled: false }), server));
  assert.equal(res.body.server.enabled, false);
  res = await json(await mcpServerRoute.PATCH(request("PATCH", "/x", { enabled: true }), server));
  res = await json(await mcpInspectRoute.POST(request("POST", "/x", {}), server));
  assert.equal(res.body.inspection.state, "variable-missing");
  res = await json(await mcpRoute.GET(request("GET", "/x"), pack));
  assert.deepEqual(res.body.servers.map((item) => [item.name, item.enabled, item.tokenVariableSet]), [["openalex", true, false]]);
  res = await json(await mcpServerRoute.PUT(request("PUT", "/x", { server: { ...form, description: "Nouvelle" }, baseHash: "x" }), server));
  assert.deepEqual([res.status, res.body.code], [409, "conflict"]);
  res = await json(await mcpServerRoute.DELETE(request("DELETE", "/x"), server));
  assert.equal(res.status, 200);
  assert.equal(gitIn(packsDir, "log", "-1", "--format=%s").trim(), "[lr] Supprime serveur MCP openalex");
});
