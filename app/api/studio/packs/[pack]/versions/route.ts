import { identityOf, readJsonBody, searchParam, studioHandle } from "@/lib/studio/route";
import { listPublishedVersions, nextVersion, publishVersion } from "@/lib/studio/release/publish";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// GET …/versions[?step=major] — published versions, newest first, and the next version number.
export async function GET(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => ({
    versions: await listPublishedVersions(pack),
    next: { minor: await nextVersion(pack, "minor"), major: await nextVersion(pack, "major") },
    step: searchParam(req, "step") === "major" ? "major" : "minor",
  }));
}

// POST …/versions { note, step?: "minor"|"major", acceptWarnings? } — publishes a version.
export async function POST(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    return publishVersion(pack, { note: body.note, step: body.step, acceptWarnings: body.acceptWarnings }, identityOf(req));
  }, 201);
}
