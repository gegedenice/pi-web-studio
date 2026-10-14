import { StudioRoot } from "@/components/studio/StudioRoot";

export default async function StudioPackPage({ params }: { params: Promise<{ pack: string }> }) {
  const { pack } = await params;
  return <StudioRoot packId={decodeURIComponent(pack)} />;
}
