"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { errorMessage, packPath, StudioRequestError, studioFetch } from "@/lib/studio/client";
import { isSlug, slugify } from "@/lib/studio/slug";
import type { SkillSummary, ValidationIssue } from "@/lib/studio/types";
import { FileHistory } from "../HistoryPanel";
import { SaveBar } from "../MarkdownEditor";
import { ConfirmDialog, Dialog, IssueBadge, Notice, useSaveShortcut, useUnsavedGuard, ValidationList } from "../StudioUi";

export interface SuiteSummary {
  name: string;
  titre: string;
  skill?: string;
  caseCount: number;
  issues: ValidationIssue[];
}

interface SuiteRow { id: string; requete: string; attendu: string; sources: string }

interface SuiteDocument extends SuiteSummary {
  raw: string;
  hash: string;
  meta: { titre?: string; skill?: string };
  cases: (SuiteRow & { line: number })[];
}

const suitePath = (packId: string, name: string) => packPath(packId, `/tests/${encodeURIComponent(name)}`);

export function SuitesTab({ packId, suites, skills, selected, onSelect, onChanged, onDirtyChange, advanced }: {
  packId: string;
  suites: SuiteSummary[];
  skills: SkillSummary[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  advanced: boolean;
}) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const current = selected && suites.some((suite) => suite.name === selected) ? selected : null;
  return (
    <div className="studio-split">
      <aside className="studio-list-pane" aria-label={t("studio.tests.suites")}>
        <div className="studio-list-actions">
          <button type="button" className="studio-button is-primary" onClick={() => setCreating(true)}>{t("studio.tests.newSuite")}</button>
        </div>
        {suites.length === 0 ? (
          <div className="studio-empty">
            <p>{t("studio.tests.empty")}</p>
            <button type="button" className="studio-button is-primary" onClick={() => setCreating(true)}>{t("studio.tests.createFirst")}</button>
          </div>
        ) : (
          <ul className="studio-item-list">
            {suites.map((suite) => (
              <li key={suite.name}>
                <button type="button" className={`studio-item${current === suite.name ? " is-selected" : ""}`} aria-current={current === suite.name ? "true" : undefined} onClick={() => onSelect(suite.name)}>
                  <span className="studio-item-title">{suite.titre}</span>
                  <IssueBadge issues={suite.issues} />
                  <span className="studio-item-sub">{t("studio.tests.caseCount", { count: suite.caseCount })}{suite.skill ? ` · ${suite.skill}` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className="studio-detail-pane">
        {current ? (
          <SuiteEditor key={current} packId={packId} name={current} skills={skills} advanced={advanced} onChanged={onChanged} onRenamed={(name) => { onChanged(); onSelect(name); }} onDeleted={() => { onChanged(); onSelect(null); }} onDirtyChange={onDirtyChange} />
        ) : (
          <p className="studio-muted studio-placeholder">{suites.length ? t("studio.tests.pick") : t("studio.tests.emptyHint")}</p>
        )}
      </div>
      {creating && <CreateSuiteDialog packId={packId} onClose={() => setCreating(false)} onCreated={(name) => { setCreating(false); onChanged(); onSelect(name); }} />}
    </div>
  );
}

function CreateSuiteDialog({ packId, onClose, onCreated }: { packId: string; onClose: () => void; onCreated: (name: string) => void }) {
  const { t } = useI18n();
  const [titre, setTitre] = useState("");
  const [name, setName] = useState("");
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effective = edited ? name : slugify(titre);
  const submit = async () => {
    setBusy(true);
    try {
      const data = await studioFetch<{ suite: SuiteDocument }>(packPath(packId, "/tests"), { method: "POST", body: { name: effective, titre } });
      onCreated(data.suite.name);
    } catch (cause) {
      setError(errorMessage(cause, t));
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t("studio.tests.newSuite")}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="studio-button" onClick={onClose}>{t("studio.common.cancel")}</button>
          <button type="button" className="studio-button is-primary" disabled={busy || !titre.trim() || !isSlug(effective)} onClick={() => void submit()}>{t("studio.tests.create")}</button>
        </>
      )}
    >
      <div className="studio-field">
        <label htmlFor="studio-new-suite-title">{t("studio.config.title")}</label>
        <input id="studio-new-suite-title" className="studio-input" value={titre} maxLength={200} onChange={(event) => setTitre(event.target.value)} />
      </div>
      <div className="studio-field">
        <label htmlFor="studio-new-suite-name">{t("studio.home.id")}</label>
        <input id="studio-new-suite-name" className="studio-input studio-mono" value={effective} maxLength={64} aria-invalid={effective !== "" && !isSlug(effective)} onChange={(event) => { setEdited(true); setName(event.target.value); }} />
        <p className="studio-hint">{t("studio.skills.nameHint")}</p>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
    </Dialog>
  );
}

function nextCaseId(rows: SuiteRow[]): string {
  const last = [...rows].reverse().find((row) => /\d+$/.test(row.id));
  if (!last) return rows.length ? `${rows[0].id}-2` : "CAS-01";
  const match = /^(.*?)(\d+)$/.exec(last.id)!;
  const taken = new Set(rows.map((row) => row.id));
  for (let n = Number(match[2]) + 1; ; n++) {
    const candidate = `${match[1]}${String(n).padStart(match[2].length, "0")}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function SuiteEditor({ packId, name, skills, advanced, onChanged, onRenamed, onDeleted, onDirtyChange }: {
  packId: string;
  name: string;
  skills: SkillSummary[];
  advanced: boolean;
  onChanged: () => void;
  onRenamed: (name: string) => void;
  onDeleted: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const [suite, setSuite] = useState<SuiteDocument | null>(null);
  const [titre, setTitre] = useState("");
  const [skill, setSkill] = useState("");
  const [rows, setRows] = useState<SuiteRow[]>([]);
  const [rawMode, setRawMode] = useState(false);
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<{ text: string; conflict?: boolean } | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const apply = (doc: SuiteDocument) => {
    setSuite(doc);
    setTitre(doc.meta.titre ?? "");
    setSkill(doc.meta.skill ?? "");
    setRows(doc.cases.map(({ id, requete, attendu, sources }) => ({ id, requete, attendu, sources })));
    setRaw(doc.raw);
    setIssues(doc.issues);
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      apply((await studioFetch<{ suite: SuiteDocument }>(suitePath(packId, name))).suite);
    } catch (cause) {
      setError({ text: errorMessage(cause, t) });
    }
  }, [packId, name, t]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!advanced) setRawMode(false); }, [advanced]);

  const tableDirty = suite !== null && (
    titre !== (suite.meta.titre ?? "") || skill !== (suite.meta.skill ?? "")
    || JSON.stringify(rows) !== JSON.stringify(suite.cases.map(({ id, requete, attendu, sources }) => ({ id, requete, attendu, sources })))
  );
  const dirty = suite !== null && (rawMode ? raw !== suite.raw : tableDirty);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useUnsavedGuard(dirty);

  const save = useCallback(async () => {
    if (!suite || !dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const body = rawMode
        ? { raw, baseHash: suite.hash, note }
        : { meta: { titre, skill }, cases: rows, baseHash: suite.hash, note };
      apply((await studioFetch<{ suite: SuiteDocument }>(suitePath(packId, name), { method: "PUT", body })).suite);
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
  }, [suite, dirty, saving, rawMode, raw, note, titre, skill, rows, packId, name, onChanged, t]);
  useSaveShortcut(() => void save(), dirty && !saving);

  const switchMode = (next: boolean) => {
    if (!suite || next === rawMode) return;
    if (dirty && !window.confirm(t("studio.editor.discardConfirm"))) return;
    apply(suite);
    setRawMode(next);
  };

  const setCell = (index: number, field: keyof SuiteRow, value: string) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  if (!suite) return error ? <Notice kind="error">{error.text}</Notice> : <p className="studio-muted">{t("studio.common.loading")}</p>;

  return (
    <div className="studio-section">
      <header className="studio-section-header is-row">
        <div>
          <h2 className="studio-title">{suite.titre}</h2>
          <p className="studio-muted">{t("studio.tests.editorIntro")}</p>
        </div>
        <div className="studio-list-actions">
          <button type="button" className="studio-button" onClick={() => setRenaming(true)} disabled={dirty}>{t("studio.skills.rename")}</button>
          <button type="button" className="studio-button is-danger" onClick={() => setDeleting(true)}>{t("studio.skills.delete")}</button>
        </div>
      </header>
      {error && (
        <Notice kind="error" actions={error.conflict ? <button type="button" className="studio-button" onClick={() => void load()}>{t("studio.editor.reload")}</button> : undefined}>{error.text}</Notice>
      )}
      <ValidationList issues={issues} emptyLabel={t("studio.validation.allGood")} />
      {advanced && (
        <div className="studio-segmented" role="group" aria-label={t("studio.skills.editMode")}>
          <button type="button" aria-pressed={!rawMode} onClick={() => switchMode(false)}>{t("studio.tests.tableMode")}</button>
          <button type="button" aria-pressed={rawMode} onClick={() => switchMode(true)}>{t("studio.tests.rawMode")}</button>
        </div>
      )}
      {rawMode ? (
        <div className="studio-editor">
          <label htmlFor="studio-suite-raw" className="studio-editor-label">{t("studio.tests.rawLabel")}</label>
          <textarea id="studio-suite-raw" className="studio-textarea studio-editor-area is-code" rows={20} value={raw} spellCheck={false} onChange={(event) => setRaw(event.target.value)} />
        </div>
      ) : (
        <>
          <div className="studio-field-row">
            <div className="studio-field">
              <label htmlFor="studio-suite-title">{t("studio.config.title")}</label>
              <input id="studio-suite-title" className="studio-input" value={titre} maxLength={200} onChange={(event) => setTitre(event.target.value)} />
            </div>
            <div className="studio-field">
              <label htmlFor="studio-suite-skill">{t("studio.tests.skill")}</label>
              <select id="studio-suite-skill" className="studio-input" value={skill} onChange={(event) => setSkill(event.target.value)}>
                <option value="">{t("studio.tests.noSkill")}</option>
                {skill && !skills.some((item) => item.name === skill) && <option value={skill}>{skill}</option>}
                {skills.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>
            </div>
          </div>
          <div className="studio-table-wrap">
            <table className="studio-table">
              <thead>
                <tr>
                  <th scope="col">{t("studio.tests.colId")}</th>
                  <th scope="col">{t("studio.tests.colQuery")}</th>
                  <th scope="col">{t("studio.tests.colExpected")}</th>
                  <th scope="col">{t("studio.tests.colSources")}</th>
                  <th scope="col"><span className="studio-visually-hidden">{t("studio.tests.actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td><input className="studio-input studio-mono" aria-label={t("studio.tests.colId")} value={row.id} maxLength={64} onChange={(event) => setCell(index, "id", event.target.value)} /></td>
                    <td><textarea className="studio-textarea" aria-label={t("studio.tests.colQuery")} rows={2} value={row.requete} onChange={(event) => setCell(index, "requete", event.target.value)} /></td>
                    <td><textarea className="studio-textarea" aria-label={t("studio.tests.colExpected")} rows={2} value={row.attendu} onChange={(event) => setCell(index, "attendu", event.target.value)} /></td>
                    <td><input className="studio-input" aria-label={t("studio.tests.colSources")} value={row.sources} onChange={(event) => setCell(index, "sources", event.target.value)} /></td>
                    <td><button type="button" className="studio-link-button" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>{t("studio.tests.removeRow")}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <button type="button" className="studio-button" onClick={() => setRows((current) => [...current, { id: nextCaseId(current), requete: "", attendu: "", sources: "" }])}>{t("studio.tests.addRow")}</button>
          </div>
        </>
      )}
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void save()}
        note={note}
        onNoteChange={setNote}
        extra={<button type="button" className="studio-button" aria-expanded={showHistory} onClick={() => setShowHistory((open) => !open)}>{t("studio.history.button")}</button>}
      />
      {showHistory && <FileHistory packId={packId} path={`tests/${name}.md`} refreshKey={savedAt} onRestored={() => { setSavedAt(Date.now()); void load(); onChanged(); }} />}
      {renaming && <RenameSuiteDialog packId={packId} name={name} onClose={() => setRenaming(false)} onRenamed={(next) => { setRenaming(false); onRenamed(next); }} />}
      {deleting && (
        <DeleteSuite packId={packId} name={name} titre={suite.titre} onClose={() => setDeleting(false)} onDeleted={() => { setDeleting(false); onDirtyChange(false); onDeleted(); }} />
      )}
    </div>
  );
}

function RenameSuiteDialog({ packId, name, onClose, onRenamed }: { packId: string; name: string; onClose: () => void; onRenamed: (name: string) => void }) {
  const { t } = useI18n();
  const [next, setNext] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    try {
      const data = await studioFetch<{ suite: SuiteDocument }>(suitePath(packId, name), { method: "PATCH", body: { name: next } });
      onRenamed(data.suite.name);
    } catch (cause) {
      setError(errorMessage(cause, t));
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t("studio.tests.renameTitle", { name })}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="studio-button" onClick={onClose}>{t("studio.common.cancel")}</button>
          <button type="button" className="studio-button is-primary" disabled={busy || !isSlug(next) || next === name} onClick={() => void submit()}>{t("studio.skills.rename")}</button>
        </>
      )}
    >
      <div className="studio-field">
        <label htmlFor="studio-rename-suite">{t("studio.skills.newName")}</label>
        <input id="studio-rename-suite" className="studio-input studio-mono" value={next} maxLength={64} onChange={(event) => setNext(event.target.value)} />
        <p className="studio-hint">{t("studio.skills.nameHint")}</p>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
    </Dialog>
  );
}

function DeleteSuite({ packId, name, titre, onClose, onDeleted }: { packId: string; name: string; titre: string; onClose: () => void; onDeleted: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await studioFetch(suitePath(packId, name), { method: "DELETE" });
      onDeleted();
    } catch {
      setBusy(false);
    }
  };
  return (
    <ConfirmDialog
      title={t("studio.tests.deleteTitle", { name: titre })}
      message={t("studio.tests.deleteMessage")}
      confirmLabel={t("studio.skills.delete")}
      danger
      busy={busy}
      onConfirm={() => void submit()}
      onCancel={onClose}
    />
  );
}
