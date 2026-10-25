import { StudioError } from "@/lib/studio/errors";
import { deleteMcpServer, findServer, setMcpServerEnabled, updateMcpServer } from "@/lib/studio/mcp/servers";
import { identityOf, readJsonBody, studioHandle } from "@/lib/studio/route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string; server: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { pack, server } = await params;
  return studioHandle(async () => ({ server: await findServer(pack, server) }));
}

// PUT …/mcp/<server> { server: form, baseHash, note? } — the form; a new name renames it.
export async function PUT(req: Request, { params }: Params) {
  const { pack, server } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    return { server: await updateMcpServer(pack, server, body.server, body.baseHash, identityOf(req), body.note) };
  });
}

// PATCH …/mcp/<server> { enabled } — the switch.
export async function PATCH(req: Request, { params }: Params) {
  const { pack, server } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    if (typeof body.enabled !== "boolean") throw new StudioError("invalidRequest", 400);
    return { server: await setMcpServerEnabled(pack, server, body.enabled, identityOf(req)) };
  });
}

export async function DELETE(req: Request, { params }: Params) {
  const { pack, server } = await params;
  return studioHandle(async () => {
    await deleteMcpServer(pack, server, identityOf(req));
    return { deleted: server };
  });
}
