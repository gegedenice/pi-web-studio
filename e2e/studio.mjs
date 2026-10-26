// PI Studio, lot 1 journey in a browser (STUDIO.md, lot 1 acceptance):
// create a pack, add a skill from the template, save it, change it, restore
// its first version, without any Git or file-format word on screen; then one
// version per save, with the right author, in the packs repository.
// Lot 2, when the script starts its own server: a suite of 4 cases, a campaign
// on each of two models served by a fake OpenAI-compatible server (real pi-web
// sessions), verdicts saved and read again after a reload, the comparison.
// Lot 3, likewise: a command refused in the MCP form, a Streamable HTTP server
// (fake, Bearer token from an environment variable) added and inspected.
//
//   node e2e/studio.mjs                     starts its own `next dev` (no other dev server running)
//   STUDIO_E2E_URL=http://127.0.0.1:30141 STUDIO_E2E_PACKS_DIR=<its STUDIO_PACKS_DIR> node e2e/studio.mjs
//                                           uses a server already running with STUDIO_DEFAULT_USER=geraldine
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { trustPacksDirectory } from "../lib/studio/trust-packs.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, "test-results/e2e-studio");
mkdirSync(artifacts, { recursive: true });
const FORBIDDEN = /\b(commit|branch|branche|HEAD|diff|JSON|YAML|stdio|cwd)\b/i;

let server;
let base = process.env.STUDIO_E2E_URL;
let packsDir = process.env.STUDIO_E2E_PACKS_DIR;
const packId = `revue-e2e-${Date.now().toString(36)}`;
let llama;
let mcp;
const MCP_TOKEN = "jeton-e2e";

/** A Streamable HTTP MCP server answering in plain JSON, behind a Bearer token. */
async function startFakeMcp() {
  const http = createHttpServer((req, res) => {
    if (req.method !== "POST") return void res.writeHead(405).end();
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const message = JSON.parse(body);
      if (message.id === undefined) return void res.writeHead(202).end();
      if (req.headers.authorization !== `Bearer ${MCP_TOKEN}`) return void res.writeHead(401).end();
      const result = message.method === "initialize"
        ? { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "biblio-e2e", version: "2.1.0" } }
        : message.method === "tools/list"
          ? { tools: [
              { name: "search_works", description: "Cherche des travaux dans le catalogue.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
              { name: "get_work", description: "Lit une notice.", inputSchema: { type: "object", properties: { id: { type: "string" } } }, annotations: { readOnlyHint: true } },
            ] }
          : { content: [{ type: "text", text: "ok" }] };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    });
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  return http;
}

/** Answers every chat request at once: the model's id, then the skills it was shown. */
async function startFakeModels() {
  const http = createHttpServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ object: "list", data: [{ id: "rapide" }, { id: "autre" }] }));
        return;
      }
      const request = JSON.parse(body);
      const names = [...new Set([...body.matchAll(/<name>([^<]+)<\/name>/g)].map((match) => match[1]))];
      const text = `**${request.model}** : ${names.join(", ") || "aucune skill"}`;
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = (data) => res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", model: request.model, ...data })}\n\n`);
      chunk({ choices: [{ index: 0, delta: { role: "assistant", content: text } }] });
      chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 } });
      res.end("data: [DONE]\n\n");
    });
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  return http;
}

async function startServer() {
  assert.ok(!existsSync(join(root, ".next/dev/lock")), "A dev server is running: set STUDIO_E2E_URL and STUDIO_E2E_PACKS_DIR to use it");
  const temp = mkdtempSync(join(tmpdir(), "pi-studio-e2e-"));
  packsDir = join(temp, "packs");
  mkdirSync(join(temp, "agent"), { recursive: true });
  llama = await startFakeModels();
  mcp = await startFakeMcp();
  writeFileSync(join(temp, "agent/models.json"), JSON.stringify({
    providers: {
      "llamacpp-e2e": {
        baseUrl: `http://127.0.0.1:${llama.address().port}/v1`,
        api: "openai-completions",
        apiKey: "local",
        models: [{ id: "rapide" }, { id: "autre" }],
      },
    },
  }));
  trustPacksDirectory({ agentDir: join(temp, "agent"), packsDir });
  writeFileSync(join(temp, "users.json"), JSON.stringify({ geraldine: { name: "Géraldine E2E", email: "geraldine@example.org" } }));
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  base = `http://127.0.0.1:${port}`;
  const log = createWriteStream(join(artifacts, "server.log"));
  server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: join(temp, "agent"),
      PI_WEB_PASSWORD: "",
      STUDIO_PACKS_DIR: packsDir,
      STUDIO_DEFAULT_USER: "geraldine",
      STUDIO_USERS_FILE: join(temp, "users.json"),
      E2E_MCP_TOKEN: MCP_TOKEN,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/api/studio/packs`).catch(() => null);
    if (response?.ok) return;
    assert.equal(server.exitCode, null, "the server stopped; see test-results/e2e-studio/server.log");
    await delay(500);
  }
  throw new Error("server readiness timed out");
}

async function visibleTextIsPlain(page, step) {
  const text = await page.locator("body").innerText();
  const match = FORBIDDEN.exec(text);
  assert.equal(match, null, `${step}: "${match?.[0]}" is visible`);
}

let browser;
try {
  if (!base) await startServer();
  assert.ok(packsDir, "STUDIO_E2E_PACKS_DIR is required with STUDIO_E2E_URL");
  browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, locale: "en-US" });
  page.on("pageerror", (error) => { throw error; });

  // 1. Home, in French even for an English browser; create a pack.
  await page.goto(`${base}/studio`);
  await page.getByRole("button", { name: "Nouveau pack" }).first().click();
  await page.getByLabel("Titre").fill("Revue E2E");
  await page.getByLabel("Identifiant").fill(packId);
  await page.getByRole("button", { name: "Créer le pack" }).click();
  await page.waitForURL(new RegExp(`/studio/${packId}`));
  await page.getByText("Aucune skill dans ce pack.").waitFor();
  await visibleTextIsPlain(page, "empty skills");
  await page.screenshot({ path: join(artifacts, "1-pack.png"), fullPage: true });

  // 2. A skill from the template.
  await page.getByRole("button", { name: "Créer la première skill" }).click();
  await page.getByLabel("Nom", { exact: true }).fill("openalex-search");
  await page.getByLabel("Description").fill("Recherche des travaux dans OpenAlex.");
  await page.getByRole("button", { name: "Créer la skill" }).click();
  await page.getByRole("heading", { name: "openalex-search" }).waitFor();
  await page.getByText("Tout est enregistré").waitFor();

  // 3. Change it and save with the keyboard.
  const description = page.locator("#studio-skill-description");
  await description.fill("Recherche des travaux et des auteurs dans OpenAlex.");
  await page.getByText("Modifications non enregistrées").waitFor();
  const body = page.locator("#studio-skill-body");
  await body.click();
  await body.press("End");
  await body.press("Tab");
  assert.ok((await body.inputValue()).length > 0);
  await page.keyboard.press("Control+s");
  await page.getByText("Tout est enregistré").waitFor();
  await visibleTextIsPlain(page, "skill saved");
  await page.screenshot({ path: join(artifacts, "2-skill.png"), fullPage: true });

  // 4. A blocking error: an empty description is refused.
  await description.fill("");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByText("La description manque.").waitFor();
  await description.fill("Recherche des travaux et des auteurs dans OpenAlex.");

  // 5. Restore the first version.
  await page.getByRole("main").getByRole("button", { name: "Historique" }).click();
  await page.getByText("Versions de ce fichier").waitFor();
  await page.getByRole("button", { name: "Restaurer cette version" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Restaurer cette version" }).click();
  await page.waitForFunction(() => document.querySelector("#studio-skill-description")?.value === "Recherche des travaux dans OpenAlex.");
  await visibleTextIsPlain(page, "restored");
  await page.screenshot({ path: join(artifacts, "3-restored.png"), fullPage: true });

  // 6. The pack history and the validation list, also without jargon.
  await page.getByRole("navigation").getByRole("button", { name: "Historique" }).click();
  await page.getByRole("heading", { name: "Historique du pack" }).waitFor();
  await visibleTextIsPlain(page, "pack history");
  await page.getByRole("button", { name: "Valider" }).click();
  await page.getByRole("heading", { name: "Validation du pack" }).waitFor();
  await visibleTextIsPlain(page, "validation");
  await page.screenshot({ path: join(artifacts, "4-validation.png"), fullPage: true });

  // 7. One version per save, by the right author.
  const log = execFileSync("git", ["-C", packsDir, "log", "--format=%an|%s", "--", `${packId}/`], { encoding: "utf8" }).trim().split("\n");
  assert.deepEqual(log.map((line) => line.split("|")[1].replace(/ \(version du .*\)$/, "")), [
    `[${packId}] Restaure skill openalex-search`,
    `[${packId}] Modifie skill openalex-search`,
    `[${packId}] Crée skill openalex-search`,
    `[${packId}] Crée le pack`,
  ]);
  const authors = new Set(log.map((line) => line.split("|")[0]));
  assert.equal(authors.size, 1);
  assert.ok(["Géraldine E2E", "geraldine"].includes([...authors][0]), [...authors][0]);
  console.log(`studio e2e: ok (${log.length} versions by ${[...authors][0]}; screenshots in test-results/e2e-studio)`);

  // 8. Lot 2: a suite of 4 cases in the table editor.
  if (!llama) {
    console.log("studio e2e: lot 2 skipped (it needs the fake models of a server this script starts)");
  } else {
    await page.getByRole("dialog").getByRole("button", { name: "Fermer" }).click();
    await page.getByRole("navigation").getByRole("button", { name: "Tests" }).click();
    await page.getByText("Ce pack n'a pas encore de suite de tests.").waitFor();
    await visibleTextIsPlain(page, "no suite");
    await page.getByRole("button", { name: "Créer une première suite" }).click();
    await page.getByRole("dialog").getByLabel("Titre").fill("Recherche documentaire");
    await page.getByRole("button", { name: "Créer la suite" }).click();
    await page.getByRole("heading", { name: "Recherche documentaire" }).waitFor();
    for (let n = 0; n < 3; n++) await page.getByRole("button", { name: "Ajouter un cas" }).click();
    const queries = page.getByRole("textbox", { name: "Requête", exact: true });
    const expected = page.getByRole("textbox", { name: "Attendu", exact: true });
    for (let n = 0; n < 4; n++) {
      await queries.nth(n).fill(`Travaux récents sur le sujet ${n + 1}`);
      await expected.nth(n).fill(`Une liste de travaux sur le sujet ${n + 1}`);
    }
    assert.deepEqual(await page.getByRole("textbox", { name: "Identifiant", exact: true }).evaluateAll((inputs) => inputs.map((input) => input.value)), ["RD-01", "RD-02", "RD-03", "RD-04"]);
    await page.keyboard.press("Control+s");
    await page.getByText("Tout est enregistré").waitFor();
    await page.getByText("Aucun problème détecté.").waitFor();
    await visibleTextIsPlain(page, "suite saved");
    await page.screenshot({ path: join(artifacts, "5-suite.png"), fullPage: true });

    // 9. Two campaigns, one per model, in fresh pi-web sessions.
    const campaign = async (model) => {
      await page.getByRole("tab", { name: "Campagnes" }).click();
      await page.getByRole("button", { name: "Lancer une campagne" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Modèle par défaut").selectOption(`llamacpp-e2e/${model}`);
      await visibleTextIsPlain(page, "launch dialog");
      await dialog.getByRole("button", { name: "Lancer (4 cas)" }).click();
      await page.getByRole("heading", { name: `llamacpp-e2e/${model}` }).waitFor();
      await page.getByText("4 / 4 cas terminés").waitFor({ timeout: 120_000 });
      await page.locator(".studio-detail-pane").getByText("Terminée").waitFor({ timeout: 30_000 });
    };
    await campaign("rapide");
    const cases = page.locator(".studio-case");
    for (let n = 0; n < 4; n++) {
      await cases.nth(n).locator(".studio-case-head").click();
      if (n === 0) {
        await cases.nth(0).getByText("rapide : openalex-search").waitFor();
        await page.screenshot({ path: join(artifacts, "6-review.png"), fullPage: true });
      }
      await cases.nth(n).getByRole("button", { name: n === 3 ? "Partiel" : "OK", exact: true }).click();
    }
    await cases.nth(3).getByRole("textbox", { name: "Commentaire" }).fill("Il manque des auteurs.");
    assert.equal(await cases.nth(3).locator(".studio-case-columns .studio-subtitle").allInnerTexts().then((titles) => titles.includes("Sources attendues")), false, "no expected sources were written");
    await page.getByText("4 verdict(s) non enregistré(s)").waitFor();
    await visibleTextIsPlain(page, "review");
    await page.getByRole("button", { name: "Enregistrer les verdicts" }).click();
    await page.getByText("Verdicts enregistrés.").waitFor();
    await page.reload();
    await page.getByText("4 / 4 jugés").waitFor();
    await page.locator(".studio-case").nth(3).getByText("Partiel").waitFor();

    await campaign("autre");
    await page.getByRole("tab", { name: "Comparaison" }).click();
    await page.getByRole("button", { name: "llamacpp-e2e/rapide" }).waitFor();
    await page.getByRole("button", { name: "llamacpp-e2e/autre" }).waitFor();
    const table = page.locator(".studio-table.is-compare tbody tr");
    assert.equal(await table.count(), 4);
    assert.deepEqual(await table.nth(3).locator("td .studio-badge").allInnerTexts(), ["Partiel", "À juger"]);
    await visibleTextIsPlain(page, "comparison");
    await page.screenshot({ path: join(artifacts, "7-compare.png"), fullPage: true });

    // 10. The suite, each campaign and the verdicts are versions of the pack.
    const lot2 = execFileSync("git", ["-C", packsDir, "log", "--format=%s", "--", `${packId}/tests`, `${packId}/.studio/runs`], { encoding: "utf8" }).trim().split("\n")
      .map((line) => line.replace(/ \(version du .*\)$/, "").replace(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}_/, "<date>_"));
    assert.deepEqual(lot2, [
      `[${packId}] Campagne <date>_autre : 4 cas, 4 terminés`,
      `[${packId}] Verdicts de la campagne <date>_rapide (4 cas)`,
      `[${packId}] Campagne <date>_rapide : 4 cas, 4 terminés`,
      `[${packId}] Modifie suite recherche-documentaire`,
      `[${packId}] Crée suite recherche-documentaire`,
    ]);
    console.log("studio e2e: lot 2 ok (suite, two campaigns, verdicts, comparison)");

    // 11. Lot 3: a command is refused in the MCP form, a Streamable HTTP server is added and inspected.
    await page.getByRole("navigation").getByRole("button", { name: "MCP" }).click();
    await page.getByText("Ce pack n'a pas encore de serveur MCP.").waitFor();
    await page.getByRole("button", { name: "Nouveau serveur" }).click();
    await page.getByText("Transport verrouillé : Streamable HTTP.").waitFor();
    await page.getByLabel("Identifiant").fill("fichiers");
    await page.getByLabel("Adresse du serveur (endpoint MCP)").fill("npx -y @modelcontextprotocol/server-filesystem .");
    await page.getByText("Ceci ressemble à une commande").waitFor();
    await page.keyboard.press("Control+s");
    assert.equal(await page.locator(".studio-item-list .studio-item").count(), 0, "nothing was saved");
    await visibleTextIsPlain(page, "command refused");
    await page.screenshot({ path: join(artifacts, "8-mcp-refused.png"), fullPage: true });

    await page.getByLabel("Identifiant").fill("biblio");
    await page.getByLabel("Adresse du serveur (endpoint MCP)").fill(`http://127.0.0.1:${mcp.address().port}/mcp`);
    await page.getByLabel("Description").fill("Catalogue de la bibliothèque.");
    await page.getByLabel("Authentification").selectOption("bearer-env");
    await page.getByLabel("Nom de la variable d'environnement").fill("E2E_MCP_TOKEN");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.getByRole("heading", { name: "biblio" }).waitFor();
    await page.getByText("La variable est définie dans le conteneur.").waitFor();
    await page.locator(".studio-item-list").getByText("À inspecter").waitFor();
    await page.getByRole("button", { name: "Inspecter tools/list" }).click();
    await page.getByText("Connexion réussie : 2 outil(s).").waitFor({ timeout: 30_000 });
    await page.getByText("Serveur biblio-e2e, version 2.1.0.").waitFor();
    await page.locator(".studio-item-list").getByText("Inspecté").waitFor();
    await page.locator("summary", { hasText: "search_works" }).click();
    await page.getByText("Cherche des travaux dans le catalogue.").waitFor();
    await page.getByText('"required"').waitFor();
    await visibleTextIsPlain(page, "inspection");
    // pi-web's body never scrolls (app/globals.css): the Studio page must, down to the last tool.
    await page.locator("summary", { hasText: "get_work" }).click();
    const scroll = await page.locator(".studio-page").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      return { overflow: getComputedStyle(element).overflowY, scrolled: element.scrollTop > 0 };
    });
    assert.deepEqual(scroll, { overflow: "auto", scrolled: true });
    const last = await page.getByText("Lit une notice.").boundingBox();
    assert.ok(last && last.y + last.height <= 860, `the last tool is reachable (${JSON.stringify(last)})`);
    await page.screenshot({ path: join(artifacts, "9-mcp-inspected.png") });
    const mcpFile = JSON.parse(readFileSync(join(packsDir, packId, ".pi/mcp.json"), "utf8"));
    assert.deepEqual(mcpFile.mcpServers.biblio, {
      url: `http://127.0.0.1:${mcp.address().port}/mcp`,
      description: "Catalogue de la bibliothèque.",
      headers: { Authorization: "Bearer ${E2E_MCP_TOKEN}" },
      exposure: "direct",
    });
    assert.equal(execFileSync("git", ["-C", packsDir, "log", "-1", "--format=%s", "--", `${packId}/.pi/mcp.json`], { encoding: "utf8" }).trim(), `[${packId}] Ajoute serveur MCP biblio`);
    console.log("studio e2e: lot 3 ok (command refused, server added and inspected)");

    // 11 bis. A whole skill folder imported (SKILL.md, references, scripts), stored as it is.
    const skillDir = join(artifacts, "analyse-citations");
    mkdirSync(join(skillDir, "references"), { recursive: true });
    mkdirSync(join(skillDir, "scripts"), { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: analyse-citations\ndescription: Analyse les citations d'un article.\n---\n\nVoir [la méthode](references/methode.md).\n");
    writeFileSync(join(skillDir, "references/methode.md"), "# Méthode\n");
    writeFileSync(join(skillDir, "scripts/compte.py"), "print(1)\n");
    await page.getByRole("navigation").getByRole("button", { name: /^Skills/ }).click();
    await page.getByRole("button", { name: "Importer", exact: true }).click();
    const importDialog = page.getByRole("dialog");
    await importDialog.getByRole("button", { name: "Un dossier de skill complet" }).waitFor();
    await page.locator("#studio-import-folder").setInputFiles(skillDir);
    await importDialog.getByText("3 fichier(s)").waitFor();
    await importDialog.getByText(/Cette skill contient 1 script/).waitFor();
    await visibleTextIsPlain(page, "folder import");
    await importDialog.getByRole("button", { name: "Importer", exact: true }).click();
    await importDialog.getByText("La skill « analyse-citations » est importée (3 fichier(s)).").waitFor();
    await importDialog.getByRole("button", { name: "Ouvrir la skill" }).click();
    await page.getByRole("heading", { name: "analyse-citations" }).waitFor();
    assert.equal(readFileSync(join(packsDir, packId, ".pi/skills/analyse-citations/scripts/compte.py"), "utf8"), "print(1)\n");
    assert.equal(execFileSync("git", ["-C", packsDir, "log", "-1", "--format=%s"], { encoding: "utf8" }).trim(), `[${packId}] Importe skill analyse-citations`);
    console.log("studio e2e: skill folder import ok");

    // 12. Lot 4: validate (the MCP server is queried), publish 0.1 despite the warnings, export it.
    await page.getByRole("button", { name: "Valider", exact: true }).click();
    const checkDialog = page.getByRole("dialog");
    await checkDialog.getByText("Des points sont à vérifier, mais le pack peut être publié.").waitFor({ timeout: 60_000 });
    await checkDialog.getByText("Les 1 serveur(s) MCP actifs répondent.").waitFor();
    await checkDialog.getByText("Aucune valeur secrète en clair dans la configuration.").waitFor();
    await visibleTextIsPlain(page, "validation lot 4");
    await page.screenshot({ path: join(artifacts, "10-validation.png") });
    await checkDialog.getByRole("button", { name: "Publier une version…" }).click();
    const publishDialog = page.getByRole("dialog");
    await publishDialog.getByText("Version 0.1 (version en cours : 0.1)").waitFor();
    await publishDialog.getByLabel("Note de version (obligatoire)").fill("Première version testée sur deux modèles.");
    assert.equal(await publishDialog.getByRole("button", { name: "Publier la version 0.1" }).isDisabled(), true, "warnings must be accepted first");
    await publishDialog.getByText("Publier malgré les points à vérifier").click();
    await publishDialog.getByRole("button", { name: "Publier la version 0.1" }).click();
    await page.getByText("Version 0.1 publiée.").waitFor();
    await page.getByText("v0.1").first().waitFor();

    await page.getByRole("banner").getByRole("button", { name: "Exporter" }).click();
    const exportDialog = page.getByRole("dialog");
    await exportDialog.getByLabel("Version").waitFor();
    await visibleTextIsPlain(page, "export dialog");
    const [download] = await Promise.all([page.waitForEvent("download"), exportDialog.getByRole("button", { name: "Télécharger" }).click()]);
    assert.equal(download.suggestedFilename(), `${packId}-v0.1.zip`);
    const zipPath = join(artifacts, "export.zip");
    await download.saveAs(zipPath);
    const entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" }).trim().split("\n");
    for (const expected of ["AGENTS.md", ".pi/APPEND_SYSTEM.md", ".pi/mcp.json", ".pi/skills/openalex-search/SKILL.md", "tests/recherche-documentaire.md", ".studio/pack.json"]) {
      assert.ok(entries.includes(`${packId}-v0.1/${expected}`), `${expected} in the export`);
    }
    assert.equal(entries.some((entry) => entry.includes(".studio/runs/")), false, "no campaign results by default");
    await exportDialog.getByRole("button", { name: "Fermer" }).click();

    await page.getByRole("navigation").getByRole("button", { name: "Historique" }).click();
    await page.getByText("Versions publiées").waitFor();
    await page.getByText("Première version testée sur deux modèles.").waitFor();
    await visibleTextIsPlain(page, "published versions");
    await page.screenshot({ path: join(artifacts, "11-versions.png") });
    const tag = execFileSync("git", ["-C", packsDir, "tag", "-n1", "--list", `${packId}/v*`], { encoding: "utf8" }).trim();
    assert.match(tag, new RegExp(`^${packId}/v0\\.1\\s+Première version testée sur deux modèles\\.$`));
    console.log("studio e2e: lot 4 ok (validation, publication 0.1, export)");

    // 13. A campaign deleted, with its test sessions; the comparison keeps one column.
    await page.getByRole("navigation").getByRole("button", { name: "Tests" }).click();
    await page.getByRole("tab", { name: "Campagnes" }).click();
    await page.locator(".studio-item-list .studio-item", { hasText: "autre" }).click();
    await page.getByRole("heading", { name: "llamacpp-e2e/autre" }).waitFor();
    await page.locator(".studio-section-header").getByRole("button", { name: "Supprimer" }).click();
    const deleteDialog = page.getByRole("dialog");
    await deleteDialog.getByText("Supprimer aussi ses 4 session(s) de test dans Pi Web").click();
    await visibleTextIsPlain(page, "delete campaign");
    await deleteDialog.getByRole("button", { name: "Supprimer" }).click();
    await deleteDialog.waitFor({ state: "detached" });
    assert.equal(await page.locator(".studio-item-list .studio-item").count(), 1);
    await page.getByRole("tab", { name: "Comparaison" }).click();
    await page.getByRole("button", { name: "llamacpp-e2e/rapide" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "llamacpp-e2e/autre" }).count(), 0);
    assert.match(execFileSync("git", ["-C", packsDir, "log", "-1", "--format=%s"], { encoding: "utf8" }).trim(), new RegExp(`^\\[${packId}\\] Supprime la campagne .*_autre$`));
    console.log("studio e2e: campaign deletion ok");
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) {
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), delay(10_000)]);
  }
  llama?.closeAllConnections();
  llama?.close();
  mcp?.closeAllConnections();
  mcp?.close();
}
