import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { parseGitPorcelainV1 } from "../git-status";
import { serializeByKey } from "../key-serializer";
import { StudioError } from "./errors";
import { packsRoot } from "./paths";

// Git is run as pi-web runs it (lib/git-changes.ts): the `git` binary through
// execFile, no shell, no library. The Studio only ever adds commits: it never
// resets, rebases, amends, pushes or rewrites the packs repository's history.

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 15_000;
const GIT_MAX_BUFFER = 16 * 1024 * 1024;
const LOCK_KEY = Symbol.for("pi-studio:packs-repository");

export interface GitAuthor {
  name: string;
  email: string;
}

/** What `.gitignore` holds when the Studio creates the packs repository. */
export const DEFAULT_GITIGNORE = [
  "# Créé par PI Studio",
  ".DS_Store",
  "*.log",
  "node_modules/",
  ".pi/mcp-traces/",
  "",
].join("\n");

const REV_PATTERN = /^[0-9a-f]{7,40}$/;

export async function git(
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<string> {
  const cwd = options.cwd ?? packsRoot();
  try {
    const { stdout } = await execFileAsync("git", ["-c", "core.quotepath=off", ...args], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
      env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0", ...options.env },
    });
    return stdout;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr;
    if (stderr) (error as Error).message = `${(error as Error).message}\n${stderr}`;
    throw error;
  }
}

/** Every change to the packs repository (files and commits) runs one at a time. */
export function withPacksLock<T>(task: () => Promise<T>): Promise<T> {
  return serializeByKey(LOCK_KEY, "packs", task);
}

async function isRepositoryRoot(root: string): Promise<boolean> {
  try {
    const top = (await git(["rev-parse", "--show-toplevel"], { cwd: root })).trim();
    return top === root;
  } catch {
    return false;
  }
}

/**
 * Makes `STUDIO_PACKS_DIR` a Git repository if it is not one yet (idempotent),
 * with a minimal `.gitignore`, committed by `author`. A folder inside another
 * repository gets a repository of its own. Call inside `withPacksLock`.
 */
export async function ensureRepository(author: GitAuthor): Promise<void> {
  const root = packsRoot();
  if (await isRepositoryRoot(root)) return;
  await git(["init", "-q"], { cwd: root });
  const ignore = join(root, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, DEFAULT_GITIGNORE, { encoding: "utf8", mode: 0o644 });
  await commitPaths([".gitignore"], "Initialise le dépôt des packs", author);
}

export async function hasHead(): Promise<boolean> {
  try {
    await git(["rev-parse", "--verify", "-q", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

export async function headRevision(): Promise<string | null> {
  return (await hasHead()) ? (await git(["rev-parse", "HEAD"])).trim() : null;
}

function authorEnv(author: GitAuthor): Record<string, string> {
  return {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
  };
}

/**
 * Commits exactly `paths` (repository-relative; files or folders, deletions
 * included) and nothing else. It stages them in a temporary index built from
 * HEAD, so whatever someone staged in the real index by hand is neither
 * committed nor lost; the real index is then updated for those paths only.
 * Returns the new revision, or null when the paths hold no change (unless
 * `allowEmpty`). Call inside `withPacksLock`.
 */
export async function commitPaths(
  paths: string[],
  message: string,
  author: GitAuthor,
  options: { allowEmpty?: boolean } = {},
): Promise<string | null> {
  const root = packsRoot();
  const gitDir = (await git(["rev-parse", "--absolute-git-dir"], { cwd: root })).trim();
  const index = join(gitDir, `studio-index-${randomBytes(6).toString("hex")}`);
  const env = { GIT_INDEX_FILE: index, ...authorEnv(author) };
  const head = await hasHead();
  try {
    if (head) await git(["read-tree", "HEAD"], { env });
    // A path that is gone from disk and from HEAD would make `git add` fail.
    const present: string[] = [];
    for (const path of paths) {
      if (existsSync(join(root, path)) || (await git(["ls-files", "--", path], { env })).trim()) present.push(path);
    }
    if (present.length) await git(["add", "-A", "--", ...present], { env });
    let changed: boolean;
    if (head) {
      try {
        await git(["diff", "--cached", "--quiet"], { env });
        changed = false;
      } catch {
        changed = true;
      }
    } else {
      changed = (await git(["ls-files"], { env })).trim() !== "";
    }
    if (!changed && !options.allowEmpty) return null;
    const paragraphs = message.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    await git(["commit", "-q", "--no-verify", ...(changed ? [] : ["--allow-empty"]), ...paragraphs.flatMap((part) => ["-m", part])], { env });
    if (present.length) await git(["reset", "-q", "--", ...present]).catch(() => undefined);
    return (await git(["rev-parse", "HEAD"])).trim();
  } finally {
    rmSync(index, { force: true });
  }
}

export interface LogEntry {
  rev: string;
  author: string;
  email: string;
  date: string;
  subject: string;
  changes: { status: string; path: string; previousPath?: string }[];
}

const FIELD = "\x1f";
const RECORD = "\x1e";

/** Commits touching `pathspec`, newest first, with the files each changed. */
export async function log(pathspec: string, options: { follow?: boolean; limit?: number } = {}): Promise<LogEntry[]> {
  if (!(await hasHead())) return [];
  const args = [
    "log",
    `--format=${RECORD}%H${FIELD}%an${FIELD}%ae${FIELD}%aI${FIELD}%s`,
    "--name-status",
    "-M",
    `-n${options.limit ?? 200}`,
    ...(options.follow ? ["--follow"] : []),
    "--",
    pathspec,
  ];
  const output = await git(args);
  return output.split(RECORD).filter(Boolean).map((record) => {
    const [header, ...rest] = record.split("\n");
    const [rev, author, email, date, subject] = header.split(FIELD);
    const changes = rest.filter(Boolean).map((line) => {
      const parts = line.split("\t");
      const status = parts[0].charAt(0);
      return parts.length >= 3
        ? { status, previousPath: parts[1], path: parts[2] }
        : { status, path: parts[1] };
    });
    return { rev, author, email, date, subject: subject ?? "", changes };
  });
}

export function assertRevision(rev: unknown): string {
  if (typeof rev !== "string" || !REV_PATTERN.test(rev)) throw new StudioError("invalidVersion", 400);
  return rev;
}

/** A file's text at a revision, or undefined when it did not exist there. */
export async function showFile(rev: string, path: string): Promise<string | undefined> {
  const spec = `${rev}:${path}`;
  try {
    await git(["cat-file", "-e", spec]);
  } catch {
    return undefined;
  }
  return git(["show", spec]);
}

/** Files under `dir` at a revision (repository-relative). */
export async function listTree(rev: string, dir: string): Promise<string[]> {
  try {
    const output = await git(["ls-tree", "-r", "-z", "--name-only", rev, "--", dir]);
    return output.split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

export async function lastCommitDate(pathspec: string): Promise<string | null> {
  if (!(await hasHead())) return null;
  const output = (await git(["log", "-1", "--format=%aI", "--", pathspec])).trim();
  return output || null;
}

export interface StatusEntry {
  path: string;
  kind: "modified" | "added" | "deleted";
}

/** Uncommitted changes under `pathspec` (staged or not, untracked included). */
export async function status(pathspec: string): Promise<StatusEntry[]> {
  const root = packsRoot();
  if (!(await isRepositoryRoot(root))) return [];
  const output = await git(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", pathspec]);
  const entries: StatusEntry[] = [];
  for (const entry of parseGitPorcelainV1(output)) {
    const pair = `${entry.indexStatus}${entry.worktreeStatus}`;
    if (pair === "??" || entry.indexStatus === "A") entries.push({ path: entry.path, kind: "added" });
    else if (pair.includes("D")) entries.push({ path: entry.path, kind: "deleted" });
    else if (entry.originalPath) {
      entries.push({ path: entry.originalPath, kind: "deleted" }, { path: entry.path, kind: "added" });
    } else entries.push({ path: entry.path, kind: "modified" });
  }
  return entries;
}

/** An annotated tag on `rev`, its message the version note, tagged by `author`. Call inside `withPacksLock`. */
export async function createTag(name: string, rev: string, message: string, author: GitAuthor): Promise<void> {
  await git(["tag", "-a", name, rev, "-m", message], { env: authorEnv(author) });
}

export async function tagExists(name: string): Promise<boolean> {
  try {
    await git(["rev-parse", "--verify", "-q", `refs/tags/${name}`]);
    return true;
  } catch {
    return false;
  }
}

export interface TagEntry {
  name: string;
  tagger: string;
  email: string;
  date: string;
  /** The commit the tag points to. */
  rev: string;
  message: string;
}

/** Annotated tags matching `pattern` (`refs/tags/<pack>/v*`), newest first. */
export async function listTags(pattern: string): Promise<TagEntry[]> {
  if (!(await hasHead())) return [];
  const format = ["%(refname:short)", "%(taggername)", "%(taggeremail:trim)", "%(taggerdate:iso-strict)", "%(*objectname)", "%(contents)"].join("%1f");
  const out = await git(["for-each-ref", "--sort=-taggerdate", `--format=${format}%1e`, pattern]);
  return out.split("\x1e").map((record) => record.replace(/^\n/, "")).filter(Boolean).flatMap((record) => {
    const [name, tagger, email, date, rev, message] = record.split("\x1f");
    // A lightweight tag has no tagger and no peeled commit: not a Studio version.
    if (!rev || !tagger) return [];
    return [{ name, tagger, email, date, rev, message: (message ?? "").trim() }];
  });
}

const ARCHIVE_MAX_BYTES = 256 * 1024 * 1024;

/**
 * A zip of `dir` (repository-relative) as `treeish` holds it, under `prefix/`,
 * leaving out the `exclude` paths (relative to `dir`).
 */
export async function archiveZip(treeish: string, dir: string, prefix: string, exclude: string[]): Promise<Buffer> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["archive", "--format=zip", `--prefix=${prefix}/`, `${treeish}:${dir}`, "--", ".", ...exclude.map((path) => `:(exclude)${path}`)],
      { cwd: packsRoot(), timeout: 60_000, maxBuffer: ARCHIVE_MAX_BYTES, encoding: "buffer", env: { ...process.env, LC_ALL: "C" } },
    );
    return stdout;
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw new StudioError("exportTooLarge", 413);
    throw error;
  }
}
