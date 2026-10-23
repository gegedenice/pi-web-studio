import { StudioError } from "@/lib/studio/errors";
import { identityOf, readJsonBody, studioHandle } from "@/lib/studio/route";
import { piExecutor } from "@/lib/studio/tests/pi-executor";
import { campaignIsActive, startCampaign, stopCampaign, unfinishedCases } from "@/lib/studio/tests/runner";
import { readRun, saveVerdicts } from "@/lib/studio/tests/runs";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pack: string; run: string }> };

// GET …/runs/<run> — the campaign, polled every 2 s while it runs.
export async function GET(_req: Request, { params }: Params) {
  const { pack, run } = await params;
  return studioHandle(async () => {
    const file = await readRun(pack, run);
    return { run: file, active: campaignIsActive(pack, file.runId), unfinished: unfinishedCases(file) };
  });
}

// POST …/runs/<run> { action: "stop" } | { action: "rerun" } (a new campaign of the unfinished cases)
export async function POST(req: Request, { params }: Params) {
  const { pack, run } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    if (body.action === "stop") return { run: await stopCampaign(pack, run) };
    if (body.action === "rerun") {
      const previous = await readRun(pack, run);
      const cases = unfinishedCases(previous);
      if (!cases.length) throw new StudioError("campaignEmpty", 400);
      const started = await startCampaign(pack, {
        model: { provider: previous.model.provider, modelId: previous.model.id },
        cases,
        suites: [...new Set(cases.map((key) => key.split("/")[0]))],
        thinkingLevel: previous.options.thinkingLevel,
        timeoutMs: previous.options.timeoutMs,
        concurrency: previous.options.concurrency,
      }, identityOf(req), piExecutor);
      started.done.catch((error) => console.error("[studio] campaign failed:", error));
      return { run: started.run, unsavedChanges: started.unsavedChanges };
    }
    throw new StudioError("invalidRequest", 400);
  });
}

// PUT …/runs/<run> { verdicts: [{ suite, id, verdict: "ok"|"partiel"|"ko"|null, comment? }] }
export async function PUT(req: Request, { params }: Params) {
  const { pack, run } = await params;
  return studioHandle(async () => {
    const body = await readJsonBody(req);
    return { run: await saveVerdicts(pack, run, body.verdicts, identityOf(req)) };
  });
}
