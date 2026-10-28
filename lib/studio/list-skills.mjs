// PI Studio, local checks (TEST-LOCAL.md, V1): the skills Pi itself loads in a
// folder, without asking a model. A model asked "which skills do you have?"
// can invent names; this asks Pi's own resource loader (the SDK the CLI runs),
// with project trust read from trust.json as the CLI reads a saved decision.
//
//   node lib/studio/list-skills.mjs /workspace/packs/<pack>
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { DefaultResourceLoader, hasTrustRequiringProjectResources, ProjectTrustStore } from "@earendil-works/pi-coding-agent";

export async function listPackSkills({ cwd, agentDir }) {
  const dir = realpathSync(cwd);
  const store = new ProjectTrustStore(agentDir);
  const requiresTrust = hasTrustRequiringProjectResources(dir);
  const trusted = !requiresTrust || store.get(dir) === true;
  const loader = new DefaultResourceLoader({ cwd: dir, agentDir });
  await loader.reload(requiresTrust ? { resolveProjectTrust: async () => store.get(dir) === true } : undefined);
  const { skills, diagnostics } = loader.getSkills();
  return {
    dir,
    requiresTrust,
    trusted,
    skills: skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      scope: skill.filePath.startsWith(`${dir}${sep}`) ? "pack" : "global",
      path: skill.filePath,
    })),
    diagnostics: diagnostics.map((item) => ({ type: item.type, message: item.message, path: item.path })),
  };
}

async function main() {
  const cwd = resolve(process.argv[2] || process.cwd());
  const agentDir = resolve(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"));
  const result = await listPackSkills({ cwd, agentDir });
  const lines = [`Dossier : ${result.dir}`];
  lines.push(`Confiance : ${result.trusted ? "oui" : "NON : Pi ignore les consignes système et les skills de ce dossier"}`);
  lines.push(`Skills chargées par Pi : ${result.skills.length}`);
  for (const skill of result.skills) lines.push(`  - ${skill.name}${skill.scope === "global" ? " (globale, hors pack)" : ""} : ${skill.description}`);
  if (!result.skills.length) lines.push("  (aucune)");
  lines.push(`Diagnostics : ${result.diagnostics.length ? "" : "aucun"}`);
  for (const item of result.diagnostics) lines.push(`  - ${item.type} : ${item.message}${item.path ? ` (${item.path})` : ""}`);
  console.log(lines.join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[skills] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
