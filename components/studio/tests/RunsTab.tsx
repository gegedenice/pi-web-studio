"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MarkdownBody } from "@/components/MarkdownBody";
import { useI18n } from "@/hooks/useI18n";
import { errorMessage, packPath, studioFetch } from "@/lib/studio/client";
import { caseKey, type RunCase, type RunFile, type RunSummary, type Verdict, VERDICTS } from "@/lib/studio/tests/run-types";
import { Dialog, formatStudioDate, Notice, useUnsavedGuard } from "../StudioUi";
import type { SuiteSummary } from "./SuitesTab";

interface ModelOption { id: string; name: string; provider: string }
interface RunState { run: RunFile; active: boolean; unfinished: string[] }

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
const POLL_MS = 2000;

const runPath = (packId: string, runId: string) => packPath(packId, `/runs/${encodeURIComponent(runId)}`);

function formatDuration(ms: number): string {
  if (!ms) return "";
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

export function RunsTab({ packId, suites, defaultModel, externalChangeCount, selected, onSelect, onChanged, onDirtyChange }: {
  packId: string;
  suites: SuiteSummary[];
  defaultModel: { provider: string; modelId: string } | null;
  externalChangeCount: number;
  selected: string | null;
  onSelect: (runId: string | null) => void;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRuns((await studioFetch<{ runs: RunSummary[] }>(packPath(packId, "/runs"))).runs);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, t));
    }
  }, [packId, t]);
  useEffect(() => { void load(); }, [load]);

  const started = (run: RunFile, unsavedChanges: number) => {
    setLaunching(false);
    setNotice(unsavedChanges ? t("studio.runs.startedUnsaved", { count: unsavedChanges }) : null);
    void load();
    onChanged();
    onSelect(run.runId);
  };

  const current = selected && runs?.some((run) => run.runId === selected) ? selected : null;
  return (
    <div className="studio-split">
      <aside className="studio-list-pane" aria-label={t("studio.runs.list")}>
        <div className="studio-list-actions">
          <button type="button" className="studio-button is-primary" disabled={!suites.length} onClick={() => setLaunching(true)}>{t("studio.runs.new")}</button>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        {runs === null && !error && <p className="studio-muted">{t("studio.common.loading")}</p>}
        {runs?.length === 0 && (
          <div className="studio-empty"><p>{suites.length ? t("studio.runs.empty") : t("studio.runs.noSuites")}</p></div>
        )}
        {runs && runs.length > 0 && (
          <ul className="studio-item-list">
            {runs.map((run) => (
              <li key={run.runId}>
                <button type="button" className={`studio-item${current === run.runId ? " is-selected" : ""}`} aria-current={current === run.runId ? "true" : undefined} onClick={() => onSelect(run.runId)}>
                  <span className="studio-item-title">{run.model.id}</span>
                  <span className={`studio-badge is-run-${run.status}`}>{t(`studio.runs.runStatus.${run.status}`)}</span>
                  <span className="studio-item-sub">
                    {formatStudioDate(run.startedAt, locale)} · {t("studio.runs.reviewedCount", { reviewed: run.reviewed, total: run.total })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className="studio-detail-pane">
        {notice && <Notice kind="warning">{notice}</Notice>}
        {current ? (
          <RunView
            key={current}
            packId={packId}
            runId={current}
            onChanged={() => { void load(); onChanged(); }}
            onStarted={started}
            onDeleted={() => { onDirtyChange(false); void load(); onChanged(); onSelect(null); }}
            onDirtyChange={onDirtyChange}
          />
        ) : (
          <p className="studio-muted studio-placeholder">{runs?.length ? t("studio.runs.pick") : t("studio.runs.emptyHint")}</p>
        )}
      </div>
      {launching && (
        <LaunchDialog packId={packId} suites={suites} defaultModel={defaultModel} externalChangeCount={externalChangeCount} onClose={() => setLaunching(false)} onStarted={started} />
      )}
    </div>
  );
}

function LaunchDialog({ packId, suites, defaultModel, externalChangeCount, onClose, onStarted }: {
  packId: string;
  suites: SuiteSummary[];
  defaultModel: { provider: string; modelId: string } | null;
  externalChangeCount: number;
  onClose: () => void;
  onStarted: (run: RunFile, unsavedChanges: number) => void;
}) {
  const { t } = useI18n();
  const runnable = suites.filter((suite) => !suite.issues.some((issue) => issue.severity === "error") && suite.caseCount > 0);
  const [chosen, setChosen] = useState<string[]>(runnable.map((suite) => suite.name));
  const [pickCases, setPickCases] = useState(false);
  const [caseIds, setCaseIds] = useState<Record<string, string[]>>({});
  const [chosenCases, setChosenCases] = useState<Set<string>>(new Set());
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [model, setModel] = useState(defaultModel ? `${defaultModel.provider}/${defaultModel.modelId}` : "");
  const [thinking, setThinking] = useState("");
  const [minutes, setMinutes] = useState(5);
  const [concurrency, setConcurrency] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    studioFetch<{ modelList?: ModelOption[] }>(packPath(packId, "/models"))
      .then((data) => {
        if (cancelled) return;
        const list = data.modelList ?? [];
        setModels(list);
        setModel((current) => current || (list[0] ? `${list[0].provider}/${list[0].id}` : ""));
      })
      .catch(() => { if (!cancelled) setModels([]); });
    return () => { cancelled = true; };
  }, [packId]);

  useEffect(() => {
    if (!pickCases) return;
    let cancelled = false;
    for (const name of chosen) {
      if (caseIds[name]) continue;
      studioFetch<{ suite: { cases: { id: string }[] } }>(packPath(packId, `/tests/${encodeURIComponent(name)}`))
        .then((data) => {
          if (cancelled) return;
          const ids = data.suite.cases.map((item) => item.id);
          setCaseIds((current) => ({ ...current, [name]: ids }));
          setChosenCases((current) => new Set([...current, ...ids.map((id) => `${name}/${id}`)]));
        })
        .catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [pickCases, chosen, caseIds, packId]);

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const selectedCases = pickCases ? [...chosenCases].filter((key) => chosen.includes(key.split("/")[0])) : null;
  const caseTotal = selectedCases ? selectedCases.length : runnable.filter((suite) => chosen.includes(suite.name)).reduce((sum, suite) => sum + suite.caseCount, 0);

  const submit = async () => {
    const slash = model.indexOf("/");
    setBusy(true);
    setError(null);
    try {
      const data = await studioFetch<{ run: RunFile; unsavedChanges: number }>(packPath(packId, "/runs"), {
        method: "POST",
        body: {
          model: { provider: model.slice(0, slash), modelId: model.slice(slash + 1) },
          suites: chosen,
          ...(selectedCases ? { cases: selectedCases } : {}),
          ...(thinking ? { thinkingLevel: thinking } : {}),
          timeoutMs: minutes * 60_000,
          concurrency,
        },
      });
      onStarted(data.run, data.unsavedChanges);
    } catch (cause) {
      setError(errorMessage(cause, t));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t("studio.runs.launchTitle")}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="studio-button" onClick={onClose}>{t("studio.common.cancel")}</button>
          <button type="button" className="studio-button is-primary" disabled={busy || !model || caseTotal === 0} onClick={() => void submit()}>
            {t("studio.runs.launch", { count: caseTotal })}
          </button>
        </>
      )}
    >
      {externalChangeCount > 0 && <Notice kind="warning">{t("studio.runs.unsavedWarning", { count: externalChangeCount })}</Notice>}
      <fieldset className="studio-fieldset">
        <legend>{t("studio.runs.suites")}</legend>
        {suites.map((suite) => {
          const disabled = !runnable.includes(suite);
          return (
            <div key={suite.name}>
              <label className="studio-check-row">
                <input type="checkbox" disabled={disabled} checked={chosen.includes(suite.name)} onChange={() => setChosen((list) => toggle(list, suite.name))} />
                <span>{suite.titre} <span className="studio-muted">({disabled ? t("studio.runs.suiteNotRunnable") : t("studio.tests.caseCount", { count: suite.caseCount })})</span></span>
              </label>
              {pickCases && chosen.includes(suite.name) && (
                <div className="studio-case-picks">
                  {(caseIds[suite.name] ?? []).map((id) => {
                    const key = `${suite.name}/${id}`;
                    return (
                      <label key={key} className="studio-check-row is-compact">
                        <input type="checkbox" checked={chosenCases.has(key)} onChange={() => setChosenCases((set) => { const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key); return next; })} />
                        <span className="studio-mono">{id}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <label className="studio-check-row">
          <input type="checkbox" checked={pickCases} onChange={(event) => setPickCases(event.target.checked)} />
          <span>{t("studio.runs.pickCases")}</span>
        </label>
      </fieldset>
      <div className="studio-field">
        <label htmlFor="studio-run-model">{t("studio.config.model")}</label>
        <select id="studio-run-model" className="studio-input" value={model} disabled={models === null} onChange={(event) => setModel(event.target.value)}>
          {!model && <option value="">{t("studio.runs.chooseModel")}</option>}
          {model && models !== null && !models.some((option) => `${option.provider}/${option.id}` === model) && (
            <option value={model}>{t("studio.config.modelUnavailable", { model })}</option>
          )}
          {models?.map((option) => (
            <option key={`${option.provider}/${option.id}`} value={`${option.provider}/${option.id}`}>{option.name || option.id} — {option.provider}</option>
          ))}
        </select>
        {models?.length === 0 && <p className="studio-hint">{t("studio.config.modelsEmpty")}</p>}
      </div>
      <div className="studio-field-row">
        <div className="studio-field">
          <label htmlFor="studio-run-thinking">{t("studio.runs.thinking")}</label>
          <select id="studio-run-thinking" className="studio-input" value={thinking} onChange={(event) => setThinking(event.target.value)}>
            <option value="">{t("studio.runs.thinkingDefault")}</option>
            {THINKING_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </div>
        <div className="studio-field">
          <label htmlFor="studio-run-timeout">{t("studio.runs.timeout")}</label>
          <input id="studio-run-timeout" type="number" className="studio-input" min={1} max={60} value={minutes} onChange={(event) => setMinutes(Math.min(60, Math.max(1, Math.round(Number(event.target.value) || 1))))} />
        </div>
        <div className="studio-field">
          <label htmlFor="studio-run-concurrency">{t("studio.runs.concurrency")}</label>
          <input id="studio-run-concurrency" type="number" className="studio-input" min={1} max={4} value={concurrency} onChange={(event) => setConcurrency(Math.min(4, Math.max(1, Math.round(Number(event.target.value) || 1))))} />
        </div>
      </div>
      <p className="studio-hint">{t("studio.runs.launchHint")}</p>
      {error && <Notice kind="error">{error}</Notice>}
    </Dialog>
  );
}

interface Review { verdict: Verdict; comment: string }

function RunView({ packId, runId, onChanged, onStarted, onDeleted, onDirtyChange }: {
  packId: string;
  runId: string;
  onChanged: () => void;
  onStarted: (run: RunFile, unsavedChanges: number) => void;
  onDeleted: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<RunState | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [openCase, setOpenCase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await studioFetch<RunState>(runPath(packId, runId)));
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, t));
    }
  }, [packId, runId, t]);
  useEffect(() => { void load(); }, [load]);

  const active = state?.active ?? false;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, load]);
  useEffect(() => { if (state && !state.active) onChanged(); }, [state?.active]); // eslint-disable-line react-hooks/exhaustive-deps

  const changes = useMemo(() => {
    if (!state) return [];
    return state.run.cases.flatMap((item) => {
      const review = reviews[caseKey(item)];
      if (!review || (review.verdict === item.verdict && review.comment.trim() === item.comment)) return [];
      return [{ suite: item.suite, id: item.id, verdict: review.verdict, comment: review.comment }];
    });
  }, [state, reviews]);
  const dirty = changes.length > 0;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useUnsavedGuard(dirty);

  const review = (item: RunCase): Review => reviews[caseKey(item)] ?? { verdict: item.verdict, comment: item.comment };
  const setReview = (item: RunCase, patch: Partial<Review>) => {
    setSaved(false);
    setReviews((current) => ({ ...current, [caseKey(item)]: { ...review(item), ...patch } }));
  };

  const saveVerdicts = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await studioFetch<{ run: RunFile }>(runPath(packId, runId), { method: "PUT", body: { verdicts: changes } });
      setState((current) => (current ? { ...current, run: data.run } : current));
      setReviews({});
      setSaved(true);
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: "stop" | "rerun") => {
    setBusy(true);
    setError(null);
    try {
      const data = await studioFetch<{ run: RunFile; unsavedChanges?: number }>(runPath(packId, runId), { method: "POST", body: { action } });
      if (action === "rerun") onStarted(data.run, data.unsavedChanges ?? 0);
      else await load();
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setBusy(false);
    }
  };

  if (!state) return error ? <Notice kind="error">{error}</Notice> : <p className="studio-muted">{t("studio.common.loading")}</p>;
  const { run } = state;
  const done = run.cases.filter((item) => item.status !== "en-attente" && item.status !== "en-cours").length;
  const caseError = (code: string) => {
    const key = `studio.runs.caseError.${code}`;
    const text = t(key);
    return text === key ? code : text;
  };

  return (
    <div className="studio-section">
      <header className="studio-section-header is-row">
        <div>
          <h2 className="studio-title">{run.model.provider}/{run.model.id}</h2>
          <p className="studio-muted">
            {t("studio.runs.meta", { date: formatStudioDate(run.startedAt, locale), by: run.startedBy })}
            {" · "}{t(`studio.runs.runStatus.${run.status}`)}
            {" · "}{t("studio.runs.progress", { done, total: run.cases.length })}
          </p>
          <p className="studio-hint">{t("studio.runs.options", { tools: run.options.tools.join(", "), timeout: Math.round(run.options.timeoutMs / 60_000), concurrency: run.options.concurrency })}</p>
        </div>
        <div className="studio-list-actions">
          {state.active && <button type="button" className="studio-button is-danger" disabled={busy} onClick={() => void act("stop")}>{t("studio.runs.stop")}</button>}
          {!state.active && state.unfinished.length > 0 && (
            <button type="button" className="studio-button" disabled={busy} onClick={() => void act("rerun")}>{t("studio.runs.rerun", { count: state.unfinished.length })}</button>
          )}
          <button
            type="button"
            className="studio-button is-danger"
            disabled={busy || state.active}
            title={state.active ? t("studio.runs.deleteActive") : undefined}
            onClick={() => setDeleting(true)}
          >
            {t("studio.runs.delete")}
          </button>
        </div>
      </header>
      {deleting && (
        <DeleteRunDialog
          packId={packId}
          run={run}
          onClose={() => setDeleting(false)}
          onDeleted={() => { setDeleting(false); onDeleted(); }}
        />
      )}
      {state.active && <progress className="studio-progress" max={run.cases.length} value={done} aria-label={t("studio.runs.progressLabel")} />}
      {error && <Notice kind="error">{error}</Notice>}
      <ul className="studio-case-list">
        {run.cases.map((item) => {
          const key = caseKey(item);
          const current = review(item);
          const finished = item.status !== "en-attente" && item.status !== "en-cours";
          const open = openCase === key;
          return (
            <li key={key} className={`studio-case is-${item.status}`}>
              <button type="button" className="studio-case-head" aria-expanded={open} onClick={() => setOpenCase(open ? null : key)}>
                <span className="studio-mono">{item.suite} · {item.id}</span>
                <span className="studio-case-query">{item.requete}</span>
                <span className={`studio-badge is-case-${item.status}`}>{t(`studio.runs.status.${item.status}`)}</span>
                {current.verdict && <span className={`studio-badge is-verdict-${current.verdict}`}>{t(`studio.runs.verdict.${current.verdict}`)}</span>}
                <span className="studio-muted">{formatDuration(item.durationMs)}</span>
              </button>
              {open && (
                <div className="studio-case-body">
                  <div className="studio-case-columns">
                    <section>
                      <h3 className="studio-subtitle">{t("studio.runs.query")}</h3>
                      <p className="studio-prewrap">{item.requete}</p>
                      <h3 className="studio-subtitle">{t("studio.runs.expected")}</h3>
                      <p className="studio-prewrap">{item.attendu || t("studio.runs.none")}</p>
                      {item.sources && (<><h3 className="studio-subtitle">{t("studio.runs.sources")}</h3><p className="studio-prewrap">{item.sources}</p></>)}
                    </section>
                    <section>
                      <h3 className="studio-subtitle">{t("studio.runs.answer")}</h3>
                      {item.error && <Notice kind="error">{caseError(item.error)}</Notice>}
                      {item.answer ? <div className="studio-answer"><MarkdownBody>{item.answer}</MarkdownBody></div> : !item.error && <p className="studio-muted">{finished ? t("studio.runs.noAnswer") : t("studio.runs.waiting")}</p>}
                    </section>
                  </div>
                  {item.toolCalls && item.toolCalls.length > 0 && (
                    <section>
                      <h3 className="studio-subtitle">{t("studio.runs.toolCalls", { count: item.toolCalls.length })}</h3>
                      {item.toolCalls.map((call, index) => (
                        <details key={index} className="studio-tool-call">
                          <summary>
                            <span className="studio-mono">{call.name}</span>
                            {call.blocked ? <span className="studio-badge is-warning">{t("studio.runs.blocked")}</span> : call.isError && <span className="studio-badge is-error">{t("studio.runs.toolError")}</span>}
                          </summary>
                          {call.blocked && <p className="studio-hint">{t("studio.runs.blockedHint")}</p>}
                          <pre className="studio-pre">{call.input}</pre>
                          <pre className="studio-pre">{call.result}</pre>
                        </details>
                      ))}
                    </section>
                  )}
                  {finished && (
                    <section className="studio-review">
                      <div className="studio-segmented" role="group" aria-label={t("studio.runs.verdictLabel")}>
                        {VERDICTS.map((verdict) => (
                          <button key={verdict} type="button" aria-pressed={current.verdict === verdict} onClick={() => setReview(item, { verdict: current.verdict === verdict ? null : verdict })}>
                            {t(`studio.runs.verdict.${verdict}`)}
                          </button>
                        ))}
                      </div>
                      <label className="studio-visually-hidden" htmlFor={`studio-comment-${key}`}>{t("studio.runs.comment")}</label>
                      <textarea id={`studio-comment-${key}`} className="studio-textarea" rows={2} maxLength={2000} placeholder={t("studio.runs.comment")} value={current.comment} onChange={(event) => setReview(item, { comment: event.target.value })} />
                      <div className="studio-list-actions">
                        {item.sessionId && <a className="studio-button" href={`/?session=${encodeURIComponent(item.sessionId)}`} target="_blank" rel="noreferrer">{t("studio.runs.openSession")}</a>}
                        {item.reviewedBy && <span className="studio-hint">{t("studio.runs.reviewedBy", { by: item.reviewedBy, date: formatStudioDate(item.reviewedAt, locale) })}</span>}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="studio-savebar">
        <span className={`studio-dirty${dirty ? " is-dirty" : ""}`} aria-live="polite">
          {dirty ? t("studio.runs.unsavedVerdicts", { count: changes.length }) : saved ? t("studio.runs.verdictsSaved") : t("studio.runs.reviewHint")}
        </span>
        <button type="button" className="studio-button is-primary" disabled={!dirty || busy} onClick={() => void saveVerdicts()}>{t("studio.runs.saveVerdicts")}</button>
      </div>
    </div>
  );
}

function DeleteRunDialog({ packId, run, onClose, onDeleted }: { packId: string; run: RunFile; onClose: () => void; onDeleted: () => void }) {
  const { t, locale } = useI18n();
  const [sessions, setSessions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionCount = new Set(run.cases.map((item) => item.sessionId).filter(Boolean)).size;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await studioFetch(`${runPath(packId, run.runId)}${sessions ? "?sessions=1" : ""}`, { method: "DELETE" });
      onDeleted();
    } catch (cause) {
      setError(errorMessage(cause, t));
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t("studio.runs.deleteTitle", { model: run.model.id, date: formatStudioDate(run.startedAt, locale) })}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="studio-button" onClick={onClose}>{t("studio.common.cancel")}</button>
          <button type="button" className="studio-button is-danger" disabled={busy} onClick={() => void submit()}>{t("studio.runs.delete")}</button>
        </>
      )}
    >
      <p>{t("studio.runs.deleteMessage", { count: run.cases.length })}</p>
      {sessionCount > 0 && (
        <label className="studio-check-row">
          <input type="checkbox" checked={sessions} onChange={(event) => setSessions(event.target.checked)} />
          <span>{t("studio.runs.deleteSessions", { count: sessionCount })}</span>
        </label>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </Dialog>
  );
}
