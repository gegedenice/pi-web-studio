"use client";

import { useRef, useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { useI18n } from "@/hooks/useI18n";
import { applyTabKey } from "@/lib/studio/text-edit";

/**
 * A plain text area with a preview, for AGENTS.md, the system prompt and a
 * skill's instructions. Tab indents; Escape then Tab leaves the field, so a
 * keyboard user is never trapped in it.
 */
export function MarkdownEditor({ id, label, value, onChange, disabled, rows = 22, hint }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  rows?: number;
  hint?: string;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState(false);
  const releaseTab = useRef(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      releaseTab.current = true;
      return;
    }
    if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey) {
      releaseTab.current = false;
      return;
    }
    if (releaseTab.current) {
      releaseTab.current = false;
      return;
    }
    event.preventDefault();
    const area = event.currentTarget;
    const next = applyTabKey(area.value, area.selectionStart, area.selectionEnd, event.shiftKey);
    onChange(next.value);
    requestAnimationFrame(() => {
      areaRef.current?.setSelectionRange(next.start, next.end);
    });
  };

  return (
    <div className="studio-editor">
      <div className="studio-editor-bar">
        <label htmlFor={id} className="studio-editor-label">{label}</label>
        <div className="studio-segmented" role="group" aria-label={t("studio.editor.view")}>
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>{t("studio.editor.edit")}</button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>{t("studio.editor.preview")}</button>
        </div>
      </div>
      {preview ? (
        <div className="studio-editor-preview">
          {value.trim() ? <MarkdownBody>{value}</MarkdownBody> : <p className="studio-muted">{t("studio.editor.emptyPreview")}</p>}
        </div>
      ) : (
        <textarea
          ref={areaRef}
          id={id}
          className="studio-textarea studio-editor-area"
          value={value}
          rows={rows}
          disabled={disabled}
          spellCheck
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={`${id}-hint`}
        />
      )}
      <p id={`${id}-hint`} className="studio-hint">{hint ? `${hint} ` : ""}{t("studio.editor.keys")}</p>
    </div>
  );
}

/** The save row under an editor: unsaved marker, optional version note, Enregistrer. */
export function SaveBar({ dirty, saving, onSave, note, onNoteChange, extra }: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  note: string;
  onNoteChange: (note: string) => void;
  extra?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="studio-savebar">
      <span className={`studio-dirty${dirty ? " is-dirty" : ""}`} aria-live="polite">
        {dirty ? t("studio.editor.unsaved") : t("studio.editor.saved")}
      </span>
      <input
        type="text"
        className="studio-input studio-note"
        value={note}
        maxLength={200}
        placeholder={t("studio.editor.notePlaceholder")}
        aria-label={t("studio.editor.note")}
        onChange={(event) => onNoteChange(event.target.value)}
      />
      {extra}
      <button type="button" className="studio-button is-primary" onClick={onSave} disabled={!dirty || saving}>
        {saving ? t("studio.common.saving") : t("studio.common.save")}
      </button>
    </div>
  );
}
