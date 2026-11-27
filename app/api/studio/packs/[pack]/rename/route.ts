import { renamePack } from "@/lib/studio/pack-lifecycle";
import { identityOf, readJsonBody, studioHandle } from "@/lib/studio/route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// POST /api/studio/packs/<pack>/rename { id } — moves the pack to a new slug, one version.
export async function POST(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    return { meta: await renamePack(pack, body.id, identityOf(req)) };
  });
}
