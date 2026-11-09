"use client";

import { useCallback, useEffect, useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { useI18n } from "@/hooks/useI18n";
import { errorMessage, packPath, studioFetch } from "@/lib/studio/client";
import type { DeletedSkill, HistoryEntry } from "@/lib/studio/types";
import { ConfirmDialog, Dialog, formatStudioDate, Notice } from "./StudioUi";

/** Versions of one file, with a preview and « Restaurer cette version ». */
export function FileHistory({ packId, path, refreshKey, onRestored, canRestore = true }: {
  packId: string;
  path: string;
  refreshKey: number;
  onRestored: () => void;
  canRestore?: boolean;
}) {
  const { t, locale } = useI18n();
  const [versions, setVersions] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ entry: HistoryEntry; content: string } | null>(null);
  const [confirm, setConfirm] = useState<HistoryEntry | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    studioFetch<{ versions: HistoryEntry[] }>(packPath(packId, `/history?path=${encodeURIComponent(path)}`))
      .then((data) => { if (!cancelled) setVersions(data.versions); })
      .catch((cause) => { if (!cancelled) setError(errorMessage(cause, t)); });
    return () => { cancelled = true; };
  }, [packId, path, refreshKey, t]);

  const open = async (entry: HistoryEntry) => {
    try {
      const data = await studioFetch<{ version: { content: string } }>(packPath(packId, `/history?path=${encodeURIComponent(path)}&rev=${entry.rev}`));
      setPreview({ entry, content: data.version.content });
    } catch (cause) {
      setError(errorMessage(cause, t));
    }
  };

  const restore = async (entry: HistoryEntry) => {
    setBusy(true);
    try {
      await studioFetch(packPath(packId, "/history"), { method: "POST", body: { action: "restore-file", path, rev: entry.rev } });
      setConfirm(null);
      setPreview(null);
      onRestored();
    } catch (cause) {
      setConfirm(null);
      setError(errorMessage(cause, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="studio-history" aria-label={t("studio.history.fileTitle")}>
      <h3 className="studio-subtitle">{t("studio.history.fileTitle")}</h3>
      {error && <Notice kind="error">{error}</Notice>}
      {versions === null && !error && <p className="studio-muted">{t("studio.common.loading")}</p>}
      {versions?.length === 0 && <p className="studio-muted">{t("studio.history.noVersion")}</p>}
      <ol className="studio-history-list">
        {versions?.map((entry, index) => (
          <li key={entry.rev} className="studio-history-item">
            <div className="studio-history-meta">
              <strong>{formatStudioDate(entry.date, locale)}</strong>
              <span>{entry.author}</span>
              {index === 0 && <span className="studio-badge is-ok">{t("studio.history.current")}</span>}
            </div>
            <div className="studio-history-message">{entry.message.replace(/^\[[^\]]+\]\s*/, "")}</div>
            <div className="studio-history-actions">
              <button type="button" className="studio-link-button" onClick={() => void open(entry)}>{t("studio.history.view")}</button>
              {index > 0 && canRestore && (
                <button type="button" className="studio-link-button" onClick={() => setConfirm(entry)}>{t("studio.history.restore")}</button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {preview && (
        <Dialog
          title={t("studio.history.previewTitle", { date: formatStudioDate(preview.entry.date, locale) })}
          onClose={() => setPreview(null)}
          footer={(
            <>
              <button type="button" className="studio-button" onClick={() => setPreview(null)}>{t("studio.common.close")}</button>
              {canRestore && versions?.[0]?.rev !== preview.entry.rev && (
                <button type="button" className="studio-button is-primary" onClick={() => setConfirm(preview.entry)}>{t("studio.history.restore")}</button>
              )}
            </>
          )}
        >
          <div className="studio-history-preview"><MarkdownBody>{preview.content}</MarkdownBody></div>
        </Dialog>
      )}
      {confirm && (
        <ConfirmDialog
          title={t("studio.history.restoreTitle")}
          message={t("studio.history.restoreMessage", { date: formatStudioDate(confirm.date, locale) })}
          confirmLabel={t("studio.history.restore")}
          busy={busy}
          onConfirm={() => void restore(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  );
}

/** Pack-level history: every version, and the deleted skills that can come back. */
export function PackHistory({ packId, refreshKey, onRestored, describePath }: {
  packId: string;
  refreshKey: number;
  onRestored: () => void;
  describePath: (path: string) => string;
}) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<{ versions: HistoryEntry[]; deletedSkills: DeletedSkill[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<DeletedSkill | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    studioFetch<{ versions: HistoryEntry[]; deletedSkills: DeletedSkill[] }>(packPath(packId, "/history"))
      .then(setData)
      .catch((cause) => setError(errorMessage(cause, t)));
  }, [packId, t]);

  useEffect(load, [load, refreshKey]);

  const restoreSkill = async (skill: DeletedSkill) => {
    setBusy(true);
    try {
      await studioFetch(packPath(packId, "/history"), { method: "POST", body: { action: "restore-skill", name: skill.name, rev: skill.rev } });
      setConfirm(null);
      onRestored();
      load();
    } catch (cause) {
      setConfirm(null);
      setError(errorMessage(cause, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="studio-section">
      <header className="studio-section-header">
        <h2 className="studio-title">{t("studio.history.packTitle")}</h2>
        <p className="studio-muted">{t("studio.history.packIntro")}</p>
      </header>
      {error && <Notice kind="error">{error}</Notice>}
      {data && data.deletedSkills.length > 0 && (
        <section className="studio-card">
          <h3 className="studio-subtitle">{t("studio.history.deletedSkills")}</h3>
          <ul className="studio-plain-list">
            {data.deletedSkills.map((skill) => (
              <li key={skill.name} className="studio-row">
                <span>
                  <strong>{skill.name}</strong>
                  <span className="studio-muted"> — {t("studio.history.deletedBy", { date: formatStudioDate(skill.date, locale), author: skill.author })}</span>
                </span>
                <button type="button" className="studio-button" onClick={() => setConfirm(skill)}>{t("studio.history.restoreSkill")}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data === null && !error && <p className="studio-muted">{t("studio.common.loading")}</p>}
      <ol className="studio-history-list">
        {data?.versions.map((entry) => (
          <li key={entry.rev} className="studio-history-item">
            <div className="studio-history-meta">
              <strong>{formatStudioDate(entry.date, locale)}</strong>
              <span>{entry.author}</span>
            </div>
            <div className="studio-history-message">{entry.message.replace(/^\[[^\]]+\]\s*/, "")}</div>
            {entry.changes && entry.changes.length > 0 && (
              <div className="studio-muted studio-history-files">
                {[...new Set(entry.changes.map((change) => describePath(change.path)))].join(" · ")}
              </div>
            )}
          </li>
        ))}
      </ol>
      {confirm && (
        <ConfirmDialog
          title={t("studio.history.restoreSkillTitle", { name: confirm.name })}
          message={t("studio.history.restoreSkillMessage", { name: confirm.name })}
          confirmLabel={t("studio.history.restoreSkill")}
          busy={busy}
          onConfirm={() => void restoreSkill(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
