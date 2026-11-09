import { identityOf, readJsonBody, studioHandle } from "@/lib/studio/route";
import { createSuite, listSuites } from "@/lib/studio/tests/suites";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// GET /api/studio/packs/<pack>/tests — the pack's test suites and their problems.
export async function GET(_req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(() => ({ suites: listSuites(pack) }));
}

// POST …/tests { name, titre? } — a suite from the template.
export async function POST(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    return { suite: await createSuite(pack, { name: body.name, titre: body.titre }, identityOf(req)) };
  }, 201);
}
