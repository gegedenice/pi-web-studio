import { studioHandle } from "@/lib/studio/route";
import { validatePack } from "@/lib/studio/release/validate";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// POST /api/studio/packs/<pack>/validate — the whole check, MCP inspections included (up to ~20 s).
export async function POST(_req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => ({ validation: await validatePack(pack) }));
}
