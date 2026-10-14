// PI Studio, lot 1 journey in a browser (STUDIO.md, lot 1 acceptance):
// create a pack, add a skill from the template, save it, change it, restore
// its first version, without any Git or file-format word on screen; then one
// version per save, with the right author, in the packs repository.
//
//   node e2e/studio.mjs                     starts its own `next dev` (no other dev server running)
//   STUDIO_E2E_URL=http://127.0.0.1:30141 STUDIO_E2E_PACKS_DIR=<its STUDIO_PACKS_DIR> node e2e/studio.mjs
//                                           uses a server already running with STUDIO_DEFAULT_USER=geraldine
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, "test-results/e2e-studio");
mkdirSync(artifacts, { recursive: true });
const FORBIDDEN = /\b(commit|branch|branche|HEAD|diff|JSON|YAML|stdio|cwd)\b/i;

let server;
let base = process.env.STUDIO_E2E_URL;
let packsDir = process.env.STUDIO_E2E_PACKS_DIR;
const packId = `revue-e2e-${Date.now().toString(36)}`;

async function startServer() {
  assert.ok(!existsSync(join(root, ".next/dev/lock")), "A dev server is running: set STUDIO_E2E_URL and STUDIO_E2E_PACKS_DIR to use it");
  const temp = mkdtempSync(join(tmpdir(), "pi-studio-e2e-"));
  packsDir = join(temp, "packs");
  mkdirSync(join(temp, "agent"), { recursive: true });
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
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) {
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), delay(10_000)]);
  }
}
