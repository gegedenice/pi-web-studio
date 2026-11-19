"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { errorMessage, packPath, studioFetch } from "@/lib/studio/client";
import { PACK_STATUSES, type PackDetails, type PackStatus, TEST_TOOL_NAMES, WIDE_TEST_TOOLS } from "@/lib/studio/types";
import { FileEditor } from "./FileEditor";
import { SaveBar } from "./MarkdownEditor";
import { Notice, useSaveShortcut, useUnsavedGuard } from "./StudioUi";

interface ModelOption { id: string; name: string; provider: string }

export function ConfigurationSection({ pack, advanced, onSaved, onDirtyChange }: {
  pack: PackDetails;
  advanced: boolean;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const initialModel = pack.defaultModel ? `${pack.defaultModel.provider}/${pack.defaultModel.modelId}` : "";
  const initialTools = (pack.meta.tests?.tools?.length ? pack.meta.tests.tools : ["read"]).join(",");
  const [title, setTitle] = useState(pack.meta.title);
  const [description, setDescription] = useState(pack.meta.description);
  const [status, setStatus] = useState<PackStatus>(pack.meta.status);
  const [model, setModel] = useState(initialModel);
  const [tools, setTools] = useState(initialTools);
  const initialMcpTools = pack.meta.tests?.mcpTools === "read-only" ? "read-only" : "all";
  const [mcpTools, setMcpTools] = useState(initialMcpTools);
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [modelsError, setModelsError] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(false);

  useEffect(() => {
    setTitle(pack.meta.title);
    setDescription(pack.meta.description);
    setStatus(pack.meta.status);
    setModel(initialModel);
    setTools(initialTools);
    setMcpTools(initialMcpTools);
  }, [pack.meta.title, pack.meta.description, pack.meta.status, initialModel, initialTools, initialMcpTools]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/studio${packPath(pack.meta.id, "/models")}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { modelList?: ModelOption[] }) => { if (!cancelled) setModels(data.modelList ?? []); })
      .catch(() => { if (!cancelled) { setModels([]); setModelsError(true); } });
    return () => { cancelled = true; };
  }, [pack.meta.id]);

  const dirty = title !== pack.meta.title || description !== pack.meta.description || status !== pack.meta.status || model !== initialModel || tools !== initialTools || mcpTools !== initialMcpTools;
  useEffect(() => onDirtyChange(dirty || settingsDirty), [dirty, settingsDirty, onDirtyChange]);
  useUnsavedGuard(dirty);

  const save = useCallback(async () => {
    if (!dirty || saving || !tools) return;
    setSaving(true);
    setError(null);
    const slash = model.indexOf("/");
    try {
      await studioFetch(packPath(pack.meta.id), {
        method: "PATCH",
        body: {
          title,
          description,
          status,
          note,
          ...(model !== initialModel ? { defaultModel: model ? { provider: model.slice(0, slash), modelId: model.slice(slash + 1) } : null } : {}),
          ...(tools !== initialTools ? { testTools: tools === "read" ? null : tools.split(",") } : {}),
          ...(mcpTools !== initialMcpTools ? { testMcpTools: mcpTools } : {}),
        },
      });
      setNote("");
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, model, initialModel, tools, initialTools, mcpTools, initialMcpTools, pack.meta.id, title, description, status, note, onSaved, t]);

  useSaveShortcut(() => void save(), dirty && !saving);

  const toolList = tools ? tools.split(",") : [];
  const toggleTool = (tool: string) => {
    const next = toolList.includes(tool) ? toolList.filter((item) => item !== tool) : [...toolList, tool];
    setTools(TEST_TOOL_NAMES.filter((name) => next.includes(name)).join(","));
  };
  const wide = toolList.filter((tool) => (WIDE_TEST_TOOLS as readonly string[]).includes(tool));
  const known = models?.some((option) => `${option.provider}/${option.id}` === model);
  return (
    <div className="studio-section">
      <header className="studio-section-header">
        <h2 className="studio-title">{t("studio.nav.configuration")}</h2>
        <p className="studio-muted">{t("studio.config.intro")}</p>
      </header>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="studio-card studio-form">
        <div className="studio-field">
          <label htmlFor="studio-config-title">{t("studio.config.title")}</label>
          <input id="studio-config-title" className="studio-input" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="studio-field">
          <label htmlFor="studio-config-description">{t("studio.config.description")}</label>
          <textarea id="studio-config-description" className="studio-textarea" rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <div className="studio-field-row">
          <div className="studio-field">
            <label htmlFor="studio-config-status">{t("studio.config.status")}</label>
            <select id="studio-config-status" className="studio-input" value={status} onChange={(event) => setStatus(event.target.value as PackStatus)}>
              {PACK_STATUSES.map((value) => <option key={value} value={value}>{t(`studio.status.${value}`)}</option>)}
            </select>
          </div>
          <div className="studio-field">
            <span className="studio-field-label">{t("studio.config.version")}</span>
            <span className="studio-readonly">{pack.meta.version}</span>
          </div>
        </div>
        <div className="studio-field">
          <label htmlFor="studio-config-model">{t("studio.config.model")}</label>
          <select id="studio-config-model" className="studio-input" value={model} disabled={models === null} onChange={(event) => setModel(event.target.value)}>
            <option value="">{t("studio.config.modelNone")}</option>
            {model && models !== null && !known && <option value={model}>{t("studio.config.modelUnavailable", { model })}</option>}
            {models?.map((option) => (
              <option key={`${option.provider}/${option.id}`} value={`${option.provider}/${option.id}`}>
                {option.name || option.id} — {option.provider}
              </option>
            ))}
          </select>
          <p className="studio-hint">{modelsError ? t("studio.config.modelsError") : models?.length === 0 ? t("studio.config.modelsEmpty") : t("studio.config.modelHint")}</p>
        </div>
      </div>
      {advanced && (
        <fieldset className="studio-card studio-fieldset">
          <legend className="studio-subtitle">{t("studio.config.testToolsTitle")}</legend>
          <p className="studio-hint">{t("studio.config.testToolsIntro")}</p>
          <div className="studio-check-grid">
            {TEST_TOOL_NAMES.map((tool) => (
              <label key={tool} className="studio-check-row">
                <input type="checkbox" checked={toolList.includes(tool)} onChange={() => toggleTool(tool)} />
                <span className="studio-mono">{tool}</span>
              </label>
            ))}
          </div>
          {toolList.length === 0 && <Notice kind="error">{t("studio.config.testToolsNone")}</Notice>}
          {wide.length > 0 && <Notice kind="warning">{t("studio.config.testToolsWide", { list: wide.join(", ") })}</Notice>}
          <div className="studio-field">
            <label htmlFor="studio-config-mcp-tools">{t("studio.config.testMcpTools")}</label>
            <select id="studio-config-mcp-tools" className="studio-input" value={mcpTools} onChange={(event) => setMcpTools(event.target.value as "all" | "read-only")}>
              <option value="all">{t("studio.config.testMcpToolsAll")}</option>
              <option value="read-only">{t("studio.config.testMcpToolsReadOnly")}</option>
            </select>
            <p className="studio-hint">{t("studio.config.testMcpToolsHint")}</p>
          </div>
        </fieldset>
      )}
      <SaveBar dirty={dirty && toolList.length > 0} saving={saving} onSave={() => void save()} note={note} onNoteChange={setNote} />
      {advanced && (
        <section className="studio-card">
          <h3 className="studio-subtitle">{t("studio.config.settingsTitle")}</h3>
          <FileEditor
            packId={pack.meta.id}
            path=".pi/settings.json"
            label={t("studio.config.settingsLabel")}
            description={t("studio.config.settingsIntro")}
            raw
            onSaved={onSaved}
            onDirtyChange={setSettingsDirty}
          />
        </section>
      )}
    </div>
  );
}
