// The lot 2 acceptance criteria through real pi-web sessions, with a fake
// OpenAI-compatible server standing in for llama.cpp: a fresh session per
// case in the pack, the campaign's model, read-only tools, the "[test]" name,
// the skill in the system prompt, the transcript, and a timeout that does
// not stop the campaign.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { alice, loadStudio, setupStudioEnv } from "../studio-test-env.mjs";

const [packs, skills, suites, runner, runs, piExecutorModule, compare] = await loadStudio(
  "packs", "skills", "tests/suites", "tests/runner", "tests/runs", "tests/pi-executor", "tests/compare",
);
const { trustPacksDirectory } = await import("../trust-packs.mjs");

function fakeLlama() {
  const requests = [];
  const hanging = new Set();
  const server = createServer((req, res) => {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: "rapide" }, { id: "muet" }] }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const request = JSON.parse(body);
      requests.push(request);
      if (request.model === "muet") {
        hanging.add(res);
        res.on("close", () => hanging.delete(res));
        return; // never answers
      }
      const names = [...body.matchAll(/<name>([^<]+)<\/name>/g)].map((match) => match[1]);
      const text = `SKILLS: ${[...new Set(names)].join(", ") || "aucune"}`;
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = (data) => res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", model: request.model, ...data })}\n\n`);
      chunk({ choices: [{ index: 0, delta: { role: "assistant", content: text } }] });
      chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 120, completion_tokens: 7, total_tokens: 127 } });
      res.end("data: [DONE]\n\n");
    });
  });
  return {
    requests,
    listen: () => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port))),
    close: () => { for (const res of hanging) res.destroy(); return new Promise((resolve) => server.close(resolve)); },
  };
}

test("a campaign on two models through real pi-web sessions: answers, transcripts, timeout, comparison", { timeout: 120_000 }, async (t) => {
  const { base, packsDir } = setupStudioEnv(t);
  const llama = fakeLlama();
  const port = await llama.listen();
  t.after(() => llama.close());
  const agentDir = join(base, "agent");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "models.json"), JSON.stringify({
    providers: {
      "llamacpp-test": {
        baseUrl: `http://127.0.0.1:${port}/v1`,
        api: "openai-completions",
        apiKey: "local",
        models: [{ id: "rapide" }, { id: "muet" }],
      },
    },
  }));
  trustPacksDirectory({ agentDir, packsDir });

  await packs.createPack({ id: "lr", title: "Revue" }, alice);
  await skills.createSkill("lr", { name: "openalex-search", description: "Recherche dans OpenAlex." }, alice);
  const suite = await suites.createSuite("lr", { name: "recherche", titre: "Recherche" }, alice);
  await suites.saveSuite("lr", "recherche", {
    mode: "table",
    meta: {},
    cases: [1, 2, 3, 4].map((n) => ({ id: `R-0${n}`, requete: `Question ${n}`, attendu: `Attendu ${n}`, sources: "" })),
  }, suite.hash, alice);

  const fast = await runner.startCampaign("lr", { model: { provider: "llamacpp-test", modelId: "rapide" } }, alice, piExecutorModule.piExecutor);
  await fast.done;
  const run = await runs.readRun("lr", fast.run.runId);
  assert.deepEqual(run.cases.map((item) => item.status), ["termine", "termine", "termine", "termine"], JSON.stringify(run.cases.map((item) => item.error)));
  const first = run.cases[0];
  assert.equal(first.answer, "SKILLS: openalex-search", "the pack's skill reached the model's system prompt");
  assert.deepEqual(first.tokens, { input: 120, output: 7 });
  assert.ok(first.sessionId && first.sessionFile);
  const sessionFile = readFileSync(first.sessionFile, "utf8");
  assert.match(sessionFile, /"name":"\[test\] lr · R-01 · rapide"/);
  assert.match(sessionFile, /"customType":"pi-web:tool-selection","data":\{"version":1,"tools":\["read"\]\}/);
  assert.equal(llama.requests.length, 4, "one fresh session (one request) per case");
  for (const request of llama.requests) {
    assert.deepEqual(request.messages.filter((message) => message.role === "user").length, 1, "no history from another case");
    assert.deepEqual(request.tools?.map((tool) => tool.function.name) ?? [], ["read"]);
  }
  const transcript = readFileSync(join(packsDir, "lr/.studio/runs", run.runId, "cases/R-01.md"), "utf8");
  assert.match(transcript, /## Requête\n\n> Question 1/);
  assert.match(transcript, /## Réponse finale\n\nSKILLS: openalex-search/);

  // Second model never answers: each case times out, the campaign still ends.
  const silent = await runner.startCampaign("lr", {
    model: { provider: "llamacpp-test", modelId: "muet" },
    cases: ["recherche/R-01", "recherche/R-02"],
    timeoutMs: 10_000,
  }, alice, piExecutorModule.piExecutor);
  await silent.done;
  const timedOut = await runs.readRun("lr", silent.run.runId);
  assert.equal(timedOut.status, "terminee");
  assert.deepEqual(timedOut.cases.map((item) => [item.status, item.error]), [["timeout", "timeout"], ["timeout", "timeout"]]);

  const table = compare.compareRuns(await runs.readRuns("lr"));
  assert.deepEqual(table.columns.map((column) => column.model), ["llamacpp-test/rapide", "llamacpp-test/muet"]);
  assert.equal(table.cells["recherche/R-01"][silent.run.runId].status, "timeout");
  assert.equal(table.cells["recherche/R-03"][silent.run.runId], undefined);

  // Deleting a campaign with its test sessions removes their files from pi-web.
  const deleted = await runs.deleteRun("lr", fast.run.runId, alice, { sessions: true });
  assert.deepEqual([deleted.sessionsDeleted, deleted.sessionsKept], [4, 0]);
  assert.equal(existsSync(first.sessionFile), false);
});
