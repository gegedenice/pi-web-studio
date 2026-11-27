import { deletePackChat } from "@/lib/studio/chat";
import { studioHandle } from "@/lib/studio/route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string; chat: string }> };

// DELETE /api/studio/packs/<pack>/chats/<session> — deletes one of the pack's conversations.
export async function DELETE(_req: Request, { params }: Params) {
  const { pack, chat } = await params;
  return studioHandle(async () => {
    await deletePackChat(pack, decodeURIComponent(chat));
    return { deleted: chat };
  });
}
