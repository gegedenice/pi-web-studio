import type { Metadata } from "next";
import "./studio.css";

export const metadata: Metadata = {
  title: "PI Studio",
  description: "Conception et tests de packs d'agents Pi",
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
