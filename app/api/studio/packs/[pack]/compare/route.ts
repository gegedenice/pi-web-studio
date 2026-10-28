import { readPackMeta } from "@/lib/studio/packs";
import { searchParam, studioHandle } from "@/lib/studio/route";
import { compareRuns } from "@/lib/studio/tests/compare";
import { readRuns } from "@/lib/studio/tests/runs";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// GET …/compare?suite=<suite> — cases × campaigns with their verdicts.
export async function GET(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    readPackMeta(pack);
    return { comparison: compareRuns(await readRuns(pack), searchParam(req, "suite")) };
  });
}
