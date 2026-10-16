import { createHash, randomBytes } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { readRegularFileText } from "../regular-file";
import { StudioError } from "./errors";

/** Pack files are instructions and skills: anything larger is not one. */
export const PACK_FILE_MAX_BYTES = 1024 * 1024;

export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The text of a regular file, or undefined when it does not exist. */
export function readPackText(absPath: string): string | undefined {
  try {
    return readRegularFileText(absPath, PACK_FILE_MAX_BYTES);
  } catch (error) {
    if (error instanceof Error && /larger|too large|exceeds/i.test(error.message)) {
      throw new StudioError("fileTooLarge", 413);
    }
    if (error instanceof Error && /not a regular file/.test(error.message)) {
      throw new StudioError("notAFile", 400);
    }
    throw error;
  }
}

/**
 * Replaces a file atomically (temporary file in the same folder, then rename),
 * keeping its mode, or 0644 for a new file: these files are versioned and read
 * by Pi, unlike pi-web's private settings files.
 */
export function writePackTextAtomic(absPath: string, content: string): void {
  if (Buffer.byteLength(content, "utf8") > PACK_FILE_MAX_BYTES) throw new StudioError("fileTooLarge", 413);
  const dir = dirname(absPath);
  mkdirSync(dir, { recursive: true });
  let mode = 0o644;
  try {
    mode = statSync(absPath).mode & 0o777;
  } catch {
    // new file
  }
  const temp = join(dir, `.${basename(absPath)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    writeFileSync(temp, content, { encoding: "utf8", mode, flag: "wx" });
    chmodSync(temp, mode);
    renameSync(temp, absPath);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

/** Removes a file, or a directory tree, without following links. */
export function removePackEntry(absPath: string): void {
  const stats = lstatSync(absPath, { throwIfNoEntry: false });
  if (!stats) return;
  if (stats.isDirectory()) rmSync(absPath, { recursive: true, force: true });
  else unlinkSync(absPath);
}

/** Regular files below `absDir`, as paths relative to it; links are skipped. */
export function listFilesRecursive(absDir: string, prefix = ""): string[] {
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFilesRecursive(join(absDir, entry.name), rel));
    else if (entry.isFile()) files.push(rel);
  }
  return files.sort();
}
