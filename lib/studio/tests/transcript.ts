import type { RunToolCall } from "./run-types";

// A test case's session as Markdown a reviewer reads (cases/<id>.md), and the
// tool calls the review screen shows folded. Works on the session's messages,
// as the .jsonl stores them (STUDIO.md §2.4).

export interface TranscriptMessage {
  role: string;
  content?: unknown;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  stopReason?: string;
  errorMessage?: string;
}

export interface TranscriptHeader {
  pack: string;
  suite: string;
  id: string;
  model: string;
  packCommit: string;
  status: string;
  durationMs: number;
  requete: string;
  attendu: string;
  sources: string;
  error?: string;
}

const SHORT = 2000;

function shorten(text: string, max = SHORT): string {
  return text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} caractères de plus)` : text;
}

function blocks(content: unknown): Record<string, unknown>[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? content.filter((block): block is Record<string, unknown> => Boolean(block) && typeof block === "object") : [];
}

export function textOf(content: unknown): string {
  return blocks(content)
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n")
    .trim();
}

function toolCallsOf(content: unknown): { id: string; name: string; input: unknown }[] {
  return blocks(content)
    .filter((block) => block.type === "toolCall")
    .map((block) => ({
      id: String(block.id ?? block.toolCallId ?? ""),
      name: String(block.name ?? block.toolName ?? ""),
      input: block.arguments ?? block.input ?? {},
    }));
}

const READ_ONLY_BLOCK = /read-only tool selection|readOnlyHint/i;

/** Every tool call of the session with its result, in order. */
export function collectToolCalls(messages: TranscriptMessage[]): RunToolCall[] {
  const results = new Map<string, TranscriptMessage>();
  for (const message of messages) if (message.role === "toolResult" && message.toolCallId) results.set(message.toolCallId, message);
  const calls: RunToolCall[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const call of toolCallsOf(message.content)) {
      const result = results.get(call.id);
      const resultText = result ? textOf(result.content) : "";
      calls.push({
        name: call.name,
        input: shorten(JSON.stringify(call.input), 1000),
        result: shorten(resultText),
        isError: Boolean(result?.isError),
        ...(result?.isError && READ_ONLY_BLOCK.test(resultText) ? { blocked: true } : {}),
      });
    }
  }
  return calls;
}

/** The final answer: the last assistant message's text. */
export function finalAnswer(messages: TranscriptMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      const text = textOf(messages[i].content);
      if (text) return text;
    }
  }
  return "";
}

/** The error the model's last turn ended on, if it ended on one. */
export function lastTurnError(messages: TranscriptMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    return message.stopReason === "error" ? message.errorMessage || "error" : undefined;
  }
  return undefined;
}

function quote(text: string): string {
  return text ? text.split("\n").map((line) => `> ${line}`).join("\n") : "> —";
}

export function buildTranscript(header: TranscriptHeader, messages: TranscriptMessage[]): string {
  const seconds = (header.durationMs / 1000).toFixed(1).replace(".", ",");
  const lines = [
    `# ${header.id} — ${header.suite}`,
    "",
    `- Pack : ${header.pack} (version ${header.packCommit || "—"})`,
    `- Modèle : ${header.model}`,
    `- Statut : ${header.status}, ${seconds} s`,
    ...(header.error ? [`- Erreur : ${header.error}`] : []),
    "",
    "## Requête",
    "",
    quote(header.requete),
    "",
    "## Attendu",
    "",
    quote(header.attendu),
    ...(header.sources ? ["", `Sources attendues : ${header.sources}`] : []),
    "",
    "## Déroulé",
  ];
  const results = new Map<string, TranscriptMessage>();
  for (const message of messages) if (message.role === "toolResult" && message.toolCallId) results.set(message.toolCallId, message);
  for (const message of messages) {
    if (message.role === "user") {
      lines.push("", "### Utilisatrice", "", textOf(message.content) || "—");
    } else if (message.role === "assistant") {
      const text = textOf(message.content);
      if (text) lines.push("", "### Agent", "", text);
      for (const call of toolCallsOf(message.content)) {
        const result = results.get(call.id);
        lines.push(
          "",
          `### Outil \`${call.name}\`${result?.isError ? " (erreur)" : ""}`,
          "",
          "```json",
          shorten(JSON.stringify(call.input, null, 2), 4000),
          "```",
          "",
          "```text",
          shorten(result ? textOf(result.content) : "(pas de résultat)", 4000).replace(/```/g, "ˋˋˋ"),
          "```",
        );
      }
      if (message.stopReason === "error") lines.push("", `_Erreur du modèle : ${message.errorMessage || "inconnue"}_`);
    }
  }
  lines.push("", "## Réponse finale", "", finalAnswer(messages) || "_(aucune)_", "");
  return lines.join("\n");
}
