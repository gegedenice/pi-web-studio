import { identityOf, readJsonBody, studioHandle } from "@/lib/studio/route";
import { piExecutor } from "@/lib/studio/tests/pi-executor";
import { startCampaign } from "@/lib/studio/tests/runner";
import { listRuns } from "@/lib/studio/tests/runs";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string }> };

// GET /api/studio/packs/<pack>/runs — the pack's campaigns, newest first.
export async function GET(_req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => ({ runs: await listRuns(pack) }));
}

// POST …/runs { model: { provider, modelId }, suites?, cases?, thinkingLevel?, timeoutMs?, concurrency? }
// starts a campaign in the background; its progress is read with GET …/runs/<run>.
export async function POST(req: Request, { params }: Params) {
  const { pack } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    const started = await startCampaign(pack, {
      model: body.model,
      suites: body.suites,
      cases: body.cases,
      thinkingLevel: body.thinkingLevel,
      timeoutMs: body.timeoutMs,
      concurrency: body.concurrency,
    }, identityOf(req), piExecutor);
    started.done.catch((error) => console.error("[studio] campaign failed:", error));
    return { run: started.run, unsavedChanges: started.unsavedChanges };
  }, 201);
}
