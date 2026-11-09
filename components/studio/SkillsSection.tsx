"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { errorMessage, packPath, skillPath, StudioRequestError, studioFetch } from "@/lib/studio/client";
import { DESCRIPTION_MAX_LENGTH, isSlug, slugify } from "@/lib/studio/slug";
import type { SkillDocument, SkillSummary, ValidationIssue } from "@/lib/studio/types";
import { FileHistory } from "./HistoryPanel";
import { MarkdownEditor, SaveBar } from "./MarkdownEditor";
import { ConfirmDialog, Dialog, IssueBadge, Notice, useSaveShortcut, useUnsavedGuard, ValidationList } from "./StudioUi";

export function SkillsSection({ packId, skills, selected, onSelect, onChanged, onDirtyChange, advanced }: {
  packId: string;
  skills: SkillSummary[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  advanced: boolean;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const [dialog, setDialog] = useState<"create" | "import" | null>(null);
  const shown = skills.filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className="studio-split">
      <aside className="studio-list-pane" aria-label={t("studio.skills.list")}>
        <div className="studio-list-head">
          <h2 className="studio-title">{t("studio.nav.skills")}</h2>
          <div className="studio-list-actions">
            <button type="button" className="studio-button is-primary" onClick={() => setDialog("create")}>{t("studio.skills.new")}</button>
            <button type="button" className="studio-button" onClick={() => setDialog("import")}>{t("studio.skills.import")}</button>
          </div>
        </div>
        {skills.length > 0 && (
          <input
            type="search"
            className="studio-input"
            value={filter}
            placeholder={t("studio.skills.search")}
            aria-label={t("studio.skills.search")}
            onChange={(event) => setFilter(event.target.value)}
          />
        )}
        {skills.length === 0 ? (
          <div className="studio-empty">
            <p>{t("studio.skills.empty")}</p>
            <button type="button" className="studio-button is-primary" onClick={() => setDialog("create")}>{t("studio.skills.createFirst")}</button>
          </div>
        ) : (
          <ul className="studio-item-list">
            {shown.map((skill) => (
              <li key={skill.name}>
                <button
                  type="button"
                  className={`studio-item${selected === skill.name ? " is-selected" : ""}`}
                  aria-current={selected === skill.name ? "true" : undefined}
                  onClick={() => onSelect(skill.name)}
                >
                  <span className="studio-item-title">{skill.name}</span>
                  <IssueBadge issues={skill.issues} />
                  <span className="studio-item-sub">{skill.description || t("studio.skills.noDescription")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className="studio-detail-pane">
        {selected && skills.some((skill) => skill.name === selected) ? (
          <SkillEditor
            key={selected}
            packId={packId}
            name={selected}
            advanced={advanced}
            onChanged={onChanged}
            onRenamed={(name) => { onChanged(); onSelect(name); }}
            onDeleted={() => { onChanged(); onSelect(null); }}
            onDirtyChange={onDirtyChange}
          />
        ) : (
          <p className="studio-muted studio-placeholder">{skills.length ? t("studio.skills.pick") : t("studio.skills.emptyHint")}</p>
        )}
      </div>
      {dialog === "create" && (
        <CreateSkillDialog packId={packId} onClose={() => setDialog(null)} onCreated={(name) => { setDialog(null); onChanged(); onSelect(name); }} />
      )}
      {dialog === "import" && (
        <ImportSkillDialog packId={packId} onClose={() => setDialog(null)} onImported={(name) => { setDialog(null); onChanged(); onSelect(name); }} />
      )}
    </div>
  );
}

function NameField({ id, value, onChange, label }: { id: string; value: string; onChange: (value: string) => void; label: string }) {
  const { t } = useI18n();
  const invalid = value !== "" && !isSlug(value);
  return (
    <div className="studio-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="studio-input" value={value} maxLength={64} aria-invalid={invalid} aria-describedby={`${id}-hint`} onChange={(event) => onChange(event.target.value)} />
      <p id={`${id}-hint`} className={invalid ? "studio-hint is-error" : "studio-hint"}>{t("studio.skills.nameHint")}</p>
    </div>
  );
}

function CreateSkillDialog({ packId, onClose, onCreated }: { packId: string; onClose: () => void; onCreated: (name: string) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; issues?: ValidationIssue[] } | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await studioFetch<{ skill: SkillDocument }>(packPath(packId, "/skills"), { method: "POST", body: { name, description } });
      onCreated(data.skill.name);
    } catch (cause) {
      setError({ text: errorMessage(cause, t), issues: cause instanceof StudioRequestError ? cause.issues : undefined });
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t("studio.skills.newTitle")}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="studio-button" onClick={onClose}>{t("studio.common.cancel")}</button>
          <button type="button" className="studio-button is-primary" disabled={busy || !isSlug(name) || !description.trim()} onClick={() => void submit()}>{t("studio.skills.create")}</button>
        </>
      )}
    >
      <p className="studio-muted">{t("studio.skills.newIntro")}</p>
      <NameField id="studio-new-skill-name" value={name} onChange={setName} label={t("studio.skills.name")} />
      <DescriptionField id="studio-new-skill-description" value={description} onChange={setDescription} />
      {error && <Notice kind="error">{error.text}</Notice>}
      {error?.issues && <ValidationList issues={error.issues} />}
    </Dialog>
  );
}

interface PickedFile { path: string; file: File }

const FOLDER_MAX_FILES = 300;
const FOLDER_MAX_BYTES = 25 * 1024 * 1024;
const SKIPPED_PARTS = new Set([".DS_Store", "Thumbs.db", "desktop.ini", ".git", "__pycache__", "node_modules", ".venv", ".ipynb_checkpoints"]);

function isSkipped(path: string): boolean {
  const parts = path.split("/");
  return parts.some((part) => SKIPPED_PARTS.has(part)) || parts[parts.length - 1].startsWith("._");
}

/** A dropped folder's files, read through the browser's entries API, with their paths. */
async function readDroppedEntries(items: DataTransferItemList): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push({ path: `${prefix}${entry.name}`, file });
      return;
    }
    if (!entry.isDirectory) return;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
    }
  };
  const roots = Array.from(items).map((item) => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => Boolean(entry));
  for (const root of roots) await walk(root, "");
  return out;
}

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/** Paths without the picked folder itself, as the server will store them. */
function innerPath(path: string, all: PickedFile[]): string {
  const first = all[0]?.path.split("/")[0];
  const wrapped = all.every((item) => item.path.includes("/") && item.path.split("/")[0] === first);
  return wrapped ? path.split("/").slice(1).join("/") : path;
}

interface FolderImportResponse { skill: SkillDocument; files: string[]; skipped: string[]; scripts: string[] }

function ImportSkillDialog({ packId, onClose, onImported }: { packId: string; onClose: () => void; onImported: (name: string) => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"folder" | "file">("folder");
  const [raw, setRaw] = useState("");
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<FolderImportResponse | null>(null);
  const [error, setError] = useState<{ text: string; issues?: ValidationIssue[]; needsName?: boolean } | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError({ text: t("studio.error.fileTooLarge") });
      return;
    }
    setRaw(await file.text());
    if (!name) setName(slugify(file.name.replace(/\.md$/i, "").replace(/^skill$/i, "")));
  };

  const pick = (files: PickedFile[]) => {
    setError(null);
    setPicked(files.filter((item) => !isSkipped(item.path)));
  };

  const kept = picked;
  const totalBytes = kept.reduce((sum, item) => sum + item.file.size, 0);
  const hasSkillFile = kept.some((item) => innerPath(item.path, kept) === "SKILL.md");
  const scripts = kept.map((item) => innerPath(item.path, kept)).filter((path) => path.startsWith("scripts/") || /\.(sh|py|js|mjs|ts|rb|pl|ps1|bat|cmd|exe)$/i.test(path));
  const folderName = kept[0]?.path.includes("/") ? kept[0].path.split("/")[0] : "";
  const tooMany = kept.length > FOLDER_MAX_FILES;
  const tooLarge = totalBytes > FOLDER_MAX_BYTES;

  const fail = (cause: unknown) => {
    const failure = cause instanceof StudioRequestError ? cause : null;
    setError({ text: errorMessage(cause, t), issues: failure?.issues, needsName: failure?.code === "importNameMissing" });
    setBusy(false);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "file") {
        const data = await studioFetch<{ skill: SkillDocument }>(packPath(packId, "/skills"), { method: "POST", body: { import: raw, name: name || undefined } });
        onImported(data.skill.name);
        return;
      }
      const files = await Promise.all(kept.map(async (item) => ({ path: item.path, content: await toBase64(item.file) })));
      const data = await studioFetch<FolderImportResponse>(packPath(packId, "/skills"), { method: "POST", body: { importFolder: files, name: name || undefined } });
      if (data.scripts.length || data.skipped.length) {
        setDone(data);
        setBusy(false);
      } else onImported(data.skill.name);
    } catch (cause) {
      fail(cause);
    }
  };

  if (done) {
    return (
      <Dialog
        title={t("studio.skills.importTitle")}
        onClose={() => onImported(done.skill.name)}
        footer={<button type="button" className="studio-button is-primary" onClick={() => onImported(done.skill.name)}>{t("studio.skills.importOpen")}</button>}
      >
        <Notice kind="info">{t("studio.skills.importDone", { name: done.skill.name, count: done.files.length })}</Notice>
        {done.scripts.length > 0 && (
          <Notice kind="warning">
            {t("studio.skills.importScripts", { count: done.scripts.length })}
            <ul className="studio-plain-list studio-mono">{done.scripts.map((path) => <li key={path}>{path}</li>)}</ul>
          </Notice>
        )}
        {done.skipped.length > 0 && <p className="studio-hint">{t("studio.skills.importSkipped", { count: done.skipped.length })}</p>}
      </Dialog>
    );
  }

  const ready = mode === "file" ? Boolean(raw.trim()) : kept.length > 0 && hasSkillFile && !tooMany && !tooLarge;
  return (
    <Dialog
      title={t("studio.skills.importTitle")}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="studio-button" onClick={onClose}>{t("studio.common.cancel")}</button>
          <button type="button" className="studio-button is-primary" disabled={busy || !ready || (name !== "" && !isSlug(name))} onClick={() => void submit()}>
            {busy ? t("studio.skills.importing") : t("studio.skills.importAction")}
          </button>
        </>
      )}
    >
      <div className="studio-segmented" role="group" aria-label={t("studio.skills.importMode")}>
        <button type="button" aria-pressed={mode === "folder"} onClick={() => { setMode("folder"); setError(null); }}>{t("studio.skills.importFolderMode")}</button>
        <button type="button" aria-pressed={mode === "file"} onClick={() => { setMode("file"); setError(null); }}>{t("studio.skills.importFileMode")}</button>
      </div>
      {mode === "folder" ? (
        <>
          <p className="studio-muted">{t("studio.skills.importFolderIntro")}</p>
          <div
            className={`studio-dropzone${dragging ? " is-dragging" : ""}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void readDroppedEntries(event.dataTransfer.items).then(pick, () => setError({ text: t("studio.skills.importReadError") }));
            }}
          >
            <p>{t("studio.skills.importDrop")}</p>
            <label className="studio-button" htmlFor="studio-import-folder">{t("studio.skills.importChooseFolder")}</label>
            <input
              id="studio-import-folder"
              className="studio-visually-hidden"
              type="file"
              multiple
              {...{ webkitdirectory: "", directory: "" }}
              onChange={(event) => pick(Array.from(event.target.files ?? []).map((file) => ({ path: file.webkitRelativePath || file.name, file })))}
            />
          </div>
          {kept.length > 0 && (
            <div className="studio-card">
              <p>
                <strong>{folderName || t("studio.skills.importFolderUnnamed")}</strong>{" "}
                <span className="studio-hint">{t("studio.skills.importSummary", { count: kept.length, size: (totalBytes / (1024 * 1024)).toFixed(1) })}</span>
              </p>
              {!hasSkillFile && <Notice kind="error">{t("studio.error.importNoSkillFile")}</Notice>}
              {tooMany && <Notice kind="error">{t("studio.error.importTooManyFiles", { max: FOLDER_MAX_FILES })}</Notice>}
              {tooLarge && <Notice kind="error">{t("studio.error.importTooLarge", { max: FOLDER_MAX_BYTES / (1024 * 1024) })}</Notice>}
              {scripts.length > 0 && <Notice kind="warning">{t("studio.skills.importScripts", { count: scripts.length })}</Notice>}
              <details>
                <summary>{t("studio.skills.importFiles")}</summary>
                <ul className="studio-plain-list studio-mono">
                  {kept.slice(0, 100).map((item) => <li key={item.path}>{innerPath(item.path, kept)}</li>)}
                  {kept.length > 100 && <li>…</li>}
                </ul>
              </details>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="studio-muted">{t("studio.skills.importIntro")}</p>
          <div className="studio-field">
            <label htmlFor="studio-import-file">{t("studio.skills.importFile")}</label>
            <input id="studio-import-file" type="file" accept=".md,text/markdown,text/plain" onChange={(event) => void onFile(event.target.files?.[0])} />
          </div>
          <div className="studio-field">
            <label htmlFor="studio-import-text">{t("studio.skills.importPaste")}</label>
            <textarea id="studio-import-text" className="studio-textarea is-code" rows={10} value={raw} spellCheck={false} onChange={(event) => setRaw(event.target.value)} />
          </div>
        </>
      )}
      <NameField id="studio-import-name" value={name} onChange={setName} label={error?.needsName ? t("studio.skills.importNameRequired") : t("studio.skills.importName")} />
      {error && <Notice kind="error">{error.text}</Notice>}
      {error?.issues && <ValidationList issues={error.issues} />}
    </Dialog>
  );
}

function DescriptionField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  const over = value.length > DESCRIPTION_MAX_LENGTH;
  return (
    <div className="studio-field">
      <label htmlFor={id}>{t("studio.skills.description")}</label>
      <textarea id={id} className="studio-textarea" rows={3} value={value} aria-invalid={over || !value.trim()} aria-describedby={`${id}-hint`} onChange={(event) => onChange(event.target.value)} />
      <p id={`${id}-hint`} className={over ? "studio-hint is-error" : "studio-hint"}>
        {t("studio.skills.descriptionHint")} {t("studio.skills.descriptionCount", { count: value.length, max: DESCRIPTION_MAX_LENGTH })}
      </p>
    </div>
  );
}

function SkillEditor({ packId, name, advanced, onChanged, onRenamed, onDeleted, onDirtyChange }: {
  packId: string;
  name: string;
  advanced: boolean;
  onChanged: () => void;
  onRenamed: (name: string) => void;
  onDeleted: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const [skill, setSkill] = useState<SkillDocument | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [rawMode, setRawMode] = useState(false);
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ text: string; conflict?: boolean } | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [savedAt, setSavedAt] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const apply = (doc: SkillDocument) => {
    setSkill(doc);
    setDescription(doc.description);
    setBody(doc.body);
    setRaw(doc.raw);
    setIssues(doc.issues);
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await studioFetch<{ skill: SkillDocument; files: string[] }>(skillPath(packId, name));
      apply(data.skill);
      setFiles(data.files);
    } catch (cause) {
      setError({ text: errorMessage(cause, t) });
    }
  }, [packId, name, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!advanced) setRawMode(false); }, [advanced]);

  const dirty = skill !== null && (rawMode ? raw !== skill.raw : description !== skill.description || body !== skill.body);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useUnsavedGuard(dirty);

  const switchMode = (next: boolean) => {
    if (!skill || next === rawMode) return;
    if (dirty && !window.confirm(t("studio.editor.discardConfirm"))) return;
    setDescription(skill.description);
    setBody(skill.body);
    setRaw(skill.raw);
    setRawMode(next);
  };

  const save = useCallback(async () => {
    if (!skill || !dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const data = await studioFetch<{ issues: ValidationIssue[]; skill: SkillDocument }>(skillPath(packId, name), {
        method: "PUT",
        body: rawMode ? { raw, baseHash: skill.hash, note } : { description, body, baseHash: skill.hash, note },
      });
      apply(data.skill);
      setNote("");
      setSavedAt(Date.now());
      onChanged();
    } catch (cause) {
      const failure = cause instanceof StudioRequestError ? cause : null;
      if (failure?.issues) setIssues(failure.issues);
      setError({ text: errorMessage(cause, t), conflict: failure?.code === "conflict" });
    } finally {
      setSaving(false);
    }
  }, [skill, dirty, saving, packId, name, rawMode, raw, description, body, note, onChanged, t]);

  useSaveShortcut(() => void save(), dirty && !saving);

  if (!skill) return error ? <Notice kind="error">{error.text}</Notice> : <p className="studio-muted">{t("studio.common.loading")}</p>;

  const otherFiles = files.filter((file) => file !== "SKILL.md");
  return (
    <div className="studio-section">
      <header className="studio-section-header is-row">
        <div>
          <h2 className="studio-title">{skill.name}</h2>
          <p className="studio-muted">{t("studio.skills.editorIntro")}</p>
        </div>
        <div className="studio-list-actions">
          <button type="button" className="studio-button" onClick={() => setRenaming(true)} disabled={dirty}>{t("studio.skills.rename")}</button>
          <button type="button" className="studio-button is-danger" onClick={() => setDeleting(true)}>{t("studio.skills.delete")}</button>
        </div>
      </header>
      {error && (
        <Notice kind="error" actions={error.conflict ? <button type="button" className="studio-button" onClick={() => void load()}>{t("studio.editor.reload")}</button> : undefined}>
          {error.text}
        </Notice>
      )}
      <ValidationList issues={issues} emptyLabel={t("studio.validation.allGood")} />
      {advanced && (
        <div className="studio-segmented" role="group" aria-label={t("studio.skills.editMode")}>
          <button type="button" aria-pressed={!rawMode} onClick={() => switchMode(false)}>{t("studio.skills.formMode")}</button>
          <button type="button" aria-pressed={rawMode} onClick={() => switchMode(true)}>{t("studio.skills.rawMode")}</button>
        </div>
      )}
      {rawMode ? (
        <div className="studio-editor">
          <label htmlFor="studio-skill-raw" className="studio-editor-label">{t("studio.skills.rawLabel")}</label>
          <textarea id="studio-skill-raw" className="studio-textarea studio-editor-area is-code" rows={24} value={raw} spellCheck={false} onChange={(event) => setRaw(event.target.value)} />
        </div>
      ) : (
        <>
          <div className="studio-field">
            <span className="studio-field-label">{t("studio.skills.name")}</span>
            <span className="studio-readonly">{skill.name}</span>
          </div>
          <DescriptionField id="studio-skill-description" value={description} onChange={setDescription} />
          <MarkdownEditor id="studio-skill-body" label={t("studio.skills.instructions")} value={body} onChange={setBody} />
        </>
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
      {otherFiles.length > 0 && (
        <section className="studio-card">
          <h3 className="studio-subtitle">{t("studio.skills.files")}</h3>
          <ul className="studio-plain-list studio-mono">{otherFiles.map((file) => <li key={file}>{file}</li>)}</ul>
          <p className="studio-hint">{t("studio.skills.filesHint")}</p>
        </section>
      )}
      {showHistory && (
        <FileHistory
          packId={packId}
          path={`.pi/skills/${name}/SKILL.md`}
          refreshKey={savedAt}
          onRestored={() => { setSavedAt(Date.now()); void load(); onChanged(); }}
        />
      )}
      {renaming && <RenameSkillDialog packId={packId} name={name} onClose={() => setRenaming(false)} onRenamed={(next) => { setRenaming(false); onRenamed(next); }} />}
      {deleting && (
        <DeleteSkill packId={packId} name={name} onClose={() => setDeleting(false)} onDeleted={() => { setDeleting(false); onDirtyChange(false); onDeleted(); }} />
      )}
    </div>
  );
}

function RenameSkillDialog({ packId, name, onClose, onRenamed }: { packId: string; name: string; onClose: () => void; onRenamed: (name: string) => void }) {
  const { t } = useI18n();
  const [next, setNext] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    try {
      const data = await studioFetch<{ skill: SkillDocument }>(skillPath(packId, name), { method: "PATCH", body: { name: next } });
      onRenamed(data.skill.name);
    } catch (cause) {
      setError(errorMessage(cause, t));
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t("studio.skills.renameTitle", { name })}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="studio-button" onClick={onClose}>{t("studio.common.cancel")}</button>
          <button type="button" className="studio-button is-primary" disabled={busy || !isSlug(next) || next === name} onClick={() => void submit()}>{t("studio.skills.rename")}</button>
        </>
      )}
    >
      <NameField id="studio-rename-skill" value={next} onChange={setNext} label={t("studio.skills.newName")} />
      {error && <Notice kind="error">{error}</Notice>}
    </Dialog>
  );
}

function DeleteSkill({ packId, name, onClose, onDeleted }: { packId: string; name: string; onClose: () => void; onDeleted: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    try {
      await studioFetch(skillPath(packId, name), { method: "DELETE" });
      onDeleted();
    } catch (cause) {
      setError(errorMessage(cause, t));
      setBusy(false);
    }
  };
  return (
    <>
      <ConfirmDialog
        title={t("studio.skills.deleteTitle", { name })}
        message={t("studio.skills.deleteMessage", { name })}
        confirmLabel={t("studio.skills.delete")}
        danger
        busy={busy}
        onConfirm={() => void submit()}
        onCancel={onClose}
      />
      {error && <Notice kind="error">{error}</Notice>}
    </>
  );
}
