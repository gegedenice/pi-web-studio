import { exportVersion } from "@/lib/studio/release/export";
import { studioErrorPayload } from "@/lib/studio/errors";
import { searchParam, studioJson } from "@/lib/studio/route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// GET …/export?version=0.5&runs=1 — the zip of a published version.
export async function GET(req: Request, { params }: Params) {
  const { pack } = await params;
  try {
    const { fileName, content } = await exportVersion(pack, searchParam(req, "version"), { runs: searchParam(req, "runs") === "1" });
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(content.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const { body, status } = studioErrorPayload(error);
    return studioJson(body, status);
  }
}
