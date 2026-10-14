import { StudioError } from "@/lib/studio/errors";
import { identityOf, readJsonBody, studioHandle } from "@/lib/studio/route";
import { deleteSkill, readSkill, renameSkill, saveSkill, skillFiles } from "@/lib/studio/skills";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string; skill: string }> };

// GET /api/studio/packs/<pack>/skills/<skill> — the skill, its validation and its files.
export async function GET(_req: Request, { params }: Params) {
  const { pack, skill } = await params;
  return studioHandle(() => ({ skill: readSkill(pack, skill), files: skillFiles(pack, skill) }));
}

// PUT … { description, body, baseHash, note? } (form) or { raw, baseHash, note? } (advanced mode).
export async function PUT(req: Request, { params }: Params) {
  const { pack, skill } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    const input = typeof body.raw === "string"
      ? { mode: "raw" as const, raw: body.raw }
      : { mode: "form" as const, description: body.description, body: body.body };
    const result = await saveSkill(pack, skill, input, body.baseHash, identityOf(req), body.note);
    return { ...result, skill: readSkill(pack, skill) };
  });
}

// PATCH … { name } — renames the skill (folder and frontmatter).
export async function PATCH(req: Request, { params }: Params) {
  const { pack, skill } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    if (typeof body.name !== "string") throw new StudioError("invalidRequest", 400);
    return { skill: await renameSkill(pack, skill, body.name, identityOf(req)) };
  });
}

// DELETE … — deletes the skill; it stays in the pack's history.
export async function DELETE(req: Request, { params }: Params) {
  const { pack, skill } = await params;
  return studioHandle(async () => {
    await deleteSkill(pack, skill, identityOf(req));
    return { deleted: skill };
  });
}
