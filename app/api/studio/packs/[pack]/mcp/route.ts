import { StudioError } from "@/lib/studio/errors";
import { addMcpServer, listMcpServers, setGlobalMcpServerInPack } from "@/lib/studio/mcp/servers";
import { identityOf, readJsonBody, studioHandle } from "@/lib/studio/route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// GET /api/studio/packs/<pack>/mcp — the pack's servers, the global ones, and warnings. Reads files only.
export async function GET(_req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => listMcpServers(pack));
}

// POST …/mcp { server: form, note? } adds a server; { global: name, enabled } turns a global server off or on in this pack.
export async function POST(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    if (typeof body.global === "string") {
      if (typeof body.enabled !== "boolean") throw new StudioError("invalidRequest", 400);
      await setGlobalMcpServerInPack(pack, body.global, body.enabled, identityOf(req));
      return listMcpServers(pack);
    }
    return { server: await addMcpServer(pack, body.server, identityOf(req), body.note) };
  }, 201);
}
