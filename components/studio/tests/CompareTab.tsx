"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { errorMessage, packPath, studioFetch } from "@/lib/studio/client";
import type { Comparison } from "@/lib/studio/tests/compare";
import { formatStudioDate, Notice } from "../StudioUi";

export function CompareTab({ packId, onOpenRun }: { packId: string; onOpenRun: (runId: string) => void }) {
  const { t, locale } = useI18n();
  const [suite, setSuite] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const query = suite ? `?suite=${encodeURIComponent(suite)}` : "";
      setComparison((await studioFetch<{ comparison: Comparison }>(packPath(packId, `/compare${query}`))).comparison);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, t));
    }
  }, [packId, suite, t]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!comparison) return <p className="studio-muted">{t("studio.common.loading")}</p>;

  return (
    <div className="studio-section">
      <header className="studio-section-header is-row">
        <p className="studio-muted">{t("studio.compare.intro")}</p>
        <div className="studio-field">
          <label htmlFor="studio-compare-suite">{t("studio.compare.suite")}</label>
          <select id="studio-compare-suite" className="studio-input" value={suite} onChange={(event) => setSuite(event.target.value)}>
            <option value="">{t("studio.compare.allSuites")}</option>
            {comparison.suites.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      </header>
      {comparison.columns.length === 0 ? (
        <div className="studio-empty"><p>{t("studio.compare.empty")}</p></div>
      ) : (
        <div className="studio-table-wrap">
          <table className="studio-table is-compare">
            <thead>
              <tr>
                <th scope="col">{t("studio.tests.colId")}</th>
                <th scope="col">{t("studio.tests.colQuery")}</th>
                {comparison.columns.map((column) => (
                  <th key={column.runId} scope="col">
                    <button type="button" className="studio-link-button" onClick={() => onOpenRun(column.runId)}>{column.model}</button>
                    <span className="studio-hint">{formatStudioDate(column.startedAt, locale)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="studio-mono">{suite ? row.id : `${row.suite} · ${row.id}`}</th>
                  <td className="studio-compare-query">{row.requete}</td>
                  {comparison.columns.map((column) => {
                    const cell = comparison.cells[row.key]?.[column.runId];
                    if (!cell) return <td key={column.runId} className="studio-muted">—</td>;
                    return (
                      <td key={column.runId} title={cell.comment || undefined}>
                        {cell.verdict
                          ? <span className={`studio-badge is-verdict-${cell.verdict}`}>{t(`studio.runs.verdict.${cell.verdict}`)}</span>
                          : <span className={`studio-badge is-case-${cell.status}`}>{cell.status === "termine" ? t("studio.compare.notReviewed") : t(`studio.runs.status.${cell.status}`)}</span>}
                        {cell.comment && <span className="studio-compare-comment">{cell.comment}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
