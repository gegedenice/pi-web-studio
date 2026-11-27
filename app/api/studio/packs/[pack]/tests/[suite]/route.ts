import { StudioError } from "@/lib/studio/errors";
import { identityOf, readJsonBody, studioHandle } from "@/lib/studio/route";
import { deleteSuite, readSuite, renameSuite, saveSuite } from "@/lib/studio/tests/suites";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string; suite: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { pack, suite } = await params;
  return studioHandle(() => ({ suite: readSuite(pack, suite) }));
}

// PUT … { meta, cases, baseHash, note? } (table view) or { raw, baseHash, note? } (advanced mode).
export async function PUT(req: Request, { params }: Params) {
  const { pack, suite } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    const input = typeof body.raw === "string"
      ? { mode: "raw" as const, raw: body.raw }
      : { mode: "table" as const, meta: body.meta, cases: body.cases };
    return { suite: await saveSuite(pack, suite, input, body.baseHash, identityOf(req), body.note) };
  });
}

// PATCH … { name } — renames the suite.
export async function PATCH(req: Request, { params }: Params) {
  const { pack, suite } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    if (typeof body.name !== "string") throw new StudioError("invalidRequest", 400);
    return { suite: await renameSuite(pack, suite, body.name, identityOf(req)) };
  });
}

export async function DELETE(req: Request, { params }: Params) {
  const { pack, suite } = await params;
  return studioHandle(async () => {
    await deleteSuite(pack, suite, identityOf(req));
    return { deleted: suite };
  });
}
