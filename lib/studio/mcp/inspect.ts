import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { McpTestResult } from "../../api-types";
import { projectMcpConfigPath } from "../../mcp-config-read";
import { mcpProjectTrustRefusal, readMcpServerConfig } from "../../mcp-entry-request";
import { closeTestConnection, createTestRedactor, observeTestConnection, openTestConnection, testMcpServer } from "../../mcp-test";
import { findWebPasswordField } from "../../mcp-transport";
import { loadPiSdkInternals, type McpTool } from "../../pi-sdk-internals";
import { StudioError } from "../errors";
import { assertPackId, packsRoot, resolvePackPath } from "../paths";
import { readPackMeta } from "../packs";
import { recordInspection } from "./inspections";
import { formFromEntry, tokenVariableOf, transportRefusal } from "./policy";
import { entryHash, readPackServerEntry } from "./servers";

// "Inspecter tools/list" (STUDIO.md lot 3): a diagnostic through pi-web's
// Settings › MCP Test (`lib/mcp-test.ts`): its queue, deadline (20 s), request
// timeout (15 s), masking and status record. The Studio only passes its own
// `connect`, the same steps as pi-web's, which also keeps each tool's whole
// description and input schema before the connection closes.

export type InspectionState = "connected" | "needs-auth" | "failed" | "timeout" | "variable-missing";

export interface InspectedTool {
  name: string;
  title?: string;
  description?: string;
  readOnly: boolean;
  exposure: string;
  /** The input schema as indented JSON, masked; absent when the server sent none or another test answered. */
  schema?: string;
}

export interface InspectionResult {
  state: InspectionState;
  /** The server's or the SDK's message, masked, when it did not connect. */
  error?: string;
  /** The endpoint refused Streamable HTTP (404/405/406/415): perhaps a legacy SSE server. */
  maybeSse?: boolean;
  serverInfo?: { name: string; version: string; title?: string };
  tools: InspectedTool[];
  toolCount: number;
  durationMs: number;
  at: string;
}

/** Injectable, like the campaign executor: the routes use `piInspector`, tests a fake. */
export interface McpInspector {
  inspect(target: { packId: string; packDir: string; name: string; entry: unknown }): Promise<Omit<InspectionResult, "at">>;
}

const DESCRIPTION_MAX_CHARS = 2000;
const SCHEMA_MAX_CHARS = 20_000;

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export const piInspector: McpInspector = {
  async inspect({ packDir, name }) {
    const loaded = await loadPiSdkInternals();
    if (!loaded.ok) throw new StudioError("mcpUnavailable", 409);
    const internals = loaded;
    const agentDir = getAgentDir();
    if (mcpProjectTrustRefusal(packDir, agentDir)) throw new StudioError("packUntrusted", 409);
    const project = { cwd: packDir, allowedRoots: new Set([packsRoot()]) };
    const resolved = readMcpServerConfig({ agentDir, project, internals, scope: "project", name });
    if (typeof resolved === "string") throw new StudioError("serverInvalid", 422, { reason: resolved });
    const { config, configKey } = resolved;
    if (findWebPasswordField(config, internals)) throw new StudioError("serverWebPassword", 409, { name });

    const full = new Map<string, McpTool>();
    let redact: (text: string) => string = (text) => text;
    const result: McpTestResult = await testMcpServer(
      { scope: "project", name, sourcePath: projectMcpConfigPath(packDir), configKey, config, cwd: packDir },
      internals,
      {
        connect: async (target, signal) => {
          const opened = openTestConnection(target, internals, {});
          try {
            const run = await observeTestConnection(opened, target, internals, signal);
            redact = createTestRedactor(target.config, opened.transports, internals);
            if (opened.connection.state === "connected") for (const tool of opened.connection.tools) full.set(tool.name, tool);
            return run;
          } finally {
            await closeTestConnection(opened);
          }
        },
      },
    );
    const state: InspectionState = result.timedOut || result.queueTimedOut ? "timeout" : result.state;
    return {
      state,
      ...(result.error ? { error: result.error, maybeSse: /\b(404|405|406|415)\b/.test(result.error) } : {}),
      ...(result.serverInfo ? { serverInfo: result.serverInfo } : {}),
      tools: result.tools.map((tool) => {
        const source = full.get(tool.name);
        const description = typeof source?.description === "string" ? redact(shorten(source.description.trim(), DESCRIPTION_MAX_CHARS)) : tool.description;
        const schema = source?.inputSchema ? redact(shorten(JSON.stringify(source.inputSchema, null, 2), SCHEMA_MAX_CHARS)) : undefined;
        return {
          name: tool.name,
          ...(typeof source?.title === "string" ? { title: redact(source.title) } : {}),
          ...(description ? { description } : {}),
          readOnly: tool.readOnly,
          exposure: tool.exposure,
          ...(schema ? { schema } : {}),
        };
      }),
      toolCount: result.toolCount,
      durationMs: result.durationMs,
    };
  },
};

/** Inspects one server of the pack as its file holds it now, and remembers the outcome for the journey. */
export async function inspectMcpServer(packId: string, name: string, inspector: McpInspector = piInspector): Promise<InspectionResult> {
  const id = assertPackId(packId);
  readPackMeta(id);
  const entry = readPackServerEntry(id, name);
  if (entry === undefined) throw new StudioError("serverNotFound", 404, { name });
  // The Studio inspects only what it may write: never a command, never SSE.
  const transport = transportRefusal(entry);
  if (transport) throw new StudioError("serverTransport", 409, { name, transport });
  const started = Date.now();
  const variable = tokenVariableOf(entry);
  const at = new Date().toISOString();
  let result: InspectionResult;
  if (variable && !process.env[variable]) {
    result = { state: "variable-missing", tools: [], toolCount: 0, durationMs: Date.now() - started, at };
  } else if (!("form" in formFromEntry(name, entry)) && !(typeof entry === "object" && entry !== null && "url" in entry)) {
    throw new StudioError("serverTransport", 409, { name, transport: "stdio" });
  } else {
    result = { ...(await inspector.inspect({ packId: id, packDir: resolvePackPath(id), name, entry })), at };
  }
  recordInspection(id, name, { entryHash: entryHash(entry), ok: result.state === "connected", state: result.state, at, toolCount: result.toolCount });
  return result;
}

/** An inspector answering from a script, for tests. */
export function createFakeInspector(answers: Record<string, Partial<Omit<InspectionResult, "at">>>, calls: string[] = []): McpInspector {
  return {
    async inspect({ name }) {
      calls.push(name);
      const answer = answers[name] ?? {};
      return { state: "connected", tools: [], toolCount: answer.tools?.length ?? 0, durationMs: 1, ...answer };
    },
  };
}
