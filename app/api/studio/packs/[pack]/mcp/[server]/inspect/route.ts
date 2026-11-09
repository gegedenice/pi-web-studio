import { inspectMcpServer } from "@/lib/studio/mcp/inspect";
import { studioHandle } from "@/lib/studio/route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string; server: string }> };

// POST …/mcp/<server>/inspect — initialize then tools/list, once, bounded (pi-web's MCP Test).
export async function POST(_req: Request, { params }: Params) {
  const { pack, server } = await params;
  return studioHandle(async () => ({ inspection: await inspectMcpServer(pack, server) }));
}
