"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { errorMessage, studioFetch } from "@/lib/studio/client";
import { isSlug, slugify } from "@/lib/studio/slug";
import type { PackMeta, PackSummary } from "@/lib/studio/types";
import { StudioHeader } from "./StudioHeader";
import { Dialog, formatStudioDate, Notice } from "./StudioUi";

export function StudioHome() {
  const { t, locale } = useI18n();
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    studioFetch<{ packs: PackSummary[] }>("/packs")
      .then((data) => { setPacks(data.packs); setError(null); })
      .catch((cause) => setError(errorMessage(cause, t)));
  }, [t]);
  useEffect(load, [load]);

  return (
    <div className="studio-page">
      <StudioHeader />
      <main className="studio-main studio-home">
        <header className="studio-section-header is-row">
          <div>
            <h1 className="studio-title">{t("studio.home.title")}</h1>
            <p className="studio-muted">{t("studio.home.intro")}</p>
          </div>
          <button type="button" className="studio-button is-primary" onClick={() => setCreating(true)}>{t("studio.home.new")}</button>
        </header>
        {error && <Notice kind="error">{error}</Notice>}
        {packs === null && !error && <p className="studio-muted">{t("studio.common.loading")}</p>}
        {packs?.length === 0 && (
          <div className="studio-empty">
            <p>{t("studio.home.empty")}</p>
            <button type="button" className="studio-button is-primary" onClick={() => setCreating(true)}>{t("studio.home.createFirst")}</button>
          </div>
        )}
        {packs && packs.length > 0 && (
          <ul className="studio-pack-grid">
            {packs.map((pack) => (
              <li key={pack.id}>
                <Link className="studio-pack-card" href={`/studio/${encodeURIComponent(pack.id)}`}>
                  <span className="studio-pack-title">{pack.title}</span>
                  {pack.description && <span className="studio-pack-description">{pack.description}</span>}
                  <span className="studio-pack-meta">
                    <span className={`studio-badge is-status-${pack.status}`}>{t(`studio.status.${pack.status}`)}</span>
                    <span>{t("studio.header.version", { version: pack.version })}</span>
                    {pack.updatedAt && <span>{t("studio.home.updated", { date: formatStudioDate(pack.updatedAt, locale) })}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      {creating && <NewPackDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewPackDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveId = idEdited ? id : slugify(title);
  const idInvalid = effectiveId !== "" && !isSlug(effectiveId);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await studioFetch<{ pack: PackMeta }>("/packs", { method: "POST", body: { id: effectiveId, title, description } });
      router.push(`/studio/${encodeURIComponent(data.pack.id)}?section=skills`);
    } catch (cause) {
      setError(errorMessage(cause, t));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t("studio.home.newTitle")}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="studio-button" onClick={onClose}>{t("studio.common.cancel")}</button>
          <button type="button" className="studio-button is-primary" disabled={busy || !title.trim() || !isSlug(effectiveId)} onClick={() => void submit()}>{t("studio.home.create")}</button>
        </>
      )}
    >
      <div className="studio-field">
        <label htmlFor="studio-new-pack-title">{t("studio.config.title")}</label>
        <input id="studio-new-pack-title" className="studio-input" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="studio-field">
        <label htmlFor="studio-new-pack-id">{t("studio.home.id")}</label>
        <input
          id="studio-new-pack-id"
          className="studio-input studio-mono"
          value={effectiveId}
          maxLength={64}
          aria-invalid={idInvalid}
          aria-describedby="studio-new-pack-id-hint"
          onChange={(event) => { setIdEdited(true); setId(event.target.value); }}
        />
        <p id="studio-new-pack-id-hint" className={idInvalid ? "studio-hint is-error" : "studio-hint"}>{t("studio.home.idHint")}</p>
      </div>
      <div className="studio-field">
        <label htmlFor="studio-new-pack-description">{t("studio.config.description")}</label>
        <textarea id="studio-new-pack-description" className="studio-textarea" rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>
      <p className="studio-hint">{t("studio.home.newHint")}</p>
      {error && <Notice kind="error">{error}</Notice>}
    </Dialog>
  );
}
