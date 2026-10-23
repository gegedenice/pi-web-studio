// PI Studio, lot 1 journey in a browser (STUDIO.md, lot 1 acceptance):
// create a pack, add a skill from the template, save it, change it, restore
// its first version, without any Git or file-format word on screen; then one
// version per save, with the right author, in the packs repository.
// Lot 2, when the script starts its own server: a suite of 4 cases, a campaign
// on each of two models served by a fake OpenAI-compatible server (real pi-web
// sessions), verdicts saved and read again after a reload, the comparison.
//
//   node e2e/studio.mjs                     starts its own `next dev` (no other dev server running)
//   STUDIO_E2E_URL=http://127.0.0.1:30141 STUDIO_E2E_PACKS_DIR=<its STUDIO_PACKS_DIR> node e2e/studio.mjs
//                                           uses a server already running with STUDIO_DEFAULT_USER=geraldine
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
}
