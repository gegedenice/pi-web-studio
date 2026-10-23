"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { studioFetch } from "@/lib/studio/client";
import type { PackDetails, StudioIdentityInfo } from "@/lib/studio/types";

export function StudioHeader({ pack, advanced, onAdvancedChange, onValidate }: {
  pack?: PackDetails;
  advanced?: boolean;
  onAdvancedChange?: (value: boolean) => void;
  onValidate?: () => void;
}) {
  const { t } = useI18n();
  const [me, setMe] = useState<StudioIdentityInfo | null>(null);
  useEffect(() => {
    studioFetch<StudioIdentityInfo>("/me").then(setMe).catch(() => setMe(null));
  }, []);

  return (
    <header className="studio-header">
      <Link href="/studio" className="studio-brand">
        <span className="studio-brand-mark" aria-hidden="true">π</span>
        <span>
          <strong>PI Studio</strong>
          <span className="studio-brand-sub">{t("studio.brand.subtitle")}</span>
        </span>
      </Link>
      {pack && (
        <div className="studio-active-pack">
          <span className="studio-active-label">{t("studio.header.activePack")}</span>
          <span className="studio-active-title">{pack.meta.title}</span>
          <span className="studio-version">{t("studio.header.version", { version: pack.meta.version })}</span>
        </div>
      )}
      <div className="studio-header-actions">
        {me && <span className="studio-me" title={me.fallback ? t("studio.header.fallbackUser") : undefined}>{me.name}</span>}
        {onAdvancedChange && (
          <label className="studio-toggle">
            <input type="checkbox" checked={Boolean(advanced)} onChange={(event) => onAdvancedChange(event.target.checked)} />
            <span>{t("studio.header.advanced")}</span>
          </label>
        )}
        {onValidate && <button type="button" className="studio-button" onClick={onValidate}>{t("studio.header.validate")}</button>}
        <Link className="studio-button" href="/?pi-web">{t("studio.header.back")}</Link>
      </div>
    </header>
  );
}
