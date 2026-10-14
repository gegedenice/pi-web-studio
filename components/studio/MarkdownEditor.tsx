"use client";

import { useRef, useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { useI18n } from "@/hooks/useI18n";

const INDENT = "  ";

/**
 * Tab and Shift+Tab on a textarea: indent or outdent the selected lines, or
 * insert two spaces at the cursor. Returns the new value and selection.
 */
export function applyTabKey(value: string, start: number, end: number, outdent: boolean): { value: string; start: number; end: number } {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const multiline = value.slice(start, end).includes("\n");
  if (!outdent && !multiline) {
    return { value: value.slice(0, start) + INDENT + value.slice(end), start: start + INDENT.length, end: start + INDENT.length };
  }
  const blockEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const lines = value.slice(lineStart, blockEnd).split("\n");
  let firstShift = 0;
  let total = 0;
  const changed = lines.map((line, index) => {
    if (!outdent) {
      if (index === 0) firstShift = INDENT.length;
      total += INDENT.length;
      return INDENT + line;
    }
    const removed = line.startsWith(INDENT) ? INDENT.length : line.startsWith(" ") || line.startsWith("\t") ? 1 : 0;
    if (index === 0) firstShift = -removed;
    total -= removed;
    return line.slice(removed);
  });
  const next = value.slice(0, lineStart) + changed.join("\n") + value.slice(blockEnd);
  return {
    value: next,
    start: Math.max(lineStart, start + firstShift),
    end: Math.max(lineStart, end + total),
  };
}

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
