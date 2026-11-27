// « Discuter » through a real pi-web session, with a fake OpenAI-compatible
// server: the conversation opens in the pack with its default model and test
// tools, is named "[chat] …", is listed for the pack only, keeps its history,
// and is deleted.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { alice, loadStudio, setupStudioEnv } from "./studio-test-env.mjs";

const [packs, chat, rpc] = await loadStudio("packs", "chat", "../rpc-manager");
const { trustPacksDirectory } = await import("./trust-packs.mjs");

function fakeModel() {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const request = JSON.parse(body);
      requests.push(request);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = (data) => res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", model: request.model, ...data })}\n\n`);
      chunk({ choices: [{ index: 0, delta: { role: "assistant", content: `Réponse ${requests.length}` } }] });
      chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } });
      res.end("data: [DONE]\n\n");
    });
  });
  return {
    requests,
    listen: () => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port))),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function prompt(sessionId, message) {
  const session = rpc.getRpcSession(sessionId);
  const done = new Promise((resolve) => {
    const off = session.onEvent((event) => { if (event.type === "prompt_done") { off(); resolve(); } });
  });
  await session.send({ type: "prompt", message });
  await done;
}

test("a conversation with the pack's agent: default model, test tools, its name, its history, its deletion", { timeout: 60_000 }, async (t) => {
  const { base } = setupStudioEnv(t);
  const model = fakeModel();
  const port = await model.listen();
  t.after(() => model.close());
  const agentDir = join(base, "agent");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "models.json"), JSON.stringify({
    providers: { "llamacpp-test": { baseUrl: `http://127.0.0.1:${port}/v1`, api: "openai-completions", apiKey: "local", models: [{ id: "rapide" }, { id: "autre" }] } },
  }));
  trustPacksDirectory({ agentDir, packsDir: join(base, "packs") });
  await packs.createPack({ id: "theses", title: "Thèses" }, alice);
  await packs.createPack({ id: "autre", title: "Autre" }, alice);
  await packs.updatePackConfig("theses", { defaultModel: { provider: "llamacpp-test", modelId: "rapide" }, testTools: ["read", "grep"] }, alice);

  const started = await chat.startPackChat("theses", {}, "Alice Martin");
  t.after(() => rpc.getRpcSession(started.id)?.shutdown());
  assert.equal(started.cwd, join(base, "packs", "theses"));
  assert.match(started.name, /^Thèses · Alice Martin · \d{4}-\d\d-\d\d \d\d:\d\d$/);

  await prompt(started.id, "Bonjour");
  await prompt(started.id, "Et ensuite ?");
  assert.deepEqual(model.requests.map((request) => request.model), ["rapide", "rapide"], "the pack's default model");
  assert.deepEqual(model.requests[0].tools.map((tool) => tool.function.name).sort(), ["grep", "read"], "the pack's test tools");
  assert.equal(model.requests[1].messages.filter((message) => message.role !== "system").length, 3, "the conversation keeps its history");

  const [listed, ...others] = await chat.listPackChats("theses");
  assert.deepEqual(others, []);
  assert.deepEqual([listed.id, listed.name, listed.firstMessage], [started.id, started.name, "Bonjour"]);
  assert.deepEqual(await chat.listPackChats("autre"), [], "another pack does not list it");

  // Another model when asked.
  const second = await chat.startPackChat("theses", { model: { provider: "llamacpp-test", modelId: "autre" } }, "Bob");
  t.after(() => rpc.getRpcSession(second.id)?.shutdown());
  await prompt(second.id, "Avec l'autre modèle");
  assert.equal(model.requests.at(-1).model, "autre");
  await assert.rejects(chat.startPackChat("theses", { model: { provider: "", modelId: "x" } }, "Bob"), { code: "invalidModel" });

  await chat.deletePackChat("theses", started.id);
  assert.deepEqual((await chat.listPackChats("theses")).map((item) => item.id), [second.id]);
  await assert.rejects(chat.deletePackChat("theses", started.id), { code: "chatNotFound" });
  await assert.rejects(chat.deletePackChat("autre", second.id), { code: "chatNotFound" });
});
