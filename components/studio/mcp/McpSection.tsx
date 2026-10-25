"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { errorMessage, packPath, StudioRequestError, studioFetch } from "@/lib/studio/client";
import type { InspectionResult } from "@/lib/studio/mcp/inspect";
import { checkServerForm, MCP_FILE, type McpFormProblem, type McpServerForm } from "@/lib/studio/mcp/policy";
import type { GlobalMcpServer, McpOverview, McpServerSummary } from "@/lib/studio/mcp/servers";
import { isSlug } from "@/lib/studio/slug";
import type { PackDetails, ValidationIssue } from "@/lib/studio/types";
import { setLastSettingsSection } from "@/lib/settings-navigation";
import { FileEditor } from "../FileEditor";
import { FileHistory } from "../HistoryPanel";
import { SaveBar } from "../MarkdownEditor";
import { ConfirmDialog, formatStudioDate, Notice, useSaveShortcut, useUnsavedGuard, ValidationList } from "../StudioUi";

const NEW = "nouveau";
const EMPTY_FORM: McpServerForm = { name: "", url: "", description: "", auth: "none", tokenVariable: "", timeout: null, toolExposure: {} };
const serverPath = (packId: string, name: string) => packPath(packId, `/mcp/${encodeURIComponent(name)}`);

function stateOf(server: McpServerSummary): { key: string; tone: string } {
  if (!server.enabled) return { key: "disabled", tone: "muted" };
  if (server.outside) return { key: "outside", tone: "warning" };
  if (server.invalid) return { key: "invalid", tone: "error" };
  if (server.tokenVariable && !server.tokenVariableSet) return { key: "variableMissing", tone: "warning" };
  if (!server.inspection) return { key: server.signedIn ? "signedIn" : "toInspect", tone: "muted" };
  if (server.inspection.state === "needs-auth") return { key: "needsAuth", tone: "warning" };
  return server.inspection.ok ? { key: "inspected", tone: "ok" } : { key: "failed", tone: "error" };
}

export function McpSection({ packId, pack, advanced, item, onSelect, onChanged, onDirtyChange }: {
  packId: string;
  pack: PackDetails;
  advanced: boolean;
  item: string | null;
  onSelect: (item: string | null) => void;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const [overview, setOverview] = useState<McpOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    try {
      setOverview(await studioFetch<McpOverview>(packPath(packId, "/mcp")));
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, t));
    }
  }, [packId, t]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const changed = useCallback(() => { setRefreshKey((key) => key + 1); onChanged(); }, [onChanged]);

  if (!overview) return error ? <Notice kind="error">{error}</Notice> : <p className="studio-muted">{t("studio.common.loading")}</p>;
  const selected = item === NEW ? NEW : overview.servers.find((server) => server.name === item)?.name ?? overview.servers[0]?.name ?? null;
  const current = overview.servers.find((server) => server.name === selected);

  return (
    <div className="studio-section">
      <header className="studio-section-header">
        <h2 className="studio-title">{t("studio.nav.mcp")}</h2>
        <p className="studio-muted">{t("studio.mcp.intro")}</p>
      </header>
      {error && <Notice kind="error">{error}</Notice>}
      {overview.fileInvalid && <Notice kind="error">{t("studio.mcp.fileInvalid")}</Notice>}
      {overview.codemodeOnly && <Notice kind="warning">{t("studio.mcp.codemodeOnly")}</Notice>}
      {!pack.piLoadsProject && <Notice kind="warning">{t("studio.mcp.untrusted")}</Notice>}
      <div className="studio-split">
        <aside className="studio-list-pane" aria-label={t("studio.mcp.list")}>
          <div className="studio-list-actions">
            <button type="button" className="studio-button is-primary" disabled={overview.fileInvalid} onClick={() => onSelect(NEW)}>{t("studio.mcp.new")}</button>
          </div>
          {overview.servers.length === 0 && selected !== NEW && (
            <div className="studio-empty"><p>{t("studio.mcp.empty")}</p></div>
          )}
          <ul className="studio-item-list">
            {overview.servers.map((server) => {
              const state = stateOf(server);
              return (
                <li key={server.name}>
                  <button type="button" className={`studio-item${selected === server.name ? " is-selected" : ""}`} aria-current={selected === server.name ? "true" : undefined} onClick={() => onSelect(server.name)}>
                    <span className="studio-item-title">{server.name}</span>
                    <span className={`studio-badge is-${state.tone}`}>{t(`studio.mcp.state.${state.key}`)}</span>
                    <span className="studio-item-sub">{server.description || server.form?.url || server.url || t(`studio.mcp.outside.${server.outside}`)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {overview.globals.length > 0 && <GlobalServers packId={packId} globals={overview.globals} onChanged={changed} />}
        </aside>
        <div className="studio-detail-pane">
          {selected === NEW && (
            <ServerEditor key="new" packId={packId} packDir={overview.packDir} pack={pack} advanced={advanced} onSaved={(name) => { changed(); onSelect(name); }} onDeleted={() => onSelect(null)} onDirtyChange={onDirtyChange} />
          )}
          {current && current.form && (
            <ServerEditor key={`${current.name}:${current.entryHash}`} packId={packId} packDir={overview.packDir} pack={pack} advanced={advanced} server={current} onInspected={changed} onSaved={(name) => { changed(); onSelect(name); }} onDeleted={() => { changed(); onSelect(null); }} onDirtyChange={onDirtyChange} />
          )}
          {current && !current.form && <OutsideServer key={current.name} packId={packId} packDir={overview.packDir} pack={pack} server={current} onChanged={changed} onDeleted={() => { changed(); onSelect(null); }} />}
          {!current && selected !== NEW && <p className="studio-muted studio-placeholder">{t("studio.mcp.emptyHint")}</p>}
        </div>
      </div>
      {advanced && (
        <section className="studio-card">
          <h3 className="studio-subtitle">{t("studio.mcp.rawTitle")}</h3>
          <FileEditor key={refreshKey} packId={packId} path={MCP_FILE} label={t("studio.mcp.rawLabel")} description={t("studio.mcp.rawIntro")} raw onSaved={changed} onDirtyChange={onDirtyChange} />
        </section>
      )}
    </div>
  );
}

function GlobalServers({ packId, globals, onChanged }: { packId: string; globals: GlobalMcpServer[]; onChanged: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = async (server: GlobalMcpServer, enabled: boolean) => {
    setBusy(server.name);
    setError(null);
    try {
      await studioFetch(packPath(packId, "/mcp"), { method: "POST", body: { global: server.name, enabled } });
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="studio-globals" aria-labelledby="studio-mcp-globals">
      <h3 id="studio-mcp-globals" className="studio-subtitle">{t("studio.mcp.globalsTitle")}</h3>
      <p className="studio-hint">{t("studio.mcp.globalsIntro")}</p>
      {error && <Notice kind="error">{error}</Notice>}
      <ul className="studio-plain-list">
        {globals.map((server) => (
          <li key={server.name} className="studio-global">
            <label className="studio-check-row">
              <input
                type="checkbox"
                checked={server.enabled && !server.disabledInPack && !server.replacedByPack}
                disabled={!server.enabled || server.replacedByPack || busy !== null}
                onChange={(event) => void toggle(server, event.target.checked)}
              />
              <span className="studio-mono">{server.name}</span>
            </label>
            <span className="studio-hint">
              {server.replacedByPack ? t("studio.mcp.globalReplaced") : !server.enabled ? t("studio.mcp.globalOff") : server.disabledInPack ? t("studio.mcp.globalDisabledHere") : t("studio.mcp.globalActive")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FieldProblems({ problems, field }: { problems: ValidationIssue[]; field: McpFormProblem["field"] }) {
  const own = problems.filter((problem) => (problem as McpFormProblem).field === field);
  return own.length ? <ValidationList issues={own} /> : null;
}

function ServerEditor({ packId, packDir, pack, advanced, server, onSaved, onDeleted, onDirtyChange, onInspected }: {
  packId: string;
  packDir: string;
  pack: PackDetails;
  advanced: boolean;
  server?: McpServerSummary;
  onInspected?: () => void;
  onSaved: (name: string) => void;
  onDeleted: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const initial = server?.form ?? EMPTY_FORM;
  const [form, setForm] = useState<McpServerForm>(initial);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [serverProblems, setServerProblems] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<{ text: string; conflict?: boolean } | null>(null);
  const [touched, setTouched] = useState(false);
  const [inspection, setInspection] = useState<InspectionResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useUnsavedGuard(dirty);
  const problems: ValidationIssue[] = useMemo(() => (touched || server ? checkServerForm(form) : []), [form, touched, server]);
  const allProblems = [...problems, ...serverProblems.filter((problem) => !problems.some((own) => own.code === problem.code))];
  const set = (patch: Partial<McpServerForm>) => {
    setTouched(true);
    setServerProblems([]);
    setForm((current) => ({ ...current, ...patch }));
  };

  const save = useCallback(async () => {
    if (!dirty || saving) return;
    setTouched(true);
    if (checkServerForm(form).length) return;
    setSaving(true);
    setError(null);
    try {
      const body = { server: advanced ? form : { ...form, toolExposure: undefined }, note, ...(server ? { baseHash: server.entryHash } : {}) };
      const data = server
        ? await studioFetch<{ server: McpServerSummary }>(serverPath(packId, server.name), { method: "PUT", body })
        : await studioFetch<{ server: McpServerSummary }>(packPath(packId, "/mcp"), { method: "POST", body });
      onDirtyChange(false);
      onSaved(data.server.name);
    } catch (cause) {
      const failure = cause instanceof StudioRequestError ? cause : null;
      if (failure?.issues) setServerProblems(failure.issues);
      setError({ text: errorMessage(cause, t), conflict: failure?.code === "conflict" });
      setSaving(false);
    }
  }, [dirty, saving, form, advanced, note, server, packId, onDirtyChange, onSaved, t]);
  useSaveShortcut(() => void save(), dirty && !saving);

  const inspect = async () => {
    if (!server) return;
    setInspecting(true);
    setError(null);
    try {
      setInspection((await studioFetch<{ inspection: InspectionResult }>(`${serverPath(packId, server.name)}/inspect`, { method: "POST" })).inspection);
      onInspected?.();
    } catch (cause) {
      setError({ text: errorMessage(cause, t) });
    } finally {
      setInspecting(false);
    }
  };

  const toggle = async (enabled: boolean) => {
    if (!server) return;
    setBusy(true);
    try {
      await studioFetch(serverPath(packId, server.name), { method: "PATCH", body: { enabled } });
      onSaved(server.name);
    } catch (cause) {
      setError({ text: errorMessage(cause, t) });
      setBusy(false);
    }
  };

  const tools = inspection?.tools ?? [];
  const exposureNames = [...new Set([...tools.map((tool) => tool.name), ...Object.keys(form.toolExposure ?? {})])];
  const readOnlyTests = pack.meta.tests?.mcpTools === "read-only";

  return (
    <div className="studio-section">
      <header className="studio-section-header is-row">
        <div>
          <h2 className="studio-title">{server ? server.name : t("studio.mcp.newTitle")}</h2>
          <p className="studio-muted">{server?.description || t("studio.mcp.cardIntro")}</p>
        </div>
        {server && (
          <div className="studio-list-actions">
            <label className="studio-check-row">
              <input type="checkbox" checked={server.enabled} disabled={busy || dirty} onChange={(event) => void toggle(event.target.checked)} />
              <span>{t("studio.mcp.enabled")}</span>
            </label>
            <button type="button" className="studio-button is-danger" onClick={() => setDeleting(true)}>{t("studio.skills.delete")}</button>
          </div>
        )}
      </header>
      <Notice kind="info"><strong>{t("studio.mcp.lockedTitle")}</strong> {t("studio.mcp.lockedText")}</Notice>
      {error && <Notice kind="error" actions={error.conflict ? <button type="button" className="studio-button" onClick={() => onSaved(server?.name ?? "")}>{t("studio.editor.reload")}</button> : undefined}>{error.text}</Notice>}
      {server?.invalid && <Notice kind="error">{t("studio.mcp.invalid", { reason: server.invalid })}</Notice>}
      <div className="studio-card studio-form">
        <div className="studio-field">
          <label htmlFor="studio-mcp-name">{t("studio.mcp.name")}</label>
          <input id="studio-mcp-name" className="studio-input studio-mono" value={form.name} maxLength={64} aria-invalid={form.name !== "" && !isSlug(form.name)} onChange={(event) => set({ name: event.target.value })} />
          <p className="studio-hint">{t("studio.mcp.nameHint", { tool: `mcp__${(form.name || "serveur").replace(/-/g, "_")}__…` })}</p>
          <FieldProblems problems={allProblems} field="name" />
        </div>
        <div className="studio-field">
          <label htmlFor="studio-mcp-url">{t("studio.mcp.url")}</label>
          <input id="studio-mcp-url" className="studio-input studio-mono" value={form.url} placeholder="https://mcp.example.fr/mcp" onChange={(event) => set({ url: event.target.value })} />
          <FieldProblems problems={allProblems} field="url" />
        </div>
        <div className="studio-field">
          <label htmlFor="studio-mcp-description">{t("studio.config.description")}</label>
          <textarea id="studio-mcp-description" className="studio-textarea" rows={2} maxLength={500} value={form.description} onChange={(event) => set({ description: event.target.value })} />
          <p className="studio-hint">{t("studio.mcp.descriptionHint")}</p>
          <FieldProblems problems={allProblems} field="description" />
        </div>
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="studio-mcp-auth">{t("studio.mcp.auth")}</label>
            <select id="studio-mcp-auth" className="studio-input" value={form.auth} onChange={(event) => set({ auth: event.target.value as McpServerForm["auth"] })}>
              <option value="none">{t("studio.mcp.authNone")}</option>
              <option value="bearer-env">{t("studio.mcp.authBearer")}</option>
            </select>
            {server?.signedIn && form.auth === "none" && <p className="studio-hint">{t("studio.mcp.signedIn")}</p>}
          </div>
          {form.auth === "bearer-env" && (
            <div className="studio-field">
              <label htmlFor="studio-mcp-variable">{t("studio.mcp.variable")}</label>
              <input id="studio-mcp-variable" className="studio-input studio-mono" value={form.tokenVariable} placeholder="OPENALEX_TOKEN" onChange={(event) => set({ tokenVariable: event.target.value.toUpperCase() })} />
              <p className="studio-hint">
                {server?.tokenVariable === form.tokenVariable && server.tokenVariableSet !== undefined
                  ? (server.tokenVariableSet ? t("studio.mcp.variableSet") : t("studio.mcp.variableUnset"))
                  : t("studio.mcp.variableHint")}
              </p>
              <FieldProblems problems={allProblems} field="tokenVariable" />
            </div>
          )}
        </div>
        {advanced && (
          <div className="studio-field">
            <label htmlFor="studio-mcp-timeout">{t("studio.mcp.timeout")}</label>
            <input id="studio-mcp-timeout" type="number" min={1} max={3600} className="studio-input" value={form.timeout ?? ""} placeholder="60" onChange={(event) => set({ timeout: event.target.value === "" ? null : Number(event.target.value) })} />
            <FieldProblems problems={allProblems} field="timeout" />
          </div>
        )}
        {advanced && exposureNames.length > 0 && (
          <fieldset className="studio-fieldset">
            <legend>{t("studio.mcp.exposureTitle")}</legend>
            <p className="studio-hint">{t("studio.mcp.exposureIntro")}</p>
            {exposureNames.map((tool) => {
              const value = form.toolExposure?.[tool] ?? "";
              return (
                <label key={tool} className="studio-check-row">
                  <span className="studio-mono studio-grow">{tool}</span>
                  <select className="studio-input is-compact" aria-label={t("studio.mcp.exposureOf", { tool })} value={value} onChange={(event) => {
                    const next = { ...(form.toolExposure ?? {}) };
                    if (event.target.value) next[tool] = event.target.value as never;
                    else delete next[tool];
                    set({ toolExposure: next });
                  }}>
                    <option value="">{t("studio.mcp.exposureDefault")}</option>
                    <option value="hidden">{t("studio.mcp.exposure.hidden")}</option>
                    {value && value !== "hidden" && <option value={value}>{t(`studio.mcp.exposure.${value}`)}</option>}
                  </select>
                </label>
              );
            })}
          </fieldset>
        )}
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void save()}
        note={note}
        onNoteChange={setNote}
        extra={server && <button type="button" className="studio-button" aria-expanded={showHistory} onClick={() => setShowHistory((open) => !open)}>{t("studio.history.button")}</button>}
      />
      {showHistory && <FileHistory packId={packId} path={MCP_FILE} refreshKey={0} onRestored={() => onSaved(server?.name ?? "")} />}
      {server && (
        <section className="studio-card">
          <div className="studio-inspect-bar">
            <button type="button" className="studio-button is-primary" disabled={inspecting || dirty || !server.enabled} onClick={() => void inspect()}>
              {inspecting ? t("studio.mcp.inspecting") : t("studio.mcp.inspect")}
            </button>
            <span className="studio-hint">
              {dirty ? t("studio.mcp.saveFirst") : !server.enabled ? t("studio.mcp.enableFirst")
                : server.inspection ? t("studio.mcp.lastInspection", { date: formatStudioDate(server.inspection.at, locale), count: server.inspection.toolCount }) : t("studio.mcp.inspectHint")}
            </span>
          </div>
          {inspection && <InspectionView inspection={inspection} readOnlyTests={readOnlyTests} packDir={packDir} serverName={server.name} />}
        </section>
      )}
      {deleting && server && (
        <DeleteServer packId={packId} name={server.name} onClose={() => setDeleting(false)} onDeleted={() => { setDeleting(false); onDirtyChange(false); onDeleted(); }} />
      )}
    </div>
  );
}

/**
 * An OAuth server (OpenAlex's, for instance): the Studio never signs in (STUDIO.md §8),
 * pi-web does, in Settings › MCP for the pack's folder; its token then serves the
 * Studio's inspection and test sessions too.
 */
function SignInHelp({ packDir, serverName }: { packDir: string; serverName: string }) {
  const { t } = useI18n();
  return (
    <Notice
      kind="warning"
      actions={<a className="studio-button is-primary" href={`/?cwd=${encodeURIComponent(packDir)}`} onClick={() => setLastSettingsSection("mcp")}>{t("studio.mcp.signIn.open")}</a>}
    >
      <strong>{t("studio.mcp.signIn.title")}</strong>
      <ol className="studio-steps">
        <li>{t("studio.mcp.signIn.step1")}</li>
        <li>{t("studio.mcp.signIn.step2", { name: serverName })}</li>
        <li>{t("studio.mcp.signIn.step3")}</li>
      </ol>
      <span className="studio-hint">{t("studio.mcp.signIn.note")}</span>
    </Notice>
  );
}

function InspectionView({ inspection, readOnlyTests, packDir, serverName }: { inspection: InspectionResult; readOnlyTests: boolean; packDir: string; serverName: string }) {
  const { t } = useI18n();
  if (inspection.state === "needs-auth") return <SignInHelp packDir={packDir} serverName={serverName} />;
  if (inspection.state !== "connected") {
    return (
      <Notice kind="error">
        <strong>{t(`studio.mcp.result.${inspection.state}`)}</strong>
        {inspection.maybeSse && <span> {t("studio.mcp.result.maybeSse")}</span>}
        {inspection.error && (
          <details className="studio-tool-call">
            <summary>{t("studio.mcp.result.details")}</summary>
            <pre className="studio-pre">{inspection.error}</pre>
          </details>
        )}
      </Notice>
    );
  }
  return (
    <div className="studio-inspection">
      <Notice kind="info">
        <strong>{t("studio.mcp.result.connected", { count: inspection.toolCount })}</strong>
        {inspection.serverInfo && <span> {t("studio.mcp.result.server", { name: inspection.serverInfo.title || inspection.serverInfo.name, version: inspection.serverInfo.version })}</span>}
      </Notice>
      {inspection.tools.map((tool) => (
        <details key={tool.name} className="studio-tool-call">
          <summary>
            <span className="studio-mono">{tool.name}</span>
            {tool.readOnly
              ? <span className="studio-badge is-ok">{t("studio.mcp.readOnly")}</span>
              : <span className={`studio-badge ${readOnlyTests ? "is-warning" : "is-muted"}`}>{readOnlyTests ? t("studio.mcp.blockedInTests") : t("studio.mcp.notReadOnly")}</span>}
            <span className="studio-badge is-muted">{t(`studio.mcp.exposure.${tool.exposure === "codemode-deferred" ? "codemode" : tool.exposure}`)}</span>
          </summary>
          {tool.description && <p className="studio-prewrap">{tool.description}</p>}
          {tool.schema ? <pre className="studio-pre">{tool.schema}</pre> : <p className="studio-hint">{t("studio.mcp.noSchema")}</p>}
        </details>
      ))}
    </div>
  );
}

function OutsideServer({ packId, packDir, pack, server, onChanged, onDeleted }: {
  packId: string;
  packDir: string;
  pack: PackDetails;
  server: McpServerSummary;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<InspectionResult | null>(null);
  const http = server.outside !== "stdio" && server.outside !== "sse" && server.outside !== "notAnObject" && server.url !== undefined;
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="studio-section">
      <header className="studio-section-header is-row">
        <div>
          <h2 className="studio-title">{server.name}</h2>
          <p className="studio-muted">{server.description || server.url}</p>
        </div>
        <div className="studio-list-actions">
          <label className="studio-check-row">
            <input type="checkbox" checked={server.enabled} disabled={busy} onChange={(event) => void run(async () => {
              await studioFetch(serverPath(packId, server.name), { method: "PATCH", body: { enabled: event.target.checked } });
              onChanged();
            })} />
            <span>{t("studio.mcp.enabled")}</span>
          </label>
          <button type="button" className="studio-button is-danger" onClick={() => setDeleting(true)}>{t("studio.skills.delete")}</button>
        </div>
      </header>
      <Notice kind="warning">
        <strong>{t("studio.mcp.outsideTitle")}</strong> {t(`studio.mcp.outside.${server.outside}`)} {t("studio.mcp.outsideText")}
      </Notice>
      {server.invalid && <Notice kind="error">{t("studio.mcp.invalid", { reason: server.invalid })}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {http && (
        <section className="studio-card">
          <div className="studio-inspect-bar">
            <button type="button" className="studio-button is-primary" disabled={busy || !server.enabled} onClick={() => void run(async () => {
              setInspection((await studioFetch<{ inspection: InspectionResult }>(`${serverPath(packId, server.name)}/inspect`, { method: "POST" })).inspection);
            })}>{t("studio.mcp.inspect")}</button>
          </div>
          {inspection && <InspectionView inspection={inspection} readOnlyTests={pack.meta.tests?.mcpTools === "read-only"} packDir={packDir} serverName={server.name} />}
        </section>
      )}
      {deleting && <DeleteServer packId={packId} name={server.name} onClose={() => setDeleting(false)} onDeleted={() => { setDeleting(false); onDeleted(); }} />}
    </div>
  );
}

function DeleteServer({ packId, name, onClose, onDeleted }: { packId: string; name: string; onClose: () => void; onDeleted: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <ConfirmDialog
      title={t("studio.mcp.deleteTitle", { name })}
      message={t("studio.mcp.deleteMessage")}
      confirmLabel={t("studio.skills.delete")}
      danger
      busy={busy}
      onConfirm={() => {
        setBusy(true);
        studioFetch(serverPath(packId, name), { method: "DELETE" }).then(onDeleted, () => setBusy(false));
      }}
      onCancel={onClose}
    />
  );
}
