"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";

// The answer-evaluation grid the suites' « attendus » refer to (STUDIO-NOTES
// §20): above Suites and Campagnes, folded or open as the tester left it.

const CRITERIA = ["verifiable", "replayable", "sourced", "reliable", "transparent", "nuanced", "robust"] as const;
/** What a criterion not met does to the verdict. */
const EFFECT: Record<(typeof CRITERIA)[number], "ko" | "partiel" | "comment"> = {
  verifiable: "ko",
  replayable: "partiel",
  sourced: "comment",
  reliable: "ko",
  transparent: "comment",
  nuanced: "comment",
  robust: "ko",
};
const OPEN_KEY = "pi-studio-evaluation-grid-open";

export function EvaluationGrid() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(OPEN_KEY) === "1");
    } catch {
      // closed by default
    }
  }, []);
  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      // remembered for this page only
    }
  };
  return (
    <details className="studio-card studio-evaluation-grid" open={open} onToggle={(event) => toggle(event.currentTarget.open)}>
      <summary className="studio-subtitle">{t("studio.grid.title")}</summary>
      <p className="studio-hint">{t("studio.grid.intro")}</p>
      <div className="studio-table-wrap">
        <table className="studio-table">
          <thead>
            <tr>
              <th scope="col">{t("studio.grid.colCriterion")}</th>
              <th scope="col">{t("studio.grid.colCheck")}</th>
              <th scope="col">{t("studio.grid.colWhere")}</th>
              <th scope="col">{t("studio.grid.colIfNot")}</th>
            </tr>
          </thead>
          <tbody>
            {CRITERIA.map((criterion) => (
              <tr key={criterion}>
                <th scope="row">{t(`studio.grid.${criterion}.name`)}</th>
                <td>{t(`studio.grid.${criterion}.check`)}</td>
                <td>{t(`studio.grid.${criterion}.where`)}</td>
                <td>
                  {EFFECT[criterion] === "comment"
                    ? <span className="studio-hint">{t("studio.grid.effect.comment")}</span>
                    : <span className={`studio-badge is-verdict-${EFFECT[criterion]}`}>{t(`studio.grid.effect.${EFFECT[criterion]}`)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="studio-grid-rules">
        <li><span className="studio-badge is-verdict-ok">{t("studio.runs.verdict.ok")}</span> {t("studio.grid.rule.ok")}</li>
        <li><span className="studio-badge is-verdict-partiel">{t("studio.runs.verdict.partiel")}</span> {t("studio.grid.rule.partiel")}</li>
        <li><span className="studio-badge is-verdict-ko">{t("studio.runs.verdict.ko")}</span> {t("studio.grid.rule.ko")}</li>
      </ul>
    </details>
  );
}
