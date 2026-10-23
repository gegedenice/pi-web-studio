import { packDetails, updatePackConfig } from "@/lib/studio/packs";
import { identityOf, readJsonBody, studioHandle } from "@/lib/studio/route";
import { listSkills } from "@/lib/studio/skills";
import { evaluateStep } from "@/lib/studio/tests/compare";
import { readRuns } from "@/lib/studio/tests/runs";
import { listSuiteNames } from "@/lib/studio/tests/suites";
import { hasErrors } from "@/lib/studio/validate";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// GET /api/studio/packs/<pack> — metadata, journey, skills and changes made outside the Studio.
export async function GET(_req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    const skills = listSkills(pack);
    const valid = skills.filter((skill) => !hasErrors(skill.issues)).length;
    const evaluate = evaluateStep(listSuiteNames(pack).length, await readRuns(pack));
    return { pack: await packDetails(pack, { valid, total: skills.length }, evaluate), skills };
  });
}

// PATCH /api/studio/packs/<pack> { title?, description?, status?, defaultModel?, note? } — Configuration.
export async function PATCH(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    const defaultModel = body.defaultModel === null
      ? null
      : body.defaultModel && typeof body.defaultModel === "object"
        ? body.defaultModel as { provider: unknown; modelId: unknown }
        : undefined;
    const meta = await updatePackConfig(pack, {
      title: body.title,
      description: body.description,
      status: body.status,
      defaultModel,
      testTools: body.testTools,
      note: body.note,
    }, identityOf(req));
    return { meta };
  });
}
