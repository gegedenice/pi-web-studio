// The Studio's MCP rules (STUDIO.md lot 3), client-safe: shared by the form and
// the server. The Studio writes Streamable HTTP entries of Pi's built-in MCP
// (`.pi/mcp.json`, `mcpServers`), with no secret in the file: a Bearer token is
// only the name of an environment variable, `"Authorization": "Bearer ${NAME}"`.
// Entries written by hand that it cannot express (stdio, OAuth settings, other
// headers) stay in the file and are shown as configured outside the Studio.
import { isSlug } from "../slug";
import type { ValidationIssue } from "../types";

export const MCP_FILE = ".pi/mcp.json";
export const MCP_DESCRIPTION_MAX_LENGTH = 500;
export const MCP_TIMEOUT_MAX_SECONDS = 3600;
export const TOKEN_VARIABLE_PATTERN = /^[A-Z_][A-Z0-9_]{0,127}$/;
/** pi-web never connects an entry that reads its own password (`lib/mcp-config-values.ts`). */
export const RESERVED_VARIABLES = ["PI_WEB_PASSWORD"];
/** The exposures the advanced form offers per tool (Q-L3-7); others in the file are kept and shown. */
export const STUDIO_TOOL_EXPOSURES = ["direct", "hidden"] as const;
export type McpExposureValue = "codemode" | "deferred" | "direct" | "hidden";
const EXPOSURES: readonly string[] = ["codemode", "deferred", "direct", "hidden", "codemode-deferred"];
const BEARER_PATTERN = /^Bearer \$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

export type McpAuthKind = "none" | "bearer-env";

/** What the form edits. */
export interface McpServerForm {
  name: string;
  url: string;
  description: string;
  auth: McpAuthKind;
  tokenVariable: string;
  /** Seconds; null for Pi's default (60 s). Advanced mode. */
  timeout: number | null;
  /** Per-tool exposure; undefined leaves the entry's as it is. Advanced mode. */
  toolExposure?: Record<string, McpExposureValue>;
}

/** A form problem, shown like any validation problem (`studio.validation.<code>`), next to its field. */
export interface McpFormProblem extends ValidationIssue {
  field: "name" | "url" | "description" | "tokenVariable" | "timeout" | "toolExposure";
}

/** Why the Studio cannot edit an entry with its form; i18n key suffix under `studio.mcp.outside.` */
export type McpOutsideReason = "notAnObject" | "stdio" | "sse" | "notHttp" | "oauth" | "authProvider" | "headers" | "commandValue";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The namespace Pi gives a server's tools (`mcp__<name>`, `-` as `_`): two names with the same one collide. */
export function mcpNamespace(name: string): string {
  return `mcp__${name.replace(/-/g, "_")}`;
}

/** Text typed where an address belongs that is really a command line (`npx -y …`, `uvx …`, `python server.py`). */
export function looksLikeCommand(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return false;
  return /\s/.test(text) || /^(npx|uvx|uv|node|python3?|deno|bun|docker|pipx)$/i.test(text) || /\.(js|mjs|py|sh|exe)$/i.test(text);
}

function checkUrl(url: string): McpFormProblem | undefined {
  const text = url.trim();
  if (!text) return { severity: "error", field: "url", code: "urlMissing" };
  if (looksLikeCommand(text)) return { severity: "error", field: "url", code: "urlCommand" };
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { severity: "error", field: "url", code: "urlInvalid" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { severity: "error", field: "url", code: "urlScheme", params: { scheme: parsed.protocol.replace(/:$/, "") } };
  if (parsed.username || parsed.password) return { severity: "error", field: "url", code: "urlCredentials" };
  return undefined;
}

export function checkServerForm(form: McpServerForm): McpFormProblem[] {
  const problems: McpFormProblem[] = [];
  if (!isSlug(form.name)) problems.push({ severity: "error", field: "name", code: "serverNameInvalid" });
  const url = checkUrl(form.url);
  if (url) problems.push(url);
  if (form.description.length > MCP_DESCRIPTION_MAX_LENGTH) problems.push({ severity: "error", field: "description", code: "serverDescriptionTooLong", params: { max: MCP_DESCRIPTION_MAX_LENGTH } });
  if (form.auth === "bearer-env") {
    const variable = form.tokenVariable.trim();
    if (!TOKEN_VARIABLE_PATTERN.test(variable)) problems.push({ severity: "error", field: "tokenVariable", code: "variableInvalid" });
    else if (RESERVED_VARIABLES.includes(variable)) problems.push({ severity: "error", field: "tokenVariable", code: "variableReserved", params: { name: variable } });
  }
  if (form.timeout !== null && (!Number.isInteger(form.timeout) || form.timeout < 1 || form.timeout > MCP_TIMEOUT_MAX_SECONDS)) {
    problems.push({ severity: "error", field: "timeout", code: "timeoutInvalid", params: { max: MCP_TIMEOUT_MAX_SECONDS } });
  }
  for (const [tool, exposure] of Object.entries(form.toolExposure ?? {})) {
    if (!tool || tool.length > 256 || !EXPOSURES.includes(exposure)) problems.push({ severity: "error", field: "toolExposure", code: "exposureInvalid", params: { tool } });
  }
  return problems;
}

/** Whether an entry declares a stdio server or the legacy SSE transport: refused everywhere in the Studio. */
export function transportRefusal(entry: unknown): "stdio" | "sse" | undefined {
  if (!isRecord(entry)) return undefined;
  if (entry.type === "sse") return "sse";
  if (entry.type === "stdio" || (typeof entry.command === "string" && !("url" in entry))) return "stdio";
  return undefined;
}

/** A global server's override in a project file: no `command`, `url` or `type` (pi 1.0.1). */
export function isOverrideEntry(entry: unknown): boolean {
  return isRecord(entry) && !("command" in entry) && !("url" in entry) && !("type" in entry);
}

/** The form for an entry the Studio can edit, or why it cannot. */
export function formFromEntry(name: string, entry: unknown): { form: McpServerForm } | { outside: McpOutsideReason } {
  if (!isRecord(entry)) return { outside: "notAnObject" };
  const refusal = transportRefusal(entry);
  if (refusal) return { outside: refusal };
  if (typeof entry.url !== "string" || checkUrl(entry.url) || (entry.type !== undefined && entry.type !== "http")) return { outside: "notHttp" };
  if ("auth" in entry) return { outside: "authProvider" };
  if ("oauth" in entry) return { outside: "oauth" };
  let auth: McpAuthKind = "none";
  let tokenVariable = "";
  if (entry.headers !== undefined) {
    if (!isRecord(entry.headers)) return { outside: "headers" };
    const keys = Object.keys(entry.headers);
    if (keys.length > 1 || (keys.length === 1 && keys[0].toLowerCase() !== "authorization")) return { outside: "headers" };
    if (keys.length === 1) {
      const value = entry.headers[keys[0]];
      const match = typeof value === "string" ? BEARER_PATTERN.exec(value) : null;
      if (!match) return { outside: typeof value === "string" && value.startsWith("!") ? "commandValue" : "headers" };
      auth = "bearer-env";
      tokenVariable = match[1];
    }
  }
  const toolExposure = isRecord(entry.toolExposure)
    ? Object.fromEntries(Object.entries(entry.toolExposure).filter((pair): pair is [string, McpExposureValue] => typeof pair[1] === "string" && EXPOSURES.includes(pair[1])))
    : {};
  return {
    form: {
      name,
      url: entry.url,
      description: typeof entry.description === "string" ? entry.description : "",
      auth,
      tokenVariable,
      timeout: typeof entry.timeout === "number" ? entry.timeout : null,
      toolExposure,
    },
  };
}

/**
 * The entry for a form. Editing keeps what the form does not show (`enabled`,
 * `exposure`, and `toolExposure` unless the form sends one), in the entry's
 * key order; a new entry gets `"exposure": "direct"` (STUDIO.md lot 3).
 */
export function entryFromForm(form: McpServerForm, previous?: Record<string, unknown>): Record<string, unknown> {
  const entry: Record<string, unknown> = previous ? { ...previous } : {};
  entry.url = form.url.trim();
  const description = form.description.trim();
  if (description) entry.description = description;
  else delete entry.description;
  if (form.auth === "bearer-env") entry.headers = { Authorization: `Bearer \${${form.tokenVariable.trim()}}` };
  else delete entry.headers;
  if (form.timeout !== null) entry.timeout = form.timeout;
  else delete entry.timeout;
  if (!previous) entry.exposure = "direct";
  if (form.toolExposure !== undefined) {
    if (Object.keys(form.toolExposure).length) entry.toolExposure = { ...form.toolExposure };
    else delete entry.toolExposure;
  }
  delete entry.type;
  return entry;
}

/** The variable a Studio entry reads its token from, if any. */
export function tokenVariableOf(entry: unknown): string | undefined {
  const read = formFromEntry("x", entry);
  return "form" in read && read.form.auth === "bearer-env" ? read.form.tokenVariable : undefined;
}

/**
 * The raw file the advanced editor saves (Q-L3-5): an object with an
 * `mcpServers` object, and no stdio or SSE entry. Entries the form cannot
 * express (OAuth, other headers) are accepted; Pi's validator still decides.
 */
export function rawMcpFileRefusal(text: string): { code: "mcpRawInvalid" } | { code: "mcpRawTransport"; name: string; transport: "stdio" | "sse" } | undefined {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { code: "mcpRawInvalid" };
  }
  if (!isRecord(data) || (data.mcpServers !== undefined && !isRecord(data.mcpServers))) return { code: "mcpRawInvalid" };
  for (const [name, entry] of Object.entries((data.mcpServers as Record<string, unknown> | undefined) ?? {})) {
    const transport = transportRefusal(entry);
    if (transport) return { code: "mcpRawTransport", name, transport };
  }
  return undefined;
}
