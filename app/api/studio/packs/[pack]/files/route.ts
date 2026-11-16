import { deleteSkillAnnexFile, readEditableFile, writeEditableFile } from "@/lib/studio/history";
import { StudioError } from "@/lib/studio/errors";
import { identityOf, readJsonBody, searchParam, studioHandle } from "@/lib/studio/route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// GET /api/studio/packs/<pack>/files?path=AGENTS.md — one editable file and its hash.
export async function GET(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(() => {
    const path = searchParam(req, "path");
    if (!path) throw new StudioError("invalidRequest", 400);
    return { file: readEditableFile(pack, path) };
  });
}

// PUT /api/studio/packs/<pack>/files { path, content, baseHash, note? } — saves it as a new version.
export async function PUT(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    if (typeof body.path !== "string") throw new StudioError("invalidRequest", 400);
    return { file: await writeEditableFile(pack, body.path, body.content, body.baseHash, identityOf(req), body.note) };
  });
}

// DELETE …/files?path=.pi/skills/<skill>/<file> — removes one of a skill's other files, as a version.
export async function DELETE(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    await deleteSkillAnnexFile(pack, searchParam(req, "path"), identityOf(req));
    return { deleted: true };
  });
}
