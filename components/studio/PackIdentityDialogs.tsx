"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { errorMessage, packPath, studioFetch } from "@/lib/studio/client";
import type { PublishedVersion } from "@/lib/studio/release/publish";
import { isSlug } from "@/lib/studio/slug";
import type { PackDetails, PackMeta } from "@/lib/studio/types";
import { Dialog, Notice } from "./StudioUi";

// The pack's name, slug and description (header and Configuration), and its
// deletion (Configuration). A slug change moves the pack's folder: its address
// changes, its history and published versions stay (STUDIO-NOTES §19).

export function PackIdentityDialog({ pack, onClose, onSaved }: {
  pack: PackDetails;
  onClose: () => void;
  /** `id` is the pack's slug after the save (a new one when it was renamed). */
  onSaved: (id: string) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(pack.meta.title);
  const [description, setDescription] = useState(pack.meta.description);
  const [slug, setSlug] = useState(pack.meta.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanSlug = slug.trim();
  const slugChanged = cleanSlug !== pack.meta.id;
  const textChanged = title.trim() !== pack.meta.title || description.trim() !== pack.meta.description;
  const slugInvalid = !isSlug(cleanSlug);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (textChanged) {
        await studioFetch(packPath(pack.meta.id), { method: "PATCH", body: { title, description } });
      }
      if (slugChanged) {
        const { meta } = await studioFetch<{ meta: PackMeta }>(packPath(pack.meta.id, "/rename"), { method: "POST", body: { id: cleanSlug } });
        onSaved(meta.id);
        return;
      }
      onSaved(pack.meta.id);
    } catch (cause) {
      setError(errorMessage(cause, t));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t("studio.identity.title")}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="studio-button" onClick={onClose} disabled={busy}>{t("studio.common.cancel")}</button>
          <button
            type="button"
            className="studio-button is-primary"
            disabled={busy || !title.trim() || slugInvalid || (!slugChanged && !textChanged)}
            onClick={() => void submit()}
          >
            {t("studio.identity.save")}
          </button>
        </>
      )}
    >
      <div className="studio-form">
        <div className="studio-field">
          <label htmlFor="studio-identity-title">{t("studio.config.title")}</label>
          <input id="studio-identity-title" className="studio-input" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="studio-field">
          <label htmlFor="studio-identity-slug">{t("studio.home.id")}</label>
          <input
            id="studio-identity-slug"
            className="studio-input studio-mono"
            value={slug}
            maxLength={64}
            aria-invalid={slugInvalid}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
          />
          <p className={slugInvalid ? "studio-hint is-error" : "studio-hint"}>{t("studio.home.idHint")}</p>
        </div>
        {slugChanged && !slugInvalid && <Notice kind="warning">{t("studio.identity.slugWarning", { from: pack.meta.id, to: cleanSlug })}</Notice>}
        <div className="studio-field">
          <label htmlFor="studio-identity-description">{t("studio.config.description")}</label>
          <textarea id="studio-identity-description" className="studio-textarea" rows={4} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
    </Dialog>
  );
}

export function DeletePackDialog({ pack, onClose, onDeleted }: { pack: PackDetails; onClose: () => void; onDeleted: () => void }) {
  const { t } = useI18n();
  const id = pack.meta.id;
  const [typed, setTyped] = useState("");
  const [versions, setVersions] = useState<PublishedVersion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    studioFetch<{ versions: PublishedVersion[] }>(packPath(id, "/versions"))
      .then((data) => setVersions(data.versions))
      .catch(() => setVersions([]));
  }, [id]);

  // A validated or published pack is what colleagues rely on: the warning says so first.
  const relied = pack.meta.status === "valide" || (versions?.length ?? 0) > 0;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await studioFetch(packPath(id), { method: "DELETE", body: { confirm: typed.trim() } });
      onDeleted();
    } catch (cause) {
      setError(errorMessage(cause, t));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t("studio.deletePack.title", { title: pack.meta.title })}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="studio-button" onClick={onClose} disabled={busy}>{t("studio.common.cancel")}</button>
          <button type="button" className="studio-button is-danger" disabled={busy || typed.trim() !== id} onClick={() => void submit()}>
            {t("studio.deletePack.action")}
          </button>
        </>
      )}
    >
      {relied && (
        <Notice kind="error">
          <strong>{t("studio.deletePack.reliedTitle")}</strong>{" "}
          {t(pack.meta.status === "valide" ? "studio.deletePack.reliedValid" : "studio.deletePack.reliedPublished", { count: versions?.length ?? 0 })}
        </Notice>
      )}
      <p>{t("studio.deletePack.message")}</p>
      <p className="studio-hint">{t("studio.deletePack.recover")}</p>
      <div className="studio-field">
        <label htmlFor="studio-delete-pack-confirm">{t("studio.deletePack.confirm", { id })}</label>
        <input id="studio-delete-pack-confirm" className="studio-input studio-mono" value={typed} autoComplete="off" onChange={(event) => setTyped(event.target.value)} />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
    </Dialog>
  );
}
