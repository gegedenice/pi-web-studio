import { randomUUID } from "node:crypto";
import { allowFileRoot } from "../file-access";
import { getRpcSession, getRpcSessionInfos, startRpcSession } from "../rpc-manager";
import { deleteSessions } from "../session-delete";
import { attachSessionProjectInfo, invalidateSessionListCache, listAllSessions, mergeSessionLists } from "../session-reader";
import type { SessionInfo } from "../types";
import { StudioError } from "./errors";
import { readDefaultModel, readPackMeta } from "./packs";
import { assertPackId, resolvePackPath } from "./paths";
import { DEFAULT_TEST_TOOLS } from "./tests/runner";

// « Discuter » (STUDIO-NOTES §19.3): free conversations with the pack's agent,
// outside the test suites. A conversation is a pi-web session started like a
// test case (lib/studio/tests/pi-executor.ts): cwd = the pack, the pack's test
// tools and MCP rule, its default model unless another is chosen; the page
// then shows it with pi-web's own chat. Its name starts with « [chat] »: the
// Studio lists those of the pack, pi-web shows them like any session.

export const CHAT_NAME_PREFIX = "[chat]";
const NAME_MAX_LENGTH = 200;

/** A conversation as the Studio lists it. */
export interface PackChat {
  id: string;
  name: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  /** Only in memory until its first message is written. */
  transient: boolean;
}

export interface StartChatInput {
  /** Another model than the pack's default; the chat's selector changes it later too. */
  model?: { provider: unknown; modelId: unknown } | null;
}

function isPackChat(session: SessionInfo, packDir: string): boolean {
  return session.cwd === packDir && (session.name ?? "").startsWith(CHAT_NAME_PREFIX) && !session.relation;
}

/** The pack's folder: the cwd of its conversations, for pi-web's chat. */
export function packChatDir(packId: string): string {
  return resolvePackPath(assertPackId(packId));
}

/** The pack's conversations, newest first: saved ones and those still only in memory. */
export async function listPackChats(packId: string): Promise<PackChat[]> {
  const id = assertPackId(packId);
  readPackMeta(id);
  const packDir = resolvePackPath(id);
  const sessions = mergeSessionLists(await listAllSessions(), await attachSessionProjectInfo(getRpcSessionInfos()));
  return sessions
    .filter((session) => isPackChat(session, packDir))
    .map((session) => ({
      id: session.id,
      name: (session.name ?? "").slice(CHAT_NAME_PREFIX.length).trim(),
      created: session.created,
      modified: session.modified,
      messageCount: session.messageCount,
      firstMessage: session.firstMessage,
      transient: Boolean(session.transient),
    }))
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

/** `[chat] <pack title> · <person> · <date>`: the person who started it, as in campaign names. */
export function chatName(title: string, person: string, date: Date): string {
  const day = date.toISOString().slice(0, 16).replace("T", " ");
  return `${CHAT_NAME_PREFIX} ${title} · ${person} · ${day}`.slice(0, NAME_MAX_LENGTH);
}

export async function startPackChat(packId: string, input: StartChatInput, person: string): Promise<PackChat & { cwd: string }> {
  const id = assertPackId(packId);
  const meta = readPackMeta(id);
  const packDir = resolvePackPath(id);
  let model = readDefaultModel(id);
  if (input.model) {
    const provider = typeof input.model.provider === "string" ? input.model.provider.trim() : "";
    const modelId = typeof input.model.modelId === "string" ? input.model.modelId.trim() : "";
    if (!provider || !modelId) throw new StudioError("invalidModel", 400);
    model = { provider, modelId };
  }
  const tools = meta.tests?.tools?.length ? meta.tests.tools : DEFAULT_TEST_TOOLS;
  let started: Awaited<ReturnType<typeof startRpcSession>>;
  try {
    started = await startRpcSession(`__studio_chat__${randomUUID()}`, "", packDir, {
      toolNames: tools,
      // Same rule as the pack's test sessions (Configuration › MCP tools).
      ...(meta.tests?.mcpTools === "read-only" ? {} : { mcpReadOnlyPolicy: false }),
      ...(model ? { initialModel: model } : {}),
    });
  } catch (error) {
    throw new StudioError("chatStartFailed", 502, { reason: error instanceof Error ? error.message : String(error) });
  }
  allowFileRoot(packDir);
  const name = chatName(meta.title, person, new Date());
  await started.session.send({ type: "set_session_name", name });
  invalidateSessionListCache();
  const now = new Date().toISOString();
  return {
    id: started.realSessionId,
    cwd: packDir,
    name: name.slice(CHAT_NAME_PREFIX.length).trim(),
    created: now,
    modified: now,
    messageCount: 0,
    firstMessage: "",
    transient: true,
  };
}

/** Deletes one of the pack's conversations (and its subagent sessions); a running one is kept. */
export async function deletePackChat(packId: string, sessionId: unknown): Promise<void> {
  if (typeof sessionId !== "string" || !sessionId) throw new StudioError("invalidRequest", 400);
  const chats = await listPackChats(packId);
  if (!chats.some((chat) => chat.id === sessionId)) throw new StudioError("chatNotFound", 404);
  const live = getRpcSession(sessionId);
  if (live?.isRunning()) throw new StudioError("chatRunning", 409);
  const result = await deleteSessions([sessionId], { keepRunning: true });
  if (result.running.length) throw new StudioError("chatRunning", 409);
  // A conversation never written to disk lives only in memory.
  if (result.missing.includes(sessionId)) await live?.shutdown();
  invalidateSessionListCache();
}
