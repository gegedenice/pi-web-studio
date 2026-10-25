import { StudioError } from "../errors";
import { archiveZip, showFile } from "../git";
import { readPackMeta } from "../packs";
import { assertPackId, MCP_CONFIG_FILE, repoPath, RUNS_DIR, SETTINGS_FILE } from "../paths";
import { listPublishedVersions } from "./publish";
import { findSecrets } from "./secrets";

// "Exporter" (STUDIO.md lot 4): a zip of the pack folder exactly as a published
// version holds it, under `<pack>-v<version>/`, without `.studio/runs/` unless
// asked, and refused when that version's configuration holds a secret.

export interface PackExport {
  fileName: string;
  content: Buffer;
}

export async function exportVersion(packId: string, versionInput: unknown, options: { runs?: boolean } = {}): Promise<PackExport> {
  const id = assertPackId(packId);
  readPackMeta(id);
  const versions = await listPublishedVersions(id);
  if (!versions.length) throw new StudioError("exportNoVersion", 404);
  const version = typeof versionInput === "string" && versionInput ? versions.find((item) => item.version === versionInput) : versions[0];
  if (!version) throw new StudioError("versionNotFound", 404);
  const secrets = findSecrets(await showFile(version.tag, repoPath(id, MCP_CONFIG_FILE)), await showFile(version.tag, repoPath(id, SETTINGS_FILE)));
  if (secrets.length) throw new StudioError("exportSecrets", 409, { version: version.version, where: secrets.map((item) => item.where).join(", ") });
  const prefix = `${id}-v${version.version}`;
  const content = await archiveZip(version.tag, repoPath(id), prefix, options.runs ? [] : [RUNS_DIR]);
  return { fileName: `${prefix}.zip`, content };
}
