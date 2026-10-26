import { identityOf, readJsonBody, studioHandle } from "@/lib/studio/route";
import { importSkillFolder } from "@/lib/studio/skill-import";
import { createSkill, importSkill, listSkills } from "@/lib/studio/skills";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// GET /api/studio/packs/<pack>/skills — the pack's skills and their validation.
export async function GET(_req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(() => ({ skills: listSkills(pack) }));
}

// POST /api/studio/packs/<pack>/skills { name, description } from the template,
// { import: "<SKILL.md>", name? } for a pasted or uploaded file, or
// { importFolder: [{ path, content (base64) }], name? } for a whole skill folder.
export async function POST(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    const author = identityOf(req);
    if (Array.isArray(body.importFolder)) return importSkillFolder(pack, { files: body.importFolder, name: body.name }, author);
    const skill = typeof body.import === "string"
      ? await importSkill(pack, { raw: body.import, name: body.name }, author)
      : await createSkill(pack, { name: body.name, description: body.description }, author);
    return { skill };
  }, 201);
}
