import { resolve } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface StudioConfig {
  /** One Git repository holding every pack. */
  packsDir: string;
  /** Lower-cased name of the header the trusted proxy puts the user in. */
  identityHeader: string;
  /** Read the identity header only when the request comes through the trusted proxy. */
  trustedProxy: boolean;
  defaultUser: string;
  usersFile: string;
  templatesDir: string;
  /** Pi's agent directory (`PI_CODING_AGENT_DIR`). */
  agentDir: string;
  /** `/` redirects to `/studio`. */
  home: boolean;
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Read on every call, so tests and a restarted server see the current environment. */
export function getStudioConfig(): StudioConfig {
  return {
    packsDir: resolve(env("STUDIO_PACKS_DIR") ?? "/workspace/packs"),
    identityHeader: (env("STUDIO_IDENTITY_HEADER") ?? "Remote-User").toLowerCase(),
    trustedProxy: env("STUDIO_TRUSTED_PROXY") === "true",
    defaultUser: env("STUDIO_DEFAULT_USER") ?? "studio",
    usersFile: resolve(env("STUDIO_USERS_FILE") ?? "studio-users.json"),
    templatesDir: resolve(env("STUDIO_TEMPLATES_DIR") ?? "studio-templates"),
    agentDir: getAgentDir(),
    home: env("STUDIO_HOME") === "true",
  };
}
