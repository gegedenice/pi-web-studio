import { existsSync, renameSync, rmSync } from "node:fs";
import { destroyRpcSessionsForCwd, hasBusyRpcSessionForCwd } from "../rpc-manager";
import { invalidateSessionListCache } from "../session-reader";
import { commitMessage } from "./commit-message";
import { StudioError } from "./errors";
import { writePackTextAtomic } from "./files";
import { commitPaths, ensureRepository, type GitAuthor, withPacksLock } from "./git";
import { externalChanges, readPackMeta, serializePackMeta, slugUsedBefore } from "./packs";
import { assertPackId, PACK_META_FILE, repoPath, resolvePackPath } from "./paths";
import { activeRunIds } from "./tests/active-runs";
import type { PackMeta } from "./types";

// Renaming a pack's slug and deleting a pack (STUDIO-NOTES §19).
//
// The slug is the pack's folder in the packs repository and the prefix of its
// published versions (tags `<slug>/v…`). A rename moves the folder in one
// version and records the old slug in pack.json (`formerIds`): the history,
// the deleted skills and the published versions keep reading the commits from
// before under that slug. A deletion removes the folder in one version; the
// history and the tags stay in the repository, so an administrator can bring
// the pack back. Neither is pushed.

/** A campaign or a pi session at work in the pack's folder: moving or removing it would break them. */
function assertPackIdle(id: string): void {
  if (activeRunIds(id).length) throw new StudioError("packBusyRun", 409);
  if (hasBusyRpcSessionForCwd(resolvePackPath(id))) throw new StudioError("packBusySession", 409);
}

export async function renamePack(packId: string, newIdInput: unknown, author: GitAuthor): Promise<PackMeta> {
  const id = assertPackId(packId);
  const newId = assertPackId(newIdInput);
  return withPacksLock(async () => {
    const meta = readPackMeta(id);
    if (newId === id) return meta;
    assertPackIdle(id);
    // What moves is what the Studio saved: changes made outside it are kept or discarded first.
    if ((await externalChanges(id)).length) throw new StudioError("renameExternalChanges", 409);
    if (existsSync(resolvePackPath(newId))) throw new StudioError("packExists", 409, { id: newId });
    if (await slugUsedBefore(newId, id)) throw new StudioError("slugUsedBefore", 409, { id: newId });
    await ensureRepository(author);
    // Idle sessions in the old folder would write there again.
    await destroyRpcSessionsForCwd(resolvePackPath(id));

    const next: PackMeta = { ...meta, id: newId, formerIds: [id, ...(meta.formerIds ?? []).filter((slug) => slug !== newId && slug !== id)] };
    const from = resolvePackPath(id);
    const to = resolvePackPath(newId);
    renameSync(from, to);
    try {
      writePackTextAtomic(resolvePackPath(newId, PACK_META_FILE), serializePackMeta(next));
      await commitPaths([repoPath(id), repoPath(newId)], commitMessage(newId, { kind: "rename-pack", from: id, to: newId }), author);
    } catch (error) {
      // Back as it was: the folder under its slug, its pack.json unchanged.
      if (existsSync(to) && !existsSync(from)) {
        renameSync(to, from);
        writePackTextAtomic(resolvePackPath(id, PACK_META_FILE), serializePackMeta(meta));
      }
      throw error;
    }
    invalidateSessionListCache();
    return next;
  });
}

/** `confirm` is the slug typed by the person, as GitHub asks for a repository. */
export async function deletePack(packId: string, confirm: unknown, author: GitAuthor): Promise<void> {
  const id = assertPackId(packId);
  if (confirm !== id) throw new StudioError("deleteConfirmMismatch", 400);
  await withPacksLock(async () => {
    readPackMeta(id);
    assertPackIdle(id);
    await ensureRepository(author);
    await destroyRpcSessionsForCwd(resolvePackPath(id));
    rmSync(resolvePackPath(id), { recursive: true, force: true });
    await commitPaths([repoPath(id)], commitMessage(id, { kind: "delete-pack" }), author, { allowEmpty: true });
    invalidateSessionListCache();
  });
}
