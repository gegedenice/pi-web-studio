import { redirect } from "next/navigation";
import { StudioRoot } from "@/components/studio/StudioRoot";
import { findRenamedPack } from "@/lib/studio/packs";
import { isSlug, PACK_META_FILE, resolvePackPath } from "@/lib/studio/paths";
import { existsSync } from "node:fs";

export const dynamic = "force-dynamic";

/** A pack renamed since: its old address leads to its new one (STUDIO-NOTES §19.2). */
function renamedTo(packId: string): string | null {
  if (!isSlug(packId)) return null;
  try {
    if (existsSync(resolvePackPath(packId, PACK_META_FILE))) return null;
  } catch {
    return null;
  }
  return findRenamedPack(packId);
}

export default async function StudioPackPage({ params }: { params: Promise<{ pack: string }> }) {
  const { pack } = await params;
  const packId = decodeURIComponent(pack);
  const target = renamedTo(packId);
  if (target) redirect(`/studio/${encodeURIComponent(target)}`);
  return <StudioRoot packId={packId} />;
}
