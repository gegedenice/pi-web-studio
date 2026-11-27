import { createPack, listPacks } from "@/lib/studio/packs";
import { identityOf, readJsonBody, studioHandle } from "@/lib/studio/route";

export const dynamic = "force-dynamic";

// GET /api/studio/packs — every pack of STUDIO_PACKS_DIR.
export async function GET() {
  return studioHandle(async () => ({ packs: await listPacks() }));
}

// POST /api/studio/packs { id, title, description? } — creates a pack and its first version.
export async function POST(req: Request) {
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    return { pack: await createPack({ id: body.id, title: body.title, description: body.description }, identityOf(req)) };
  }, 201);
}
