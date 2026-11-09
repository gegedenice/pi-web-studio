"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { studioFetch } from "@/lib/studio/client";
import { logout, logoutPlan } from "@/lib/studio/logout";
import type { PackDetails, StudioIdentityInfo } from "@/lib/studio/types";

export function StudioHeader({ pack, advanced, onAdvancedChange, onValidate, onExport }: {
  pack?: PackDetails;
  advanced?: boolean;
  onAdvancedChange?: (value: boolean) => void;
  onValidate?: () => void;
  onExport?: () => void;
}) {
  const { t } = useI18n();
  const [me, setMe] = useState<StudioIdentityInfo | null>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    studioFetch<StudioIdentityInfo>("/me").then(setMe).catch(() => setMe(null));
  }, []);

  // Shown only when there is something to sign out of (local use without a password has nothing).
  const plan = me ? logoutPlan(me) : null;
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
        {onExport && <button type="button" className="studio-button" onClick={onExport}>{t("studio.release.export")}</button>}
        <Link className="studio-button" href="/?pi-web">{t("studio.header.back")}</Link>
        {plan && (
          <button type="button" className="studio-button" disabled={leaving} onClick={() => { setLeaving(true); void logout(plan); }}>
            {t("studio.header.logout")}
          </button>
        )}
      </div>
    </header>
  );
}
