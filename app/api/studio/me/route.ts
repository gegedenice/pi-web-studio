import { identityOf, studioHandle } from "@/lib/studio/route";

export const dynamic = "force-dynamic";

// GET /api/studio/me — who the Studio saves as.
export async function GET(req: Request) {
  return studioHandle(() => {
    const identity = identityOf(req);
    return { id: identity.id, name: identity.name, fallback: identity.fallback };
  });
}
