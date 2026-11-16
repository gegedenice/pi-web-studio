"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { errorMessage, packPath, studioFetch } from "@/lib/studio/client";
import type { SkillFileInfo } from "@/lib/studio/skills";
import { FileEditor } from "./FileEditor";
import { ConfirmDialog, Dialog, Notice } from "./StudioUi";

// A skill's other files (references/, scripts/, assets/…): listed with their
// kind, opened and edited in place when they are text, added and deleted, one
// version each. The Studio never runs any of them.

const MARKDOWN = /\.(md|markdown)$/i;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function SkillFiles({ packId, skill, files, onChanged, onDirtyChange }: {
  packId: string;
  skill: string;
  files: SkillFileInfo[];
  /** A file was saved, added or deleted: the skill reloads (its links are checked again). */
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [fileDirty, setFileDirty] = useState(false);
  const markDirty = (dirty: boolean) => {
    setFileDirty(dirty);
    onDirtyChange(dirty);
  };
  const current = files.find((file) => file.path === open);
  const fullPath = (path: string) => `.pi/skills/${skill}/${path}`;

  const select = (path: string | null) => {
    if (fileDirty && !window.confirm(t("studio.editor.discardConfirm"))) return;
    markDirty(false);
    setOpen(path);
  };

  return (
    <section className="studio-card studio-skill-files" aria-labelledby="studio-skill-files-title">
      <div className="studio-section-header is-row">
        <div>
          <h3 id="studio-skill-files-title" className="studio-subtitle">{t("studio.skills.files")}</h3>
          <p className="studio-hint">{t("studio.skills.filesHint")}</p>
        </div>
        <button type="button" className="studio-button" onClick={() => setAdding(true)}>{t("studio.skills.fileAdd")}</button>
      </div>
      {files.length === 0 && <p className="studio-muted">{t("studio.skills.filesNone")}</p>}
      <ul className="studio-plain-list studio-file-list">
        {files.map((file) => (
          <li key={file.path}>
            <button
              type="button"
              className={`studio-file-row${open === file.path ? " is-selected" : ""}`}
              aria-expanded={open === file.path}
              onClick={() => select(open === file.path ? null : file.path)}
            >
              <span className="studio-mono">{file.path}</span>
              <span className={`studio-badge is-muted`}>{t(`studio.skills.fileKind.${file.kind}`)}</span>
              <span className="studio-hint">{formatSize(file.size)}{file.text ? "" : ` · ${t("studio.skills.fileBinary")}`}</span>
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <div className="studio-file-open">
          {current.kind === "script" && <Notice kind="warning">{t("studio.skills.fileScriptNote")}</Notice>}
          {current.text ? (
            <FileEditor
              key={current.path}
              packId={packId}
              path={fullPath(current.path)}
              label={current.path}
              description={t(`studio.skills.fileKindHint.${current.kind}`)}
              raw={!MARKDOWN.test(current.path)}
              onSaved={onChanged}
              onDirtyChange={markDirty}
            />
          ) : (
            <Notice kind="info">{t("studio.skills.fileBinaryHint", { size: formatSize(current.size) })}</Notice>
          )}
          <div className="studio-list-actions">
            <button type="button" className="studio-button is-danger" onClick={() => setDeleting(current.path)}>{t("studio.skills.fileDelete")}</button>
          </div>
        </div>
      )}
      {adding && (
        <AddFileDialog
          packId={packId}
          skill={skill}
          existing={files.map((file) => file.path)}
          onClose={() => setAdding(false)}
          onAdded={(path) => { setAdding(false); onChanged(); setOpen(path); }}
        />
      )}
      {deleting && (
        <DeleteFileDialog
          packId={packId}
          path={fullPath(deleting)}
          name={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => { setDeleting(null); setOpen(null); markDirty(false); onChanged(); }}
        />
      )}
    </section>
  );
}

function AddFileDialog({ packId, skill, existing, onClose, onAdded }: {
  packId: string;
  skill: string;
  existing: string[];
  onClose: () => void;
  onAdded: (path: string) => void;
}) {
  const { t } = useI18n();
  const [path, setPath] = useState("references/");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = path.trim().replace(/^\/+/, "");
  const valid = clean !== "" && !clean.endsWith("/") && clean !== "SKILL.md" && !clean.split("/").some((part) => part === "" || part === "." || part === "..");
  const taken = existing.includes(clean);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      // A save over a file that does not exist yet creates it (empty base hash).
      await studioFetch(packPath(packId, "/files"), { method: "PUT", body: { path: `.pi/skills/${skill}/${clean}`, content: "", baseHash: "" } });
      onAdded(clean);
    } catch (cause) {
      setError(errorMessage(cause, t));
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t("studio.skills.fileAddTitle")}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="studio-button" onClick={onClose}>{t("studio.common.cancel")}</button>
          <button type="button" className="studio-button is-primary" disabled={busy || !valid || taken} onClick={() => void submit()}>{t("studio.skills.fileAddAction")}</button>
        </>
      )}
    >
      <div className="studio-field">
        <label htmlFor="studio-skill-file-path">{t("studio.skills.filePath")}</label>
        <input id="studio-skill-file-path" className="studio-input studio-mono" value={path} onChange={(event) => setPath(event.target.value)} />
        <p className="studio-hint">{taken ? t("studio.skills.fileTaken") : t("studio.skills.filePathHint")}</p>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
    </Dialog>
  );
}

function DeleteFileDialog({ packId, path, name, onClose, onDeleted }: { packId: string; path: string; name: string; onClose: () => void; onDeleted: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <ConfirmDialog
        title={t("studio.skills.fileDeleteTitle", { name })}
        message={t("studio.skills.fileDeleteMessage")}
        confirmLabel={t("studio.skills.fileDelete")}
        danger
        busy={busy}
        onConfirm={() => {
          setBusy(true);
          studioFetch(packPath(packId, `/files?path=${encodeURIComponent(path)}`), { method: "DELETE" })
            .then(onDeleted, (cause) => { setError(errorMessage(cause, t)); setBusy(false); });
        }}
        onCancel={onClose}
      />
      {error && <Notice kind="error">{error}</Notice>}
    </>
  );
}
