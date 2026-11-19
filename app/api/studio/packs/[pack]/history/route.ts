import { StudioError } from "@/lib/studio/errors";
import {
  deletedSkills,
  discardExternalChanges,
  fileAtVersion,
  fileHistory,
  keepExternalChanges,
  packHistory,
  restoreDeletedSkill,
  restoreFile,
} from "@/lib/studio/history";
import { identityOf, readJsonBody, searchParam, studioHandle } from "@/lib/studio/route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// GET …/history                — every version of the pack and its deleted skills
// GET …/history?path=<file>    — versions of one file
// GET …/history?path=<file>&rev=<version> — that file at that version
export async function GET(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    const path = searchParam(req, "path");
    const rev = searchParam(req, "rev");
    if (path && rev) return { version: await fileAtVersion(pack, path, rev) };
    if (path) return { versions: await fileHistory(pack, path) };
    return { versions: await packHistory(pack), deletedSkills: await deletedSkills(pack) };
  });
}

// POST …/history { action: "restore-file", path, rev } | { action: "restore-skill", name, rev }
//              | { action: "keep-external" } | { action: "discard-external" }
// Each one adds a version; nothing is rewritten.
export async function POST(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    const author = identityOf(req);
    switch (body.action) {
      case "restore-file":
        if (typeof body.path !== "string") throw new StudioError("invalidRequest", 400);
        return { file: await restoreFile(pack, body.path, body.rev, author) };
      case "restore-skill":
        await restoreDeletedSkill(pack, body.name, body.rev, author);
        return { restored: body.name };
      case "keep-external":
        await keepExternalChanges(pack, author);
        return { kept: true };
      case "discard-external":
        return { discarded: await discardExternalChanges(pack, author) };
      default:
        throw new StudioError("invalidRequest", 400);
    }
  });
}
