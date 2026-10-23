import type { RunToolCall } from "./run-types";
import type { TranscriptMessage } from "./transcript";

// What runs one test case. The campaign runner only knows this interface:
// pi-executor.ts runs a real pi-web session; tests inject a fake one (below),
// as STUDIO.md asks for everything that needs a real model.

export interface CaseRequest {
  packId: string;
  packDir: string;
  caseId: string;
  message: string;
  model: { provider: string; id: string };
  thinkingLevel?: string;
  tools: string[];
  timeoutMs: number;
  /** Aborted when the campaign is stopped. */
  signal: AbortSignal;
  /** The session's name in pi-web's sidebar. */
  sessionName: string;
}

export interface CaseOutcome {
  status: "termine" | "erreur" | "timeout";
  durationMs: number;
  tokens: { input: number; output: number };
  answer: string;
  error?: string;
  toolCalls: RunToolCall[];
  sessionId?: string;
  sessionFile?: string;
  /** The session's messages, for the transcript. */
  messages: TranscriptMessage[];
}

export interface CaseExecutor {
  run(request: CaseRequest): Promise<CaseOutcome>;
}

export interface FakeCaseScript {
  answer?: string;
  delayMs?: number;
  /** The case never answers: it ends by timeout (or when stopped). */
  hang?: boolean;
  fail?: string;
  toolCalls?: RunToolCall[];
}

/** An executor for tests: per case id, an answer, a delay, a failure or a hang. */
export function createFakeExecutor(scripts: Record<string, FakeCaseScript> = {}, calls: CaseRequest[] = []): CaseExecutor {
  return {
    async run(request) {
      calls.push(request);
      const script = scripts[request.caseId] ?? {};
      const started = Date.now();
      const wait = script.hang ? request.timeoutMs : script.delayMs ?? 0;
      const stopped = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), wait);
        request.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(true); }, { once: true });
      });
      const durationMs = Date.now() - started;
      const messages: TranscriptMessage[] = [{ role: "user", content: request.message }];
      if (stopped) return { status: "erreur", error: "stopped", durationMs, tokens: { input: 0, output: 0 }, answer: "", toolCalls: [], messages };
      if (script.hang) return { status: "timeout", error: "timeout", durationMs, tokens: { input: 0, output: 0 }, answer: "", toolCalls: [], messages };
      if (script.fail) return { status: "erreur", error: script.fail, durationMs, tokens: { input: 10, output: 0 }, answer: "", toolCalls: [], messages };
      const answer = script.answer ?? `Réponse de ${request.model.id} à ${request.caseId}`;
      messages.push({ role: "assistant", content: [{ type: "text", text: answer }], stopReason: "stop" });
      return {
        status: "termine",
        durationMs,
        tokens: { input: 100, output: 20 },
        answer,
        toolCalls: script.toolCalls ?? [],
        sessionId: `fake-${request.caseId}`,
        messages,
      };
    },
  };
}
