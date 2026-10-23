// PI Studio container setup: record the project-trust decision for the packs
// folder in Pi's trust.json, so Pi (CLI and pi-web) loads every pack's .pi/
// resources. pi-web reads only recorded decisions, never defaultProjectTrust
// (STUDIO-NOTES.md, gap E4); a decision on the folder covers every pack below.
//
// Plain JavaScript: docker/entrypoint.sh runs it with node at each start.
//   node lib/studio/trust-packs.mjs      (PI_CODING_AGENT_DIR, STUDIO_PACKS_DIR)
import { mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";

/**
 * Trusts `packsDir` exactly (by its real path, as Pi keys trust.json). Idempotent:
 * nothing is written when that decision is already there. Other entries are kept.
 * A recorded "do not trust" on the folder itself is replaced: the container exists
 * to run these packs.
 */
export function trustPacksDirectory({ agentDir, packsDir }) {
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(packsDir, { recursive: true });
  const path = realpathSync(packsDir);
  const store = new ProjectTrustStore(agentDir);
  const entry = store.getEntry(path);
  if (entry && entry.path === path && entry.decision === true) return { changed: false, path, previous: true };
  const previous = entry && entry.path === path ? entry.decision : null;
  store.set(path, true);
  return { changed: true, path, previous };
}

function main() {
  const agentDir = resolve(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"));
  const packsDir = resolve(process.env.STUDIO_PACKS_DIR || "/workspace/packs");
  const result = trustPacksDirectory({ agentDir, packsDir });
  const file = join(agentDir, "trust.json");
  if (!result.changed) console.log(`[trust] ${result.path} already trusted in ${file}`);
  else if (result.previous === false) console.log(`[trust] ${result.path} was distrusted; now trusted in ${file}`);
  else console.log(`[trust] ${result.path} trusted in ${file}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(`[trust] cannot record the trust decision: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
