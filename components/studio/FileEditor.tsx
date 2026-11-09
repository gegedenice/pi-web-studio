"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { errorMessage, packPath, StudioRequestError, studioFetch } from "@/lib/studio/client";
import type { TextDocument } from "@/lib/studio/types";
import { FileHistory } from "./HistoryPanel";
import { MarkdownEditor, SaveBar } from "./MarkdownEditor";
import { Notice, useSaveShortcut, useUnsavedGuard } from "./StudioUi";

/**
 * One editable pack file: load, edit, save as a version (button or
 * Ctrl/Cmd+S), its versions beside it. A file changed elsewhere since it was
 * opened is never overwritten: the save is refused and the page offers to reload.
 */
export function FileEditor({ packId, path, label, description, raw, onSaved, onDirtyChange }: {
  packId: string;
  path: string;
  label: string;
  description?: string;
  /** A plain text field without preview (settings in advanced mode). */
  raw?: boolean;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<TextDocument | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; conflict: boolean } | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const dirty = doc !== null && draft !== doc.content;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useUnsavedGuard(dirty);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await studioFetch<{ file: TextDocument }>(packPath(packId, `/files?path=${encodeURIComponent(path)}`));
      setDoc(data.file);
      setDraft(data.file.content);
    } catch (cause) {
      setError({ text: errorMessage(cause, t), conflict: false });
    }
  }, [packId, path, t]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    if (!doc || !dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const data = await studioFetch<{ file: TextDocument }>(packPath(packId, "/files"), {
        method: "PUT",
        body: { path, content: draft, baseHash: doc.hash, note },
      });
      setDoc(data.file);
      setDraft(data.file.content);
      setNote("");
      setSavedAt(Date.now());
      onSaved();
    } catch (cause) {
      setError({ text: errorMessage(cause, t), conflict: cause instanceof StudioRequestError && cause.code === "conflict" });
    } finally {
      setSaving(false);
    }
  }, [doc, dirty, saving, packId, path, draft, note, onSaved, t]);

  useSaveShortcut(() => void save(), dirty && !saving);

  if (!doc) {
    return error ? <Notice kind="error">{error.text}</Notice> : <p className="studio-muted">{t("studio.common.loading")}</p>;
  }

  const fieldId = `studio-file-${path.replace(/[^a-z0-9]+/gi, "-")}`;
  return (
    <div className="studio-file-editor">
      {description && <p className="studio-muted">{description}</p>}
      {!doc.exists && <Notice>{t("studio.editor.newFile")}</Notice>}
      {error && (
        <Notice
          kind="error"
          actions={error.conflict ? <button type="button" className="studio-button" onClick={() => void load()}>{t("studio.editor.reload")}</button> : undefined}
        >
          {error.text}
        </Notice>
      )}
      {raw ? (
        <div className="studio-editor">
          <label htmlFor={fieldId} className="studio-editor-label">{label}</label>
          <textarea id={fieldId} className="studio-textarea studio-editor-area is-code" rows={14} value={draft} spellCheck={false} onChange={(event) => setDraft(event.target.value)} />
        </div>
      ) : (
        <MarkdownEditor id={fieldId} label={label} value={draft} onChange={setDraft} />
      )}
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void save()}
        note={note}
        onNoteChange={setNote}
        extra={(
          <button type="button" className="studio-button" aria-expanded={showHistory} onClick={() => setShowHistory((open) => !open)}>
            {t("studio.history.button")}
          </button>
        )}
      />
      {showHistory && (
        <FileHistory
          packId={packId}
          path={path}
          refreshKey={savedAt}
          onRestored={() => { setSavedAt(Date.now()); void load(); onSaved(); }}
        />
      )}
    </div>
  );
}
