// Test helper: a temporary packs repository and agent directory per test file.
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export function setupStudioEnv(t, extra = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "pi-studio-test-")));
  const previous = {};
  const values = {
    STUDIO_PACKS_DIR: join(base, "packs"),
    PI_CODING_AGENT_DIR: join(base, "agent"),
    STUDIO_TEMPLATES_DIR: join(repoRoot, "studio-templates"),
    STUDIO_USERS_FILE: join(base, "studio-users.json"),
    STUDIO_TRUSTED_PROXY: undefined,
    STUDIO_IDENTITY_HEADER: undefined,
    STUDIO_DEFAULT_USER: undefined,
    ...extra,
  };
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(base, { recursive: true, force: true });
  });
  return { base, packsDir: values.STUDIO_PACKS_DIR };
}

export function loadStudio(...modules) {
  const jiti = createJiti(import.meta.url, { alias: { "@": repoRoot }, interopDefault: true });
  return Promise.all(modules.map((name) => jiti.import(`./${name}.ts`)));
}

export function gitIn(dir, ...args) {
  return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" } });
}

export const alice = { id: "alice", name: "Alice Martin", email: "alice@example.org" };
export const bob = { id: "bob", name: "Bob Durand", email: "bob@example.org" };
