import { GET as getModels } from "@/app/api/models/route";
import { allowFileRoot } from "@/lib/allowed-roots";
import { readPackMeta } from "@/lib/studio/packs";
import { resolvePackPath } from "@/lib/studio/paths";
import { studioErrorPayload } from "@/lib/studio/errors";
import { studioJson } from "@/lib/studio/route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// GET /api/studio/packs/<pack>/models — pi-web's model list (GET /api/models)
// for the pack folder, so the pack's own .pi/settings.json counts. The folder
// becomes one pi-web may read, as it does once a session runs in it.
export async function GET(req: Request, { params }: Params) {
  const { pack } = await params;
  let dir: string;
  try {
    readPackMeta(pack);
    dir = resolvePackPath(pack);
  } catch (error) {
    const { body, status } = studioErrorPayload(error);
    return studioJson(body, status);
  }
  allowFileRoot(dir);
  const url = new URL(req.url);
  url.pathname = "/api/models";
  url.search = new URLSearchParams({ cwd: dir }).toString();
  return getModels(new Request(url, { headers: req.headers }));
}
