"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { errorMessage, packPath, studioFetch } from "@/lib/studio/client";
import type { PackDetails, SkillSummary } from "@/lib/studio/types";
import { Notice } from "../StudioUi";
import { CompareTab } from "./CompareTab";
import { RunsTab } from "./RunsTab";
import { type SuiteSummary, SuitesTab } from "./SuitesTab";

const TABS = ["suites", "runs", "compare"] as const;
export type TestsTab = (typeof TABS)[number];

/** `item` in the address: `suites:<name>`, `runs:<runId>` or `compare`. */
export function parseTestsItem(item: string | null): { tab: TestsTab; id: string | null } {
  const [tab, ...rest] = (item ?? "").split(":");
  return (TABS as readonly string[]).includes(tab) ? { tab: tab as TestsTab, id: rest.join(":") || null } : { tab: "suites", id: null };
}

export function TestsSection({ packId, pack, skills, advanced, item, onNavigate, onChanged, onDirtyChange }: {
  packId: string;
  pack: PackDetails;
  skills: SkillSummary[];
  advanced: boolean;
  item: string | null;
  onNavigate: (item: string) => void;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const { tab, id } = parseTestsItem(item);
  const [suites, setSuites] = useState<SuiteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSuites = useCallback(async () => {
    try {
      setSuites((await studioFetch<{ suites: SuiteSummary[] }>(packPath(packId, "/tests"))).suites);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, t));
    }
  }, [packId, t]);
  useEffect(() => { void loadSuites(); }, [loadSuites]);

  const changed = useCallback(() => { void loadSuites(); onChanged(); }, [loadSuites, onChanged]);
  const go = (next: TestsTab, nextId?: string | null) => onNavigate(nextId ? `${next}:${nextId}` : next);

  return (
    <div className="studio-section">
      <header className="studio-section-header">
        <h2 className="studio-title">{t("studio.nav.tests")}</h2>
        <p className="studio-muted">{t("studio.tests.intro")}</p>
      </header>
      <div className="studio-tabs" role="tablist" aria-label={t("studio.nav.tests")}>
        {TABS.map((entry) => (
          <button key={entry} type="button" role="tab" aria-selected={entry === tab} className="studio-tab" onClick={() => go(entry)}>
            {t(`studio.tests.tab.${entry}`)}
          </button>
        ))}
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {suites === null && !error && <p className="studio-muted">{t("studio.common.loading")}</p>}
      {suites && tab === "suites" && (
        <SuitesTab
          packId={packId}
          suites={suites}
          skills={skills}
          selected={id ?? suites[0]?.name ?? null}
          onSelect={(name) => go("suites", name)}
          onChanged={changed}
          onDirtyChange={onDirtyChange}
          advanced={advanced}
        />
      )}
      {suites && tab === "runs" && (
        <RunsTab
          packId={packId}
          suites={suites}
          defaultModel={pack.defaultModel}
          externalChangeCount={pack.externalChanges.length}
          selected={id}
          onSelect={(runId) => go("runs", runId)}
          onChanged={onChanged}
          onDirtyChange={onDirtyChange}
        />
      )}
      {tab === "compare" && <CompareTab packId={packId} onOpenRun={(runId) => go("runs", runId)} />}
    </div>
  );
}
