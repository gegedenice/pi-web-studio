import { identityOf, studioHandle } from "@/lib/studio/route";
import { isWebPasswordEnabled } from "@/lib/web-auth";

export const dynamic = "force-dynamic";

// GET /api/studio/me — who the Studio saves as, and how they signed in (for « Se déconnecter »).
export async function GET(req: Request) {
  return studioHandle(() => {
    const identity = identityOf(req);
    return {
      id: identity.id,
      name: identity.name,
      fallback: identity.fallback,
      fromProxy: identity.fromProxy === true,
      webPassword: isWebPasswordEnabled(process.env.PI_WEB_PASSWORD),
    };
  });
}
