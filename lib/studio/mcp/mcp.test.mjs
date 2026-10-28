import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { alice, bob, gitIn, loadStudio, setupStudioEnv } from "../studio-test-env.mjs";

const [policy, servers, inspect, packs, history] = await loadStudio("mcp/policy", "mcp/servers", "mcp/inspect", "packs", "history");

const form = (overrides = {}) => ({
  name: "openalex",
  url: "https://mcp.example.fr/mcp",
  description: "Découverte bibliographique.",
  auth: "bearer-env",
  tokenVariable: "OPENALEX_TOKEN",
  timeout: null,
  ...overrides,
});
const codes = (problems) => problems.map((problem) => problem.code);

test("the form's rules: Streamable HTTP addresses only, a variable name for the token, never PI_WEB_PASSWORD", () => {
  assert.deepEqual(policy.checkServerForm(form()), []);
  assert.deepEqual(codes(policy.checkServerForm(form({ url: "npx -y @modelcontextprotocol/server-filesystem ." }))), ["urlCommand"]);
  assert.deepEqual(codes(policy.checkServerForm(form({ url: "uvx" }))), ["urlCommand"]);
  assert.deepEqual(codes(policy.checkServerForm(form({ url: "ws://x/mcp" }))), ["urlScheme"]);
  assert.deepEqual(codes(policy.checkServerForm(form({ url: "https://u:p@x/mcp" }))), ["urlCredentials"]);
  assert.deepEqual(codes(policy.checkServerForm(form({ name: "Open Alex", tokenVariable: "mon-jeton" }))), ["serverNameInvalid", "variableInvalid"]);
  assert.deepEqual(codes(policy.checkServerForm(form({ tokenVariable: "PI_WEB_PASSWORD" }))), ["variableReserved"]);
  assert.deepEqual(codes(policy.checkServerForm(form({ timeout: 0 }))), ["timeoutInvalid"]);
  assert.deepEqual(policy.checkServerForm(form({ auth: "none", tokenVariable: "" })), []);
});

test("entries: written with exposure direct and the token as a reference, read back into the form, others kept outside", () => {
  const entry = policy.entryFromForm(form());
  assert.deepEqual(entry, {
    url: "https://mcp.example.fr/mcp",
    description: "Découverte bibliographique.",
    headers: { Authorization: "Bearer ${OPENALEX_TOKEN}" },
    exposure: "direct",
  });
  assert.deepEqual(policy.formFromEntry("openalex", entry).form, { ...form(), toolExposure: {} });
  const edited = policy.entryFromForm(form({ auth: "none", description: "", toolExposure: { delete_all: "hidden" } }), { ...entry, enabled: false });
  assert.deepEqual(edited, { url: "https://mcp.example.fr/mcp", exposure: "direct", enabled: false, toolExposure: { delete_all: "hidden" } });
  assert.deepEqual(policy.formFromEntry("x", { command: "npx", args: ["srv"] }), { outside: "stdio" });
  assert.deepEqual(policy.formFromEntry("x", { type: "sse", url: "https://x/sse" }), { outside: "sse" });
  assert.deepEqual(policy.formFromEntry("x", { url: "https://x/mcp", headers: { "X-Api-Key": "${K}" } }), { outside: "headers" });
  assert.deepEqual(policy.formFromEntry("x", { url: "https://x/mcp", headers: { Authorization: "Bearer abc123" } }), { outside: "headers" });
  assert.deepEqual(policy.formFromEntry("x", { url: "https://x/mcp", oauth: { clientId: "c" } }), { outside: "oauth" });
  assert.equal(policy.mcpNamespace("open-alex"), policy.mcpNamespace("open_alex"));
  assert.deepEqual(policy.rawMcpFileRefusal('{"mcpServers":{"fs":{"command":"npx"}}}'), { code: "mcpRawTransport", name: "fs", transport: "stdio" });
  assert.deepEqual(policy.rawMcpFileRefusal("{"), { code: "mcpRawInvalid" });
  assert.equal(policy.rawMcpFileRefusal('{"mcpServers":{"a":{"url":"https://x/mcp","oauth":{}}}}'), undefined);
});

test("servers are added, edited, renamed, switched and removed in .pi/mcp.json, one version each", async (t) => {
  const { base, packsDir } = setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "Revue" }, alice);
  const file = join(packsDir, "lr/.pi/mcp.json");

  await assert.rejects(servers.addMcpServer("lr", form({ url: "npx srv" }), alice), (error) => error.code === "validationFailed" && error.issues[0].code === "urlCommand");
  const added = await servers.addMcpServer("lr", form(), alice);
  assert.equal(added.form.tokenVariable, "OPENALEX_TOKEN");
  assert.equal(added.tokenVariableSet, false);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {
    mcpServers: { openalex: { url: "https://mcp.example.fr/mcp", description: "Découverte bibliographique.", headers: { Authorization: "Bearer ${OPENALEX_TOKEN}" }, exposure: "direct" } },
  });
  assert.doesNotMatch(readFileSync(file, "utf8"), /secret|valeur/);
  await assert.rejects(servers.addMcpServer("lr", form(), alice), { code: "serverExists" });

  await servers.addMcpServer("lr", form({ name: "hal", url: "https://api.hal.science/mcp", auth: "none", tokenVariable: "" }), bob);
  await assert.rejects(servers.updateMcpServer("lr", "openalex", form({ description: "x" }), "stale", alice), { code: "conflict" });
  const renamed = await servers.updateMcpServer("lr", "openalex", form({ name: "openalex-v2", timeout: 30 }), added.entryHash, alice);
  assert.equal(renamed.form.timeout, 30);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, "utf8")).mcpServers), ["openalex-v2", "hal"], "a rename keeps the order");

  await servers.setMcpServerEnabled("lr", "hal", false, alice);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).mcpServers.hal.enabled, false);
  await servers.setMcpServerEnabled("lr", "hal", true, alice);
  assert.equal("enabled" in JSON.parse(readFileSync(file, "utf8")).mcpServers.hal, false, "the SDK removes enabled: true");
  await servers.deleteMcpServer("lr", "hal", alice);
  await assert.rejects(servers.deleteMcpServer("lr", "hal", alice), { code: "serverNotFound" });

  const log = gitIn(packsDir, "log", "--format=%an|%s", "--", "lr/.pi/mcp.json").trim().split("\n");
  assert.deepEqual(log, [
    "Alice Martin|[lr] Supprime serveur MCP hal",
    "Alice Martin|[lr] Active serveur MCP hal",
    "Alice Martin|[lr] Désactive serveur MCP hal",
    "Alice Martin|[lr] Renomme serveur MCP openalex en openalex-v2",
    "Bob Durand|[lr] Ajoute serveur MCP hal",
    "Alice Martin|[lr] Ajoute serveur MCP openalex",
  ]);

  // A global server: listed, turned off in the pack by an override, and on again.
  mkdirSync(join(base, "agent"), { recursive: true });
  writeFileSync(join(base, "agent/mcp.json"), JSON.stringify({ mcpServers: { zotero: { url: "https://zotero.example/mcp" }, hal_api: { url: "https://hal.example/mcp", enabled: false } } }));
  await assert.rejects(servers.addMcpServer("lr", form({ name: "hal-api" }), alice), { code: "serverNameCollision" });
  let overview = await servers.listMcpServers("lr");
  assert.deepEqual(overview.globals.map((item) => [item.name, item.enabled, item.disabledInPack]), [["zotero", true, false], ["hal_api", false, false]]);
  await servers.setGlobalMcpServerInPack("lr", "zotero", false, alice);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).mcpServers.zotero, { enabled: false });
  overview = await servers.listMcpServers("lr");
  assert.deepEqual([overview.globals[0].disabledInPack, overview.servers.map((item) => item.name)], [true, ["openalex-v2"]]);
  await servers.setGlobalMcpServerInPack("lr", "zotero", true, alice);
  assert.equal("zotero" in JSON.parse(readFileSync(file, "utf8")).mcpServers, false);
});

test("an entry written by hand: shown outside the Studio, switchable, not editable; the raw editor refuses stdio", async (t) => {
  const { packsDir } = setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "Revue" }, alice);
  mkdirSync(join(packsDir, "lr/.pi"), { recursive: true });
  writeFileSync(join(packsDir, "lr/.pi/mcp.json"), `${JSON.stringify({ mcpServers: { fs: { command: "npx", args: ["srv"] } } }, null, 2)}\n`);
  gitIn(packsDir, "add", "-A");
  gitIn(packsDir, "-c", "user.name=x", "-c", "user.email=x@x", "commit", "-qm", "main");
  const [fs] = (await servers.listMcpServers("lr")).servers;
  assert.deepEqual([fs.name, fs.outside, fs.form], ["fs", "stdio", undefined]);
  await assert.rejects(servers.updateMcpServer("lr", "fs", form({ name: "fs" }), fs.entryHash, alice), { code: "serverOutside" });
  await assert.rejects(inspect.inspectMcpServer("lr", "fs", inspect.createFakeInspector({})), { code: "serverTransport" });
  await servers.setMcpServerEnabled("lr", "fs", false, alice);

  const doc = history.readEditableFile("lr", ".pi/mcp.json");
  await assert.rejects(history.writeEditableFile("lr", ".pi/mcp.json", '{"mcpServers":{"x":{"command":"uvx","args":["y"]}}}', doc.hash, alice), { code: "mcpRawTransport" });
  await assert.rejects(history.writeEditableFile("lr", ".pi/mcp.json", '{"mcpServers":{"x":{"type":"sse","url":"https://x/sse"}}}', doc.hash, alice), { code: "mcpRawTransport" });
  await history.writeEditableFile("lr", ".pi/mcp.json", '{\n  "mcpServers": {}\n}\n', doc.hash, alice);
});

test("inspection: remembered for the entry as it is, the Connecter step follows it", async (t) => {
  setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "Revue" }, alice);
  let overview = await servers.listMcpServers("lr");
  assert.equal(servers.connectStep(overview, false), "todo");
  assert.equal(servers.connectStep(overview, true), "ready", "a pack without MCP server can be ready");

  await servers.addMcpServer("lr", form(), alice);
  overview = await servers.listMcpServers("lr");
  assert.equal(servers.connectStep(overview, true), "progress");

  const calls = [];
  const fake = inspect.createFakeInspector({ openalex: { tools: [{ name: "search_works", readOnly: true, exposure: "direct", schema: "{}" }] } }, calls);
  let result = await inspect.inspectMcpServer("lr", "openalex", fake);
  assert.deepEqual([result.state, calls], ["variable-missing", []], "no connection without the token's variable");
  process.env.OPENALEX_TOKEN = "s3cr3t-value";
  t.after(() => { delete process.env.OPENALEX_TOKEN; });
  result = await inspect.inspectMcpServer("lr", "openalex", fake);
  assert.deepEqual([result.state, result.toolCount, calls], ["connected", 1, ["openalex"]]);
  overview = await servers.listMcpServers("lr");
  assert.equal(overview.servers[0].tokenVariableSet, true);
  assert.equal(overview.servers[0].inspection.ok, true);
  assert.equal(servers.connectStep(overview, true), "ready");

  await servers.updateMcpServer("lr", "openalex", form({ description: "Autre" }), overview.servers[0].entryHash, alice);
  overview = await servers.listMcpServers("lr");
  assert.equal(overview.servers[0].inspection, undefined, "a changed entry needs a new inspection");
  assert.equal(servers.connectStep(overview, true), "progress");
});

test("an OAuth server signed in from Pi Web: shown signed in, its needs-auth inspection recorded as such", async (t) => {
  const { base } = setupStudioEnv(t);
  await packs.createPack({ id: "lr", title: "Revue" }, alice);
  await servers.addMcpServer("lr", form({ name: "openalex-oauth", url: "https://mcp.openalex.org/mcp", auth: "none", tokenVariable: "" }), alice);
  const fake = inspect.createFakeInspector({ "openalex-oauth": { state: "needs-auth" } });
  assert.equal((await inspect.inspectMcpServer("lr", "openalex-oauth", fake)).state, "needs-auth");
  let [server] = (await servers.listMcpServers("lr")).servers;
  assert.deepEqual([server.inspection.state, server.inspection.ok, server.signedIn], ["needs-auth", false, undefined]);

  mkdirSync(join(base, "agent"), { recursive: true });
  writeFileSync(join(base, "agent/mcp-auth.json"), JSON.stringify({ "mcp__openalex_oauth|https://mcp.openalex.org/mcp": { tokens: { access_token: "jeton" } } }));
  const overview = await servers.listMcpServers("lr");
  [server] = overview.servers;
  assert.equal(server.signedIn, true);
  assert.equal(overview.packDir.endsWith("/packs/lr"), true);
  assert.doesNotMatch(JSON.stringify(overview), /jeton/, "the token never reaches the page");
});
