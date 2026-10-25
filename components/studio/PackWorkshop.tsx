"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { setLastSettingsSection } from "@/lib/settings-navigation";
import { errorMessage, packPath, studioFetch } from "@/lib/studio/client";
import type { ExternalChange, JourneyStepState, PackDetails, SkillSummary } from "@/lib/studio/types";
import { ConfigurationSection } from "./ConfigurationSection";
import { FileEditor } from "./FileEditor";
import { PackHistory } from "./HistoryPanel";
import { SkillsSection } from "./SkillsSection";
import { StudioHeader } from "./StudioHeader";
import { ConfirmDialog, Dialog, IssueBadge, Notice, useAdvancedMode, ValidationList } from "./StudioUi";
import { McpSection } from "./mcp/McpSection";
import { TestsSection } from "./tests/TestsSection";

const SECTIONS = ["instructions", "skills", "mcp", "tests", "configuration", "history", "providers"] as const;
type Section = (typeof SECTIONS)[number];

function isSection(value: string | null): value is Section {
  return value !== null && (SECTIONS as readonly string[]).includes(value);
}

/** A pack file as the user names it, never as a path. */
export function useDescribePath(): (path: string) => string {
  const { t } = useI18n();
  return useCallback((path: string) => {
    if (path === "AGENTS.md") return t("studio.files.agents");
    if (path === ".pi/APPEND_SYSTEM.md") return t("studio.files.appendSystem");
    if (path === ".pi/SYSTEM.md") return t("studio.files.system");
    if (path === ".pi/settings.json") return t("studio.files.settings");
    if (path === ".pi/mcp.json") return t("studio.files.mcp");
    if (path === ".studio/pack.json") return t("studio.files.packMeta");
    if (path === ".gitignore") return t("studio.files.ignore");
    const skill = /^\.pi\/skills\/([^/]+)(?:\/(.+))?$/.exec(path);
    if (skill) return skill[2] && skill[2] !== "SKILL.md" ? t("studio.files.skillFile", { name: skill[1], file: skill[2] }) : t("studio.files.skill", { name: skill[1] });
    const suite = /^tests\/([^/]+)\.md$/.exec(path);
    if (suite) return t("studio.files.suite", { name: suite[1] });
    const run = /^\.studio\/runs\/([^/]+)(?:\/|$)/.exec(path);
    if (run) return t("studio.files.run", { name: run[1] });
    return path;
  }, [t]);
}

export function PackWorkshop({ packId }: { packId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [advanced, setAdvanced] = useAdvancedMode();
  const [pack, setPack] = useState<PackDetails | null>(null);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [validating, setValidating] = useState(false);
  const dirtyRef = useRef(false);
  const describePath = useDescribePath();

  const sectionParam = searchParams.get("section");
  const section: Section = isSection(sectionParam) ? sectionParam : "instructions";
  const item = searchParams.get("item");

  const reload = useCallback(async () => {
    try {
      const data = await studioFetch<{ pack: PackDetails; skills: SkillSummary[] }>(packPath(packId));
      setPack(data.pack);
      setSkills(data.skills);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, t));
    }
  }, [packId, t]);

  useEffect(() => { void reload(); }, [reload, refreshKey]);
  useEffect(() => {
    const onFocus = () => { if (!dirtyRef.current) void reload(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const onDirtyChange = useCallback((dirty: boolean) => { dirtyRef.current = dirty; }, []);
  const changed = useCallback(() => setRefreshKey((key) => key + 1), []);

  const navigate = (next: Section, nextItem?: string | null) => {
    if (dirtyRef.current && !window.confirm(t("studio.editor.discardConfirm"))) return;
    dirtyRef.current = false;
    const params = new URLSearchParams();
    params.set("section", next);
    if (nextItem) params.set("item", nextItem);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (!pack) {
    return (
      <div className="studio-page">
        <StudioHeader />
        <main className="studio-main">
          {error ? (
            <Notice kind="error" actions={<Link className="studio-button" href="/studio">{t("studio.home.back")}</Link>}>{error}</Notice>
          ) : <p className="studio-muted">{t("studio.common.loading")}</p>}
        </main>
      </div>
    );
  }

  const navItems: { id: Section; label: string; count?: number; later?: string }[] = [
    { id: "instructions", label: t("studio.nav.instructions") },
    { id: "skills", label: t("studio.nav.skills"), count: skills.length },
    { id: "mcp", label: t("studio.nav.mcp") },
    { id: "tests", label: t("studio.nav.tests") },
    { id: "configuration", label: t("studio.nav.configuration") },
    { id: "history", label: t("studio.nav.history") },
    { id: "providers", label: t("studio.nav.providers") },
  ];

  return (
    <div className="studio-page">
      <StudioHeader
        pack={pack}
        advanced={advanced}
        onAdvancedChange={setAdvanced}
        onValidate={() => setValidating(true)}
      />
      <div className="studio-workshop">
        <nav className="studio-nav" aria-label={t("studio.nav.label")}>
          <p className="studio-nav-heading">{t("studio.nav.heading")}</p>
          <ul>
            {navItems.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`studio-nav-item${section === entry.id ? " is-active" : ""}`}
                  aria-current={section === entry.id ? "page" : undefined}
                  onClick={() => navigate(entry.id)}
                >
                  <span>{entry.label}</span>
                  {entry.count !== undefined && <span className="studio-count">{entry.count}</span>}
                  {entry.later && <span className="studio-soon">{t("studio.later.soon")}</span>}
                </button>
              </li>
            ))}
          </ul>
          <Journey pack={pack} />
        </nav>
        <main className="studio-main">
          <ExternalChangesBanner packId={packId} changes={pack.externalChanges} describePath={describePath} onDone={changed} />
          {!pack.piLoadsProject && <Notice kind="warning">{t("studio.trust.notLoaded")}</Notice>}
          {section === "instructions" && (
            <InstructionsSection packId={packId} pack={pack} advanced={advanced} item={item} onSelect={(next) => navigate("instructions", next)} onSaved={changed} onDirtyChange={onDirtyChange} />
          )}
          {section === "skills" && (
            <SkillsSection
              packId={packId}
              skills={skills}
              selected={item ?? skills[0]?.name ?? null}
              onSelect={(name) => navigate("skills", name)}
              onChanged={changed}
              onDirtyChange={onDirtyChange}
              advanced={advanced}
            />
          )}
          {section === "configuration" && <ConfigurationSection pack={pack} advanced={advanced} onSaved={changed} onDirtyChange={onDirtyChange} />}
          {section === "history" && <PackHistory packId={packId} refreshKey={refreshKey} onRestored={changed} describePath={describePath} />}
          {section === "providers" && <ProvidersSection />}
          {section === "tests" && (
            <TestsSection packId={packId} pack={pack} skills={skills} advanced={advanced} item={item} onNavigate={(next) => navigate("tests", next)} onChanged={changed} onDirtyChange={onDirtyChange} />
          )}
          {section === "mcp" && (
            <McpSection packId={packId} pack={pack} advanced={advanced} item={item} onSelect={(next) => navigate("mcp", next)} onChanged={changed} onDirtyChange={onDirtyChange} />
          )}
        </main>
      </div>
      {validating && <ValidationDialog packId={packId} pack={pack} skills={skills} onClose={() => setValidating(false)} />}
    </div>
  );
}

function stepLabel(state: JourneyStepState, t: (key: string) => string): string {
  return t(`studio.journey.state.${state}`);
}

function Journey({ pack }: { pack: PackDetails }) {
  const { t } = useI18n();
  const steps: { id: keyof PackDetails["journey"]; title: string; hint: string }[] = [
    { id: "design", title: t("studio.journey.design"), hint: t("studio.journey.designHint") },
    { id: "connect", title: t("studio.journey.connect"), hint: t("studio.journey.connectHint") },
    { id: "evaluate", title: t("studio.journey.evaluate"), hint: t("studio.journey.evaluateHint") },
  ];
  return (
    <div className="studio-journey">
      <p className="studio-nav-heading">{t("studio.journey.title")}</p>
      <ol>
        {steps.map((step, index) => {
          const state = pack.journey[step.id];
          return (
            <li key={step.id} className={`studio-journey-step is-${state}`}>
              <span className="studio-journey-number" aria-hidden="true">{index + 1}</span>
              <span>
                <strong>{step.title}</strong>
                <span className="studio-journey-hint">{step.hint}</span>
                <span className="studio-journey-state">{stepLabel(state, t)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function InstructionsSection({ packId, pack, advanced, item, onSelect, onSaved, onDirtyChange }: {
  packId: string;
  pack: PackDetails;
  advanced: boolean;
  item: string | null;
  onSelect: (item: string) => void;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const files = [
    { id: "agents", path: "AGENTS.md", label: t("studio.files.agents"), description: t("studio.instructions.agentsIntro") },
    { id: "append", path: ".pi/APPEND_SYSTEM.md", label: t("studio.files.appendSystem"), description: t("studio.instructions.appendIntro") },
    ...(advanced || pack.promptFiles.system
      ? [{ id: "system", path: ".pi/SYSTEM.md", label: t("studio.files.system"), description: t("studio.instructions.systemIntro") }]
      : []),
  ];
  const current = files.find((file) => file.id === item) ?? files[0];
  return (
    <div className="studio-section">
      <header className="studio-section-header">
        <h2 className="studio-title">{t("studio.nav.instructions")}</h2>
        <p className="studio-muted">{t("studio.instructions.intro")}</p>
      </header>
      <div className="studio-tabs" role="tablist" aria-label={t("studio.nav.instructions")}>
        {files.map((file) => (
          <button key={file.id} type="button" role="tab" aria-selected={file.id === current.id} className="studio-tab" onClick={() => onSelect(file.id)}>
            {file.label}
          </button>
        ))}
      </div>
      {pack.promptFiles.system && current.id !== "system" && <Notice kind="warning">{t("studio.instructions.systemActive")}</Notice>}
      <FileEditor key={current.path} packId={packId} path={current.path} label={current.label} description={current.description} onSaved={onSaved} onDirtyChange={onDirtyChange} />
    </div>
  );
}

function ProvidersSection() {
  const { t } = useI18n();
  return (
    <div className="studio-section">
      <header className="studio-section-header">
        <h2 className="studio-title">{t("studio.nav.providers")}</h2>
        <p className="studio-muted">{t("studio.providers.intro")}</p>
      </header>
      <div className="studio-card">
        <p>{t("studio.providers.howTo")}</p>
        <Link className="studio-button is-primary" href="/?pi-web" onClick={() => setLastSettingsSection("models")}>{t("studio.providers.open")}</Link>
      </div>
    </div>
  );
}

function ExternalChangesBanner({ packId, changes, describePath, onDone }: {
  packId: string;
  changes: ExternalChange[];
  describePath: (path: string) => string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!changes.length) return null;

  const run = async (action: "keep-external" | "discard-external") => {
    setBusy(true);
    setError(null);
    try {
      await studioFetch(packPath(packId, "/history"), { method: "POST", body: { action } });
      setConfirmDiscard(false);
      onDone();
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setBusy(false);
    }
  };

  const kindLabel = (kind: ExternalChange["kind"]) => t(`studio.external.${kind}`);
  return (
    <>
      <Notice
        kind="warning"
        actions={(
          <>
            <button type="button" className="studio-button is-primary" disabled={busy} onClick={() => void run("keep-external")}>{t("studio.external.keep")}</button>
            <button type="button" className="studio-button" disabled={busy} onClick={() => setConfirmDiscard(true)}>{t("studio.external.discard")}</button>
          </>
        )}
      >
        <strong>{t("studio.external.title")}</strong>
        <span> {t("studio.external.text", { count: changes.length })}</span>
        <ul className="studio-plain-list">
          {changes.map((change) => <li key={change.path}>{describePath(change.path)} — {kindLabel(change.kind)}</li>)}
        </ul>
        {error && <span className="studio-error-text">{error}</span>}
      </Notice>
      {confirmDiscard && (
        <ConfirmDialog
          title={t("studio.external.discardTitle")}
          message={t("studio.external.discardMessage")}
          confirmLabel={t("studio.external.discard")}
          danger
          busy={busy}
          onConfirm={() => void run("discard-external")}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </>
  );
}

interface PiCheck {
  projectResourcesLoaded: boolean;
  skills: string[];
  diagnostics: { type: string; message: string; path?: string }[];
}

function ValidationDialog({ packId, pack, skills, onClose }: { packId: string; pack: PackDetails; skills: SkillSummary[]; onClose: () => void }) {
  const { t } = useI18n();
  const [piCheck, setPiCheck] = useState<PiCheck | null>(null);
  const [piError, setPiError] = useState<string | null>(null);
  useEffect(() => {
    studioFetch<PiCheck>(packPath(packId, "/pi-check")).then(setPiCheck).catch((cause) => setPiError(errorMessage(cause, t)));
  }, [packId, t]);

  const checks = [
    { ok: pack.instructions.agents, label: t("studio.check.agents") },
    { ok: pack.instructions.prompt, label: t("studio.check.prompt") },
    { ok: skills.length > 0, label: t("studio.check.skills") },
  ];
  const missingInPi = piCheck?.projectResourcesLoaded ? skills.filter((skill) => !piCheck.skills.includes(skill.name)).map((skill) => skill.name) : [];
  return (
    <Dialog title={t("studio.check.title")} onClose={onClose} footer={<button type="button" className="studio-button" onClick={onClose}>{t("studio.common.close")}</button>}>
      <ul className="studio-checks">
        {checks.map((check) => (
          <li key={check.label} className={check.ok ? "is-ok" : "is-error"}>
            <span className={`studio-badge ${check.ok ? "is-ok" : "is-error"}`}>{check.ok ? t("studio.check.ok") : t("studio.check.missing")}</span>
            {check.label}
          </li>
        ))}
      </ul>
      {skills.map((skill) => (
        <section key={skill.name} className="studio-check-skill">
          <h3 className="studio-subtitle">{t("studio.files.skill", { name: skill.name })} <IssueBadge issues={skill.issues} /></h3>
          <ValidationList issues={skill.issues} />
        </section>
      ))}
      <section className="studio-check-skill">
        <h3 className="studio-subtitle">{t("studio.check.piTitle")}</h3>
        {piError && <Notice kind="error">{piError}</Notice>}
        {!piCheck && !piError && <p className="studio-muted">{t("studio.common.loading")}</p>}
        {piCheck && !piCheck.projectResourcesLoaded && <Notice kind="warning">{t("studio.trust.notLoaded")}</Notice>}
        {piCheck?.projectResourcesLoaded && (
          <>
            <p>{piCheck.skills.length ? t("studio.check.piSkills", { list: piCheck.skills.join(", ") }) : t("studio.check.piNoSkills")}</p>
            {missingInPi.length > 0 && <Notice kind="warning">{t("studio.check.piMissing", { list: missingInPi.join(", ") })}</Notice>}
            {piCheck.diagnostics.length > 0 && (
              <ul className="studio-plain-list studio-mono">
                {piCheck.diagnostics.map((item, index) => <li key={index}>{item.path ? `${item.path} : ` : ""}{item.message}</li>)}
              </ul>
            )}
          </>
        )}
      </section>
    </Dialog>
  );
}
