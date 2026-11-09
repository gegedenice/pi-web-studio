// Lot 3 acceptance through real pi-web sessions, without a real model or MCP
// server: a Streamable HTTP MCP server and an OpenAI-compatible model, both
// fake and in process. A server added with the Studio's form (Bearer token from
// an environment variable, exposure direct) is inspected, then a campaign case
// calls one of its tools as `mcp__<server>__<tool>`; with the pack's
// "read-only" choice the same call is blocked.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { alice, loadStudio, setupStudioEnv } from "../studio-test-env.mjs";

const [packs, servers, inspect, runner, runs, piExecutorModule] = await loadStudio(
  "packs", "mcp/servers", "mcp/inspect", "tests/runner", "tests/runs", "tests/pi-executor",
);
const { trustPacksDirectory } = await import("../trust-packs.mjs");

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

/** A Streamable HTTP MCP server answering with plain JSON (no SSE stream). */
function fakeMcp() {
  const calls = [];
  const server = createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const message = JSON.parse(body);
      calls.push({ method: message.method, authorization: req.headers.authorization, params: message.params });
      if (message.id === undefined) {
        res.writeHead(202).end();
        return;
      }
      const reply = (result) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
      };
      if (req.headers.authorization !== "Bearer jeton-de-test") {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32001, message: "forbidden" } }));
        return;
      }
      if (message.method === "initialize") {
        reply({ protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "biblio-test", version: "1.0.0" } });
      } else if (message.method === "tools/list") {
        reply({
          tools: [
            {
              name: "search_works",
              description: "Cherche des travaux.\nRenvoie identifiant et titre.",
              inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
            },
            { name: "get_work", description: "Lit un travail.", inputSchema: { type: "object", properties: { id: { type: "string" } } }, annotations: { readOnlyHint: true } },
          ],
        });
      } else if (message.method === "tools/call") {
        reply({ content: [{ type: "text", text: `W123 : Un article sur ${message.params.arguments.query}` }] });
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "unknown" } }));
      }
    });
  });
  return { calls, server };
}

/** A model that calls `mcp__biblio__search_works` first, then answers with what the tool returned. */
function fakeModel() {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ object: "list", data: [{ id: "outils" }] }));
        return;
      }
      const request = JSON.parse(body);
      requests.push(request);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = (data) => res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", model: request.model, ...data })}\n\n`);
      const toolResult = request.messages.find((message) => message.role === "tool");
      if (!toolResult) {
        chunk({ choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "mcp__biblio__search_works", arguments: "{\"query\":\"OpenAlex\"}" } }] } }] });
        chunk({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 50, completion_tokens: 5, total_tokens: 55 } });
      } else {
        const text = typeof toolResult.content === "string" ? toolResult.content : JSON.stringify(toolResult.content);
        chunk({ choices: [{ index: 0, delta: { role: "assistant", content: `Résultat : ${text}` } }] });
        chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 80, completion_tokens: 9, total_tokens: 89 } });
      }
      res.end("data: [DONE]\n\n");
    });
  });
  return { requests, server };
}

test("a server added with the form is inspected, then a test session calls its tool in direct exposure", { timeout: 120_000 }, async (t) => {
  const { base, packsDir } = setupStudioEnv(t);
  const mcp = fakeMcp();
  const model = fakeModel();
  const mcpPort = await listen(mcp.server);
  const modelPort = await listen(model.server);
  t.after(() => { mcp.server.closeAllConnections(); mcp.server.close(); model.server.closeAllConnections(); model.server.close(); });
  const agentDir = join(base, "agent");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "models.json"), JSON.stringify({
    providers: { "llamacpp-test": { baseUrl: `http://127.0.0.1:${modelPort}/v1`, api: "openai-completions", apiKey: "local", models: [{ id: "outils" }] } },
  }));
  trustPacksDirectory({ agentDir, packsDir });
  process.env.BIBLIO_TOKEN = "jeton-de-test";
  t.after(() => { delete process.env.BIBLIO_TOKEN; });

  await packs.createPack({ id: "lr", title: "Revue" }, alice);
  await servers.addMcpServer("lr", {
    name: "biblio",
    url: `http://127.0.0.1:${mcpPort}/mcp`,
    description: "Recherche bibliographique.",
    auth: "bearer-env",
    tokenVariable: "BIBLIO_TOKEN",
    timeout: null,
  }, alice);

  const inspection = await inspect.inspectMcpServer("lr", "biblio");
  assert.equal(inspection.state, "connected", inspection.error);
  assert.deepEqual(inspection.serverInfo, { name: "biblio-test", version: "1.0.0" });
  assert.deepEqual(inspection.tools.map((tool) => [tool.name, tool.readOnly, tool.exposure]), [["search_works", false, "direct"], ["get_work", true, "direct"]]);
  assert.equal(inspection.tools[0].description, "Cherche des travaux.\nRenvoie identifiant et titre.");
  assert.deepEqual(JSON.parse(inspection.tools[0].schema), { type: "object", properties: { query: { type: "string" } }, required: ["query"] });
  assert.ok(mcp.calls.every((call) => call.authorization === "Bearer jeton-de-test"), "the token comes from the variable");
  assert.equal(servers.connectStep(await servers.listMcpServers("lr"), true), "ready");

  // A one-case campaign: the model calls the server's tool, declared directly beside `read`.
  const { createSuite, saveSuite } = await loadStudio("tests/suites").then(([module]) => module);
  const suite = await createSuite("lr", { name: "outils", titre: "Outils" }, alice);
  await saveSuite("lr", "outils", { mode: "table", meta: {}, cases: [{ id: "O-01", requete: "Cherche OpenAlex", attendu: "W123", sources: "" }] }, suite.hash, alice);
  const first = await runner.startCampaign("lr", { model: { provider: "llamacpp-test", modelId: "outils" } }, alice, piExecutorModule.piExecutor);
  await first.done;
  const run = await runs.readRun("lr", first.run.runId);
  const [item] = run.cases;
  assert.equal(item.status, "termine", item.error);
  assert.equal(run.options.mcpTools, "all");
  assert.deepEqual(item.toolCalls.map((call) => [call.name, call.isError, call.blocked ?? false]), [["mcp__biblio__search_works", false, false]]);
  assert.match(item.answer, /W123 : Un article sur OpenAlex/);
  assert.deepEqual(model.requests[0].tools.map((tool) => tool.function.name).sort(), ["mcp__biblio__get_work", "mcp__biblio__search_works", "read"]);
  assert.deepEqual(mcp.calls.filter((call) => call.method === "tools/call").map((call) => [call.params.name, call.params.arguments]), [["search_works", { query: "OpenAlex" }]]);

  // The pack keeps pi-web's rule: the same call, from a tool without readOnlyHint, is blocked.
  await packs.updatePackConfig("lr", { testMcpTools: "read-only" }, alice);
  const second = await runner.startCampaign("lr", { model: { provider: "llamacpp-test", modelId: "outils" } }, alice, piExecutorModule.piExecutor);
  await second.done;
  const blocked = (await runs.readRun("lr", second.run.runId)).cases[0];
  assert.equal(blocked.status, "termine", blocked.error);
  assert.deepEqual(blocked.toolCalls.map((call) => [call.name, call.blocked ?? false]), [["mcp__biblio__search_works", true]]);
  assert.equal(mcp.calls.filter((call) => call.method === "tools/call").length, 1, "the blocked call never reached the server");
});
