import { randomUUID } from "node:crypto";
import { allowFileRoot } from "../../file-access";
import { startRpcSession } from "../../rpc-manager";
import { getSessionEntries, invalidateSessionListCache } from "../../session-reader";
import type { CaseExecutor, CaseOutcome, CaseRequest } from "./executor";
import { collectToolCalls, finalAnswer, lastTurnError, type TranscriptMessage } from "./transcript";

// One test case in a fresh pi-web session (STUDIO.md lot 2): cwd = the pack,
// the campaign's model, no history, the pack's test tools. The session stays
// on disk (and in pi-web's sidebar, named "[test] …") for « Ouvrir la session ».

const AWAITING_INPUT_POLL_MS = 1000;
const ABORT_GRACE_MS = 10_000;

function sessionMessages(sessionFile: string | undefined): TranscriptMessage[] {
  if (!sessionFile) return [];
  try {
    return getSessionEntries(sessionFile)
      .filter((entry) => entry.type === "message")
      .map((entry) => (entry as unknown as { message: TranscriptMessage }).message);
  } catch {
    return [];
  }
}

export const piExecutor: CaseExecutor = {
  async run(request: CaseRequest): Promise<CaseOutcome> {
    const started = Date.now();
    const empty = (status: CaseOutcome["status"], error: string): CaseOutcome => ({
      status,
      error,
      durationMs: Date.now() - started,
      tokens: { input: 0, output: 0 },
      answer: "",
      toolCalls: [],
      messages: [{ role: "user", content: request.message }],
    });
    if (request.signal.aborted) return empty("erreur", "stopped");

    let started_: Awaited<ReturnType<typeof startRpcSession>>;
    try {
      started_ = await startRpcSession(`__studio_test__${randomUUID()}`, "", request.packDir, {
        toolNames: request.tools,
        initialModel: { provider: request.model.provider, modelId: request.model.id },
        ...(request.thinkingLevel ? { thinkingLevel: request.thinkingLevel as never } : {}),
      });
    } catch (error) {
      return empty("erreur", error instanceof Error ? error.message : String(error));
    }
    const { session, realSessionId } = started_;
    allowFileRoot(request.packDir);
    invalidateSessionListCache();

    let outcome: "done" | "timeout" | "stopped" | "awaiting" = "done";
    let promptError: string | undefined;
    try {
      await session.send({ type: "set_session_name", name: request.sessionName });
      const finished = new Promise<void>((resolve) => {
        const off = session.onEvent((event) => {
          if (event.type === "prompt_error") promptError = String((event as { errorMessage?: unknown }).errorMessage ?? "error");
          if (event.type === "prompt_done") {
            off();
            resolve();
          }
        });
      });
      await session.send({ type: "prompt", message: request.message });

      let timer: ReturnType<typeof setTimeout> | undefined;
      let poll: ReturnType<typeof setInterval> | undefined;
      let onAbort: (() => void) | undefined;
      const interrupted = new Promise<"timeout" | "stopped" | "awaiting">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), request.timeoutMs);
        // A run waiting on an extension dialog would wait for a person forever.
        poll = setInterval(() => { if (session.isAwaitingInput()) resolve("awaiting"); }, AWAITING_INPUT_POLL_MS);
        onAbort = () => resolve("stopped");
        request.signal.addEventListener("abort", onAbort, { once: true });
      });
      const result = await Promise.race([finished.then(() => "done" as const), interrupted]);
      clearTimeout(timer);
      clearInterval(poll);
      if (onAbort) request.signal.removeEventListener("abort", onAbort);
      outcome = result;
      if (result !== "done") {
        await session.send({ type: "abort" }).catch(() => undefined);
        await Promise.race([finished, new Promise((resolve) => setTimeout(resolve, ABORT_GRACE_MS))]);
      }
    } catch (error) {
      promptError = error instanceof Error ? error.message : String(error);
    }

    const durationMs = Date.now() - started;
    const stats = await session.send({ type: "get_session_stats" }).catch(() => null) as { tokens?: { input?: number; output?: number } } | null;
    const sessionFile = session.sessionFile || undefined;
    await session.shutdown().catch(() => undefined);
    invalidateSessionListCache();

    const messages = sessionMessages(sessionFile);
    const turnError = lastTurnError(messages);
    const status: CaseOutcome["status"] = outcome === "timeout" ? "timeout" : outcome !== "done" || promptError || turnError ? "erreur" : "termine";
    const error = outcome === "timeout" ? "timeout"
      : outcome === "stopped" ? "stopped"
        : outcome === "awaiting" ? "awaitingInput"
          : promptError ?? turnError;
    return {
      status,
      ...(error ? { error } : {}),
      durationMs,
      tokens: { input: stats?.tokens?.input ?? 0, output: stats?.tokens?.output ?? 0 },
      answer: finalAnswer(messages),
      toolCalls: collectToolCalls(messages),
      sessionId: realSessionId,
      sessionFile,
      messages: messages.length ? messages : [{ role: "user", content: request.message }],
    };
  },
};
