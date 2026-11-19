import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import { gitIn, loadStudio, repoRoot } from "./studio-test-env.mjs";

const { trustPacksDirectory } = await import("./trust-packs.mjs");
const [git] = await loadStudio("git");

function tempDir(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "pi-studio-container-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const readTrust = (agentDir) => JSON.parse(readFileSync(join(agentDir, "trust.json"), "utf8"));

test("the packs folder is trusted by its real path, once, keeping other decisions", (t) => {
  const base = tempDir(t);
  const agentDir = join(base, "agent");
  const packsDir = join(base, "workspace", "packs");
  mkdirSync(agentDir);
  writeFileSync(join(agentDir, "trust.json"), JSON.stringify({ "/somewhere/else": false }));

  const first = trustPacksDirectory({ agentDir, packsDir });
  assert.deepEqual(first, { changed: true, path: packsDir, previous: null });
  assert.deepEqual(readTrust(agentDir), { "/somewhere/else": false, [packsDir]: true });

  const before = readFileSync(join(agentDir, "trust.json"), "utf8");
  assert.equal(trustPacksDirectory({ agentDir, packsDir }).changed, false);
  assert.equal(readFileSync(join(agentDir, "trust.json"), "utf8"), before, "nothing rewritten");

  // What Pi itself reads: a pack below the folder inherits the decision.
  mkdirSync(join(packsDir, "lr", ".pi"), { recursive: true });
  assert.equal(new ProjectTrustStore(agentDir).get(join(packsDir, "lr")), true);
});

test("a linked packs folder is recorded under its target, and a recorded refusal is replaced", (t) => {
  const base = tempDir(t);
  const agentDir = join(base, "agent");
  const target = join(base, "real-packs");
  mkdirSync(target);
  symlinkSync(target, join(base, "packs"));
  mkdirSync(agentDir);
  writeFileSync(join(agentDir, "trust.json"), JSON.stringify({ [target]: false }));
  assert.deepEqual(trustPacksDirectory({ agentDir, packsDir: join(base, "packs") }), { changed: true, path: target, previous: false });
  assert.deepEqual(readTrust(agentDir), { [target]: true });
});

test("an unreadable trust.json is reported, never overwritten", (t) => {
  const base = tempDir(t);
  const agentDir = join(base, "agent");
  mkdirSync(agentDir);
  writeFileSync(join(agentDir, "trust.json"), "{ cassé");
  assert.throws(() => trustPacksDirectory({ agentDir, packsDir: join(base, "packs") }), /trust store/i);
  assert.equal(readFileSync(join(agentDir, "trust.json"), "utf8"), "{ cassé");
});

function runEntrypoint(base, packsDir) {
  const env = { ...process.env, HOME: base, GIT_CONFIG_GLOBAL: join(base, "gitconfig"), STUDIO_APP_DIR: repoRoot, STUDIO_PACKS_DIR: packsDir, PI_CODING_AGENT_DIR: join(base, "agent") };
  for (const key of Object.keys(env)) if (/^GIT_CONFIG_(COUNT|KEY_|VALUE_)/.test(key)) delete env[key];
  return execFileSync("bash", [join(repoRoot, "docker/entrypoint.sh"), "true"], { env, encoding: "utf8" });
}

test("the entrypoint trusts, initialises and configures the packs repository, idempotently", { skip: process.platform === "win32" }, (t) => {
  const base = tempDir(t);
  const packsDir = join(base, "workspace", "packs");
  runEntrypoint(base, packsDir);
  runEntrypoint(base, packsDir);

  assert.deepEqual(readTrust(join(base, "agent")), { [packsDir]: true });
  assert.equal(gitIn(packsDir, "rev-parse", "--show-toplevel").trim(), packsDir);
  assert.deepEqual(gitIn(packsDir, "log", "--format=%an <%ae>|%s").trim().split("\n"), ["PI Studio <studio@studio.invalid>|Initialise le dépôt des packs"]);
  assert.equal(readFileSync(join(packsDir, ".gitignore"), "utf8"), git.DEFAULT_GITIGNORE, "same .gitignore as the Studio would write");
  const safe = readFileSync(join(base, "gitconfig"), "utf8").match(/directory = .*/g);
  assert.deepEqual(safe, [`directory = ${packsDir}`]);
  assert.equal(gitIn(packsDir, "status", "--porcelain").trim(), "");
});

test("the entrypoint leaves an existing packs repository and its history alone", { skip: process.platform === "win32" }, (t) => {
  const base = tempDir(t);
  const packsDir = join(base, "packs");
  mkdirSync(packsDir);
  gitIn(packsDir, "init", "-q");
  writeFileSync(join(packsDir, "README.md"), "packs\n");
  gitIn(packsDir, "add", "README.md");
  gitIn(packsDir, "-c", "user.name=X", "-c", "user.email=x@y", "commit", "-q", "-m", "existant");
  const head = gitIn(packsDir, "rev-parse", "HEAD");
  runEntrypoint(base, packsDir);
  assert.equal(gitIn(packsDir, "rev-parse", "HEAD"), head);
  assert.equal(gitIn(packsDir, "status", "--porcelain").trim(), "");
});

test("list-skills reports what Pi's loader loads in a pack: nothing invented, nothing without trust", async (t) => {
  const { listPackSkills } = await import("./list-skills.mjs");
  const base = tempDir(t);
  const agentDir = join(base, "agent");
  const packsDir = join(base, "packs");
  const pack = join(packsDir, "literature-review");
  mkdirSync(join(pack, ".pi"), { recursive: true });
  writeFileSync(join(pack, ".pi", "settings.json"), "{}\n");
  trustPacksDirectory({ agentDir, packsDir });

  let result = await listPackSkills({ cwd: pack, agentDir });
  assert.deepEqual([result.trusted, result.skills], [true, []], "a pack without skills lists none");

  mkdirSync(join(pack, ".pi", "skills", "openalex-search"), { recursive: true });
  writeFileSync(join(pack, ".pi", "skills", "openalex-search", "SKILL.md"), "---\nname: openalex-search\ndescription: Recherche OpenAlex.\n---\n\n# OpenAlex\n");
  result = await listPackSkills({ cwd: pack, agentDir });
  assert.deepEqual(result.skills.map((skill) => [skill.name, skill.scope]), [["openalex-search", "pack"]]);

  writeFileSync(join(agentDir, "trust.json"), JSON.stringify({ [packsDir]: false }));
  result = await listPackSkills({ cwd: pack, agentDir });
  assert.deepEqual([result.trusted, result.skills], [false, []], "an untrusted pack's skills are not loaded");
});

test("list-skills prints its report from the command line", { skip: process.platform === "win32" }, (t) => {
  const base = tempDir(t);
  const pack = join(base, "packs", "p");
  mkdirSync(join(pack, ".pi", "skills", "verifier-doi"), { recursive: true });
  writeFileSync(join(pack, ".pi", "skills", "verifier-doi", "SKILL.md"), "---\nname: verifier-doi\ndescription: Vérifie les DOI.\n---\n");
  trustPacksDirectory({ agentDir: join(base, "agent"), packsDir: join(base, "packs") });
  const out = execFileSync(process.execPath, [join(repoRoot, "lib/studio/list-skills.mjs"), pack], { env: { ...process.env, PI_CODING_AGENT_DIR: join(base, "agent") }, encoding: "utf8" });
  assert.match(out, /Confiance : oui/);
  assert.match(out, /Skills chargées par Pi : 1\n {2}- verifier-doi : Vérifie les DOI\./);
});

test("compose.vps.yml: Traefik only, basic auth whose login is the identity, never without password or domain", async () => {
  const { load } = await import("js-yaml");
  const compose = load(readFileSync(join(repoRoot, "compose.vps.yml"), "utf8"));
  const service = compose.services["pi-studio"];
  assert.equal(service.ports, undefined, "no published port: Traefik only");
  assert.ok(!JSON.stringify(service.volumes).includes("docker.sock"));
  assert.ok(!JSON.stringify(service.volumes).includes("studio-users.dev.json"));
  assert.deepEqual(service.env_file, [{ path: ".env", required: true }]);
  assert.equal(service.environment.STUDIO_TRUSTED_PROXY, "true");
  assert.equal(service.environment.STUDIO_IDENTITY_HEADER, "Remote-User");
  assert.match(service.environment.PI_WEB_ALLOWED_HOSTS, /^\$\{STUDIO_DOMAIN:\?/);
  assert.match(service.environment.PI_WEB_PASSWORD, /^\$\{PI_WEB_PASSWORD:\?/, "an empty password stops Compose");
  assert.deepEqual(compose.networks, { web: { external: true } });
  const labels = service.labels;
  for (const label of [
    "traefik.http.routers.pi-studio.middlewares=pi-studio-auth",
    "traefik.http.middlewares.pi-studio-auth.basicauth.headerfield=Remote-User",
    // pi-web would take the browser's Basic header as guesses of its own password.
    "traefik.http.middlewares.pi-studio-auth.basicauth.removeheader=true",
    "traefik.http.services.pi-studio.loadbalancer.server.port=30141",
  ]) assert.ok(labels.includes(label), label);

  const env = readFileSync(join(repoRoot, ".env.vps.example"), "utf8");
  for (const key of ["STUDIO_DOMAIN", "STUDIO_DATA_DIR", "STUDIO_BASIC_AUTH_USERS", "PI_WEB_PASSWORD"]) assert.match(env, new RegExp(`^${key}=`, "m"), key);
  assert.match(env, /^STUDIO_BASIC_AUTH_USERS='[^']+'$/m, "single quotes keep the hashes' $ as they are");
  assert.doesNotMatch(/^STUDIO_BASIC_AUTH_USERS=.*$/m.exec(env)[0], /\$2y\$/, "no half hash to complete with a password");
  const users = JSON.parse(readFileSync(join(repoRoot, "docker/studio-users.example.json"), "utf8"));
  for (const login of /^STUDIO_BASIC_AUTH_USERS='([^']+)'$/m.exec(env)[1].split(",").map((entry) => entry.split(":")[0])) {
    assert.ok(users[login], `${login} is in studio-users.example.json`);
  }
});
