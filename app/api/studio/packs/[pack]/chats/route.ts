import { listPackChats, packChatDir, startPackChat } from "@/lib/studio/chat";
import { identityOf, readJsonBody, studioHandle } from "@/lib/studio/route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// GET /api/studio/packs/<pack>/chats — the pack's conversations (« Discuter »), newest first.
export async function GET(_req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => ({ chats: await listPackChats(pack), dir: packChatDir(pack) }));
}

// POST /api/studio/packs/<pack>/chats { model? } — starts a conversation with the pack's agent.
export async function POST(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    const model = body.model && typeof body.model === "object" ? body.model as { provider: unknown; modelId: unknown } : null;
    return { chat: await startPackChat(pack, { model }, identityOf(req).name) };
  }, 201);
}
