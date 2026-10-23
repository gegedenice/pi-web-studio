import { readPackMeta } from "@/lib/studio/packs";
import { resolvePackPath } from "@/lib/studio/paths";
import { studioHandle } from "@/lib/studio/route";
import { loadSkillsWithInstallInfo } from "@/lib/skills-service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// GET /api/studio/packs/<pack>/pi-check — the pack's skills as Pi itself loads
// them (pi-web's resource loader, project trust included), read-only.
export async function GET(_req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    readPackMeta(pack);
    const dir = resolvePackPath(pack);
    const { skills, diagnostics, projectResourcesLoaded } = await loadSkillsWithInstallInfo(dir);
    const own = skills.filter((skill) => skill.filePath.startsWith(`${dir}/`));
    return {
      projectResourcesLoaded,
      skills: own.map((skill) => skill.name).sort(),
      diagnostics: diagnostics
        .filter((item) => !item.path || item.path.startsWith(`${dir}/`))
        .map((item) => ({ type: item.type, message: item.message, path: item.path ? item.path.slice(dir.length + 1) : undefined })),
    };
  });
}
