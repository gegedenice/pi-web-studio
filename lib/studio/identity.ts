import { statSync } from "node:fs";
import { readRegularFileText } from "../regular-file";
import { getStudioConfig } from "./config";

export interface StudioIdentity {
  /** Login as the proxy gives it, or the default user. */
  id: string;
  /** Git author name and email. */
  name: string;
  email: string;
  /** True when `studio-users.json` does not know the id: the author is made up from it. */
  fallback: boolean;
}

interface HeaderSource {
  get(name: string): string | null;
}

/** A login fit for a Git author line: letters, digits and `._@+-`, at most 128 characters. */
const LOGIN_PATTERN = /^[\p{L}\p{N}._@+-]{1,128}$/u;

function cleanLogin(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && LOGIN_PATTERN.test(trimmed) ? trimmed : null;
}

/** Strips what would break or forge a Git author line. */
function cleanAuthorPart(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[<>\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return cleaned || null;
}

interface UsersCache {
  path: string;
  mtimeMs: number;
  users: Record<string, { name: string; email: string }>;
}

const USERS_CACHE_KEY = Symbol.for("pi-studio:users-cache");
const WARNED_KEY = Symbol.for("pi-studio:identity-warnings");

function warnOnce(key: string, message: string): void {
  const store = globalThis as Record<symbol, Set<string> | undefined>;
  const warned = (store[WARNED_KEY] ??= new Set());
  if (warned.has(key)) return;
  if (warned.size > 500) warned.clear();
  warned.add(key);
  console.warn(message);
}

/** `studio-users.json`: `{ "<login>": { "name": "…", "email": "…" } }`, re-read when it changes. */
export function readStudioUsers(path = getStudioConfig().usersFile): Record<string, { name: string; email: string }> {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return {};
  }
  const store = globalThis as Record<symbol, UsersCache | undefined>;
  const cached = store[USERS_CACHE_KEY];
  if (cached && cached.path === path && cached.mtimeMs === mtimeMs) return cached.users;

  const users: Record<string, { name: string; email: string }> = {};
  try {
    const parsed: unknown = JSON.parse(readRegularFileText(path, 1024 * 1024) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [login, entry] of Object.entries(parsed as Record<string, unknown>)) {
        if (!entry || typeof entry !== "object") continue;
        const name = cleanAuthorPart((entry as Record<string, unknown>).name, 200);
        const email = cleanAuthorPart((entry as Record<string, unknown>).email, 200);
        if (name && email) users[login] = { name, email };
      }
    } else {
      warnOnce(`invalid:${path}`, `[studio] ${path} must hold an object of users; using fallback authors.`);
    }
  } catch (error) {
    warnOnce(`unreadable:${path}:${mtimeMs}`, `[studio] cannot read ${path}; using fallback authors: ${error instanceof Error ? error.message : String(error)}`);
  }
  store[USERS_CACHE_KEY] = { path, mtimeMs, users };
  return users;
}

/**
 * Who is saving. The identity header is read only when `STUDIO_TRUSTED_PROXY`
 * is `true`: without the proxy in front, anyone could send it. An unknown or
 * unusable login never blocks a save: the author falls back to the login (or
 * the default user) with a warning in the server log.
 */
export function getStudioIdentity(headers: HeaderSource): StudioIdentity {
  const config = getStudioConfig();
  let id = cleanLogin(config.defaultUser) ?? "studio";
  if (config.trustedProxy) {
    const raw = headers.get(config.identityHeader);
    const fromHeader = cleanLogin(raw);
    if (fromHeader) id = fromHeader;
    else if (raw) warnOnce(`header:${raw}`, `[studio] ignoring unusable ${config.identityHeader} header value; saving as ${id}.`);
  }

  const known = readStudioUsers(config.usersFile)[id];
  if (known) return { id, name: known.name, email: known.email, fallback: false };

  warnOnce(`unknown:${id}`, `[studio] "${id}" is not in ${config.usersFile}; saving as "${id} <${id}@studio.invalid>".`);
  return { id, name: id, email: `${id}@studio.invalid`, fallback: true };
}
