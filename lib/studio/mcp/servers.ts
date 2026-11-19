import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { McpServerInfo } from "../../api-types";
import { readCodemodeSettings, readProjectCodemodeMode } from "../../codemode-settings";
import {
  editMcpConfigFile,
  isMcpConfigWriteError,
  type McpConfigFileTarget,
  ownServerEntry,
  removeMcpServer,
  setMcpServerEnabledInProject,
  setMcpServersEnabled,
} from "../../mcp-config-file";
import { readMcpServerConfigs } from "../../mcp-config-read";
import { loadPiSdkInternals, type PiSdkInternals } from "../../pi-sdk-internals";
import type { StudioAction } from "../commit-message";
import { StudioError } from "../errors";
import { contentHash, readPackText } from "../files";
import { type GitAuthor, withPacksLock } from "../git";
import { commitPackChange, readPackMeta } from "../packs";
import { assertPackId, packsRoot, resolvePackPath } from "../paths";
import { lastInspection, type InspectionRecord } from "./inspections";
import {
  checkServerForm,
  entryFromForm,
  formFromEntry,
  isOverrideEntry,
  MCP_FILE,
  mcpNamespace,
  type McpOutsideReason,
  type McpServerForm,
  tokenVariableOf,
  transportRefusal,
} from "./policy";

// The pack's MCP servers (STUDIO.md lot 3): read from `.pi/mcp.json`, checked
// with Pi's own validator through pi-web's reader, written with pi-web's writer
// (lock, atomic write, the SDK's bytes), one version per change.

export interface McpServerSummary {
  name: string;
  enabled: boolean;
  /** The form edits it; otherwise `outside` says why it was configured outside the Studio. */
  form?: McpServerForm;
  outside?: McpOutsideReason;
  /** The address of an entry outside the Studio, when it has one. */
  url?: string;
  description?: string;
  /** Pi's reason for refusing the entry (the SDK's words); it never connects. */
  invalid?: string;
  tokenVariable?: string;
  /** Whether that variable has a value in the server's environment (never the value). */
  tokenVariableSet?: boolean;
  /** Concurrency base for an edit: the entry as the page read it. */
  entryHash: string;
  inspection?: InspectionRecord;
  /**
   * Pi-web's OAuth store holds a token for it (signed in from Settings › MCP).
   * The Studio never signs in itself (STUDIO.md §8), but its inspection and its
   * test sessions use that store, as every pi-web session does.
   */
  signedIn?: true;
}

export interface GlobalMcpServer {
  name: string;
  description?: string;
  /** As pi-web lists it: secret parts masked. */
  url?: string;
  command?: string;
  enabled: boolean;
  /** `.pi/mcp.json` turns it off in this pack (an override entry). */
  disabledInPack: boolean;
  /** The pack defines a server of the same name, which replaces it. */
  replacedByPack: boolean;
  invalid?: string;
}

export interface McpOverview {
  servers: McpServerSummary[];
  globals: GlobalMcpServer[];
  /** The pack file cannot be read as an `mcpServers` object; nothing can be written until it is fixed. */
  fileInvalid: boolean;
  /** Pi-web's Code mode is "only": `direct` tools are no longer declared to the model (Q-L3-6). */
  codemodeOnly: boolean;
  /** The SDK's MCP modules could not load: entries are listed unchecked. */
  unchecked: boolean;
  /** The pack's folder, to open it in Pi Web (sign-in of an OAuth server). */
  packDir: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function entryHash(entry: unknown): string {
  return contentHash(JSON.stringify(entry) ?? "");
}

function variableIsSet(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value !== "";
}

function target(packId: string): Extract<McpConfigFileTarget, { scope: "project" }> {
  return { scope: "project", cwd: resolvePackPath(packId), allowedRoots: new Set([packsRoot()]) };
}

async function internalsOrUndefined(): Promise<PiSdkInternals | undefined> {
  const loaded = await loadPiSdkInternals();
  return loaded.ok ? loaded : undefined;
}

interface PackFile {
  servers: Record<string, unknown>;
  invalid: boolean;
}

function readPackFile(packId: string): PackFile {
  const text = readPackText(resolvePackPath(packId, MCP_FILE));
  if (text === undefined) return { servers: {}, invalid: false };
  try {
    const data: unknown = JSON.parse(text);
    if (!isRecord(data)) return { servers: {}, invalid: true };
    if (data.mcpServers === undefined) return { servers: {}, invalid: false };
    return isRecord(data.mcpServers) ? { servers: data.mcpServers, invalid: false } : { servers: {}, invalid: true };
  } catch {
    return { servers: {}, invalid: true };
  }
}

function readListing(packId: string, internals: PiSdkInternals | undefined): McpServerInfo[] {
  try {
    return readMcpServerConfigs({
      agentDir: getAgentDir(),
      project: { cwd: resolvePackPath(packId), allowedRoots: new Set([packsRoot()]) },
      ...(internals ? { internals } : {}),
    }).servers;
  } catch {
    return [];
  }
}

async function codemodeOnly(packId: string): Promise<boolean> {
  try {
    const project = readProjectCodemodeMode(resolvePackPath(packId));
    if (project) return project.value === "only";
    return (await readCodemodeSettings()).mode.value === "only";
  } catch {
    return false;
  }
}

export async function listMcpServers(packId: string): Promise<McpOverview> {
  const id = assertPackId(packId);
  readPackMeta(id);
  const file = readPackFile(id);
  const internals = await internalsOrUndefined();
  const listing = readListing(id, internals);
  const projectInfo = new Map(listing.filter((info) => info.scope === "project").map((info) => [info.name, info]));

  const servers: McpServerSummary[] = [];
  const overrides = new Map<string, Record<string, unknown>>();
  for (const [name, entry] of Object.entries(file.servers)) {
    if (isOverrideEntry(entry)) {
      overrides.set(name, entry as Record<string, unknown>);
      continue;
    }
    const hash = entryHash(entry);
    const read = formFromEntry(name, entry);
    const info = projectInfo.get(name);
    const variable = tokenVariableOf(entry);
    const inspection = lastInspection(id, name, hash);
    servers.push({
      name,
      enabled: !(isRecord(entry) && entry.enabled === false),
      ...("form" in read ? { form: read.form } : { outside: read.outside }),
      ...("outside" in read && isRecord(entry) && typeof entry.url === "string" ? { url: info?.url ?? entry.url } : {}),
      ...(isRecord(entry) && typeof entry.description === "string" ? { description: entry.description } : {}),
      ...(info?.invalidError ? { invalid: info.invalidError } : {}),
      ...(variable ? { tokenVariable: variable, tokenVariableSet: variableIsSet(variable) } : {}),
      entryHash: hash,
      ...(inspection ? { inspection } : {}),
      ...(info?.signedIn === true ? { signedIn: true as const } : {}),
    });
  }

  const globals: GlobalMcpServer[] = listing.filter((info) => info.scope === "global").map((info) => ({
    name: info.name,
    ...(info.description ? { description: info.description } : {}),
    ...(info.url ? { url: info.url } : {}),
    ...(info.command ? { command: info.command } : {}),
    enabled: info.enabled,
    disabledInPack: overrides.get(info.name)?.enabled === false,
    replacedByPack: info.shadowedByProject === true,
    ...(info.invalidError ? { invalid: info.invalidError } : {}),
  }));

  return { servers, globals, fileInvalid: file.invalid, codemodeOnly: await codemodeOnly(id), unchecked: !internals, packDir: resolvePackPath(id) };
}

function translateWriteError(error: unknown, name: string): never {
  if (isMcpConfigWriteError(error)) {
    switch (error.reason) {
      case "name-taken": throw new StudioError("serverExists", 409, { name });
      case "server-missing": throw new StudioError("serverNotFound", 404, { name });
      case "unparsable":
      case "invalid-shape": throw new StudioError("mcpFileInvalid", 409);
      case "locked": throw new StudioError("mcpFileLocked", 409);
      default: throw new StudioError("mcpFileUnwritable", 500);
    }
  }
  throw error;
}

/** Form problems, a name whose tools would collide with another server's, then Pi's validator. */
async function checkEntry(packId: string, form: McpServerForm, entry: Record<string, unknown>, previousName?: string): Promise<void> {
  const problems = checkServerForm(form);
  if (problems.length) throw new StudioError("validationFailed", 422, undefined, problems);
  const others = [
    ...Object.keys(readPackFile(packId).servers).filter((name) => name !== previousName),
    ...readListing(packId, undefined).filter((info) => info.scope === "global").map((info) => info.name),
  ];
  const clash = others.find((name) => name !== form.name && mcpNamespace(name) === mcpNamespace(form.name));
  if (clash) throw new StudioError("serverNameCollision", 409, { name: form.name, other: clash });
  const internals = await internalsOrUndefined();
  if (internals) {
    const verdict = internals.validateMcpServerConfig(form.name, entry);
    if (typeof verdict === "string") throw new StudioError("serverInvalid", 422, { reason: verdict });
  }
}

function normalizeForm(input: unknown): McpServerForm {
  if (!isRecord(input)) throw new StudioError("invalidRequest", 400);
  // A pasted entry rather than the form's fields: say why, not that the address is missing.
  const transport = transportRefusal(input);
  if (transport) throw new StudioError("mcpTransportRefused", 422, { transport });
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const timeout = input.timeout === null || input.timeout === undefined || input.timeout === "" ? null : Number(input.timeout);
  let toolExposure: McpServerForm["toolExposure"];
  if (input.toolExposure !== undefined) {
    if (!isRecord(input.toolExposure)) throw new StudioError("invalidRequest", 400);
    toolExposure = input.toolExposure as McpServerForm["toolExposure"];
  }
  return {
    name: text(input.name).trim(),
    url: text(input.url),
    description: text(input.description),
    auth: input.auth === "bearer-env" ? "bearer-env" : "none",
    tokenVariable: text(input.tokenVariable),
    timeout,
    ...(toolExposure !== undefined ? { toolExposure } : {}),
  };
}

async function writeAndCommit(packId: string, action: StudioAction, author: GitAuthor, note: unknown, task: () => Promise<{ written: boolean }>): Promise<void> {
  await withPacksLock(async () => {
    readPackMeta(packId);
    const outcome = await task();
    if (outcome.written) await commitPackChange(packId, [MCP_FILE], action, author, note);
  });
}

export async function addMcpServer(packId: string, input: unknown, author: GitAuthor, note?: unknown): Promise<McpServerSummary> {
  const id = assertPackId(packId);
  const form = normalizeForm(input);
  const entry = entryFromForm(form);
  await checkEntry(id, form, entry);
  await writeAndCommit(id, { kind: "add-mcp", name: form.name }, author, note, async () => {
    try {
      return await editMcpConfigFile(target(id), ({ document, servers }) => {
        if (ownServerEntry(servers, form.name) !== undefined) throw new StudioError("serverExists", 409, { name: form.name });
        if (!isRecord(document.mcpServers)) document.mcpServers = {};
        (document.mcpServers as Record<string, unknown>)[form.name] = entry;
        return { changed: true, value: undefined };
      });
    } catch (error) {
      return translateWriteError(error, form.name);
    }
  });
  return findServer(id, form.name);
}

/** Saves the form; a new name renames the server in place. `baseHash` is the entry as the page read it. */
export async function updateMcpServer(packId: string, name: string, input: unknown, baseHash: unknown, author: GitAuthor, note?: unknown): Promise<McpServerSummary> {
  const id = assertPackId(packId);
  const form = normalizeForm(input);
  const current = readPackFile(id).servers;
  if (!Object.hasOwn(current, name) || isOverrideEntry(current[name])) throw new StudioError("serverNotFound", 404, { name });
  const previous = current[name];
  if (!("form" in formFromEntry(name, previous))) throw new StudioError("serverOutside", 409, { name });
  const entry = entryFromForm(form, previous as Record<string, unknown>);
  await checkEntry(id, form, entry, name);
  const action: StudioAction = form.name === name ? { kind: "edit-mcp", name } : { kind: "rename-mcp", from: name, to: form.name };
  await writeAndCommit(id, action, author, note, async () => {
    try {
      return await editMcpConfigFile(target(id), ({ servers }) => {
        if (!servers || !Object.hasOwn(servers, name)) throw new StudioError("serverNotFound", 404, { name });
        if (entryHash(servers[name]) !== baseHash) throw new StudioError("conflict", 409);
        if (form.name !== name && Object.hasOwn(servers, form.name)) throw new StudioError("serverExists", 409, { name: form.name });
        if (JSON.stringify(servers[name]) === JSON.stringify(entry) && form.name === name) return { changed: false, value: undefined };
        const entries = Object.entries(servers);
        for (const key of Object.keys(servers)) delete servers[key];
        for (const [key, value] of entries) servers[key === name ? form.name : key] = key === name ? entry : value;
        return { changed: true, value: undefined };
      });
    } catch (error) {
      return translateWriteError(error, name);
    }
  });
  return findServer(id, form.name);
}

export async function setMcpServerEnabled(packId: string, name: string, enabled: boolean, author: GitAuthor): Promise<McpServerSummary> {
  const id = assertPackId(packId);
  await writeAndCommit(id, { kind: enabled ? "enable-mcp" : "disable-mcp", name }, author, undefined, async () => {
    try {
      const outcome = await setMcpServersEnabled(target(id), [name], enabled, (_name, entry) => (isOverrideEntry(entry) ? "override" : undefined));
      const result = outcome.value[0];
      if (result?.outcome === "missing" || result?.outcome === "refused") throw new StudioError("serverNotFound", 404, { name });
      return outcome;
    } catch (error) {
      return translateWriteError(error, name);
    }
  });
  return findServer(id, name);
}

export async function deleteMcpServer(packId: string, name: string, author: GitAuthor): Promise<void> {
  const id = assertPackId(packId);
  const current = readPackFile(id).servers;
  if (!Object.hasOwn(current, name) || isOverrideEntry(current[name])) throw new StudioError("serverNotFound", 404, { name });
  await writeAndCommit(id, { kind: "delete-mcp", name }, author, undefined, async () => {
    try {
      return await removeMcpServer(target(id), name);
    } catch (error) {
      return translateWriteError(error, name);
    }
  });
}

/**
 * A global server in this pack (Q-L3-2): off is an override entry
 * `{ "enabled": false }`, as `/mcp` writes it; on again removes an override
 * that only said that, else sets its `enabled`.
 */
export async function setGlobalMcpServerInPack(packId: string, name: string, enabled: boolean, author: GitAuthor): Promise<void> {
  const id = assertPackId(packId);
  if (typeof name !== "string" || !name || name.length > 1024) throw new StudioError("invalidRequest", 400);
  if (!readListing(id, undefined).some((info) => info.scope === "global" && info.name === name)) throw new StudioError("serverNotFound", 404, { name });
  const existing = readPackFile(id).servers[name];
  if (existing !== undefined && !isOverrideEntry(existing)) throw new StudioError("serverExists", 409, { name });
  await writeAndCommit(id, { kind: enabled ? "enable-global-mcp" : "disable-global-mcp", name }, author, undefined, async () => {
    try {
      if (!enabled) return await setMcpServerEnabledInProject(target(id), name, false);
      return await editMcpConfigFile(target(id), ({ servers }) => {
        const entry = ownServerEntry(servers, name);
        if (!servers || !isRecord(entry)) return { changed: false, value: undefined };
        if (Object.keys(entry).every((key) => key === "enabled")) delete servers[name];
        else if (entry.enabled === false) delete entry.enabled;
        else return { changed: false, value: undefined };
        return { changed: true, value: undefined };
      });
    } catch (error) {
      return translateWriteError(error, name);
    }
  });
}

export async function findServer(packId: string, name: string): Promise<McpServerSummary> {
  const server = (await listMcpServers(packId)).servers.find((item) => item.name === name);
  if (!server) throw new StudioError("serverNotFound", 404, { name });
  return server;
}

/** The raw entry of a pack server, as its file holds it now. */
export function readPackServerEntry(packId: string, name: string): unknown {
  const servers = readPackFile(assertPackId(packId)).servers;
  return Object.hasOwn(servers, name) && !isOverrideEntry(servers[name]) ? servers[name] : undefined;
}

/**
 * Connecter (Q-L3-4): in progress once a default model or a server is set;
 * ready with a default model and every enabled pack server within the policy,
 * accepted by Pi and inspected successfully since the server started. A pack
 * without MCP server can be ready.
 */
export function connectStep(overview: McpOverview, hasDefaultModel: boolean): "todo" | "progress" | "ready" {
  const enabled = overview.servers.filter((server) => server.enabled);
  const allGood = !overview.fileInvalid && enabled.every((server) => server.form && !server.invalid && server.inspection?.ok);
  if (hasDefaultModel && allGood) return "ready";
  return hasDefaultModel || overview.servers.length > 0 ? "progress" : "todo";
}
