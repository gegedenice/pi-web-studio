"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { errorMessage, packPath, StudioRequestError, studioFetch } from "@/lib/studio/client";
import type { PublishedVersion, PublishOutcome } from "@/lib/studio/release/publish";
import type { CheckLevel, PackValidation, ReleaseCheck } from "@/lib/studio/release/validate";
import type { PackDetails } from "@/lib/studio/types";
import { Dialog, formatStudioDate, Notice } from "../StudioUi";

type Section = NonNullable<ReleaseCheck["section"]>;

const LEVEL_CLASS: Record<CheckLevel, string> = { ok: "is-ok", warning: "is-warning", error: "is-error" };

interface VersionsResponse {
  versions: PublishedVersion[];
  next: { minor: string; major: string };
}

/** "Valider le pack" (lot 4): the whole check, MCP inspections included, then "Publier une version…". */
export function ValidationDialog({ packId, onClose, onNavigate, onPublish }: {
  packId: string;
  onClose: () => void;
  onNavigate: (section: Section) => void;
  onPublish: (validation: PackValidation) => void;
}) {
  const { t, locale } = useI18n();
  const [validation, setValidation] = useState<PackValidation | null>(null);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      setValidation((await studioFetch<{ validation: PackValidation }>(packPath(packId, "/validate"), { method: "POST" })).validation);
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setRunning(false);
    }
  }, [packId, t]);
  useEffect(() => { void run(); }, [run]);

  return (
    <Dialog
      title={t("studio.check.title")}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="studio-button" disabled={running} onClick={() => void run()}>{t("studio.release.rerun")}</button>
          <button type="button" className="studio-button" onClick={onClose}>{t("studio.common.close")}</button>
          <button
            type="button"
            className="studio-button is-primary"
            disabled={running || !validation || validation.level === "error"}
            title={validation?.level === "error" ? t("studio.release.publishBlockedHint") : undefined}
            onClick={() => validation && onPublish(validation)}
          >
            {t("studio.release.publish")}
          </button>
        </>
      )}
    >
      {running && <p className="studio-muted" aria-live="polite">{t("studio.release.running")}</p>}
      {error && <Notice kind="error">{error}</Notice>}
      {validation && !running && (
        <>
          <Notice kind={validation.level === "ok" ? "info" : validation.level === "warning" ? "warning" : "error"}>
            <strong>{t(`studio.release.summary.${validation.level}`)}</strong>{" "}
            <span className="studio-hint">{t("studio.release.checkedAt", { date: formatStudioDate(validation.validatedAt, locale) })}</span>
          </Notice>
          <ul className="studio-checks">
            {validation.checks.map((check) => (
              <li key={check.id} className={LEVEL_CLASS[check.level]}>
                <span className={`studio-badge ${LEVEL_CLASS[check.level]}`}>{t(`studio.release.level.${check.level}`)}</span>
                <span className="studio-check-text">
                  <span>{t(`studio.release.check.${check.key}`, check.params)}</span>
                  {check.details && check.details.length > 0 && (
                    <ul className="studio-plain-list studio-check-details">
                      {check.details.map((detail, index) => <li key={index}>{t(`studio.release.detail.${detail.key}`, detail.params)}</li>)}
                    </ul>
                  )}
                </span>
                {check.section && check.level !== "ok" && (
                  <button type="button" className="studio-link-button" onClick={() => onNavigate(check.section as Section)}>{t(`studio.nav.${check.section}`)}</button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}

/** "Publier une version" (lot 4): version number, note, and the warnings to accept. */
export function PublishDialog({ packId, pack, validation, onClose, onPublished }: {
  packId: string;
  pack: PackDetails;
  validation: PackValidation;
  onClose: () => void;
  onPublished: (outcome: PublishOutcome) => void;
}) {
  const { t } = useI18n();
  const [next, setNext] = useState<VersionsResponse["next"] | null>(null);
  const [step, setStep] = useState<"minor" | "major">("minor");
  const [note, setNote] = useState("");
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    studioFetch<VersionsResponse>(packPath(packId, "/versions")).then((data) => setNext(data.next)).catch((cause) => setError(errorMessage(cause, t)));
  }, [packId, t]);

  const warnings = validation.level === "warning";
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onPublished(await studioFetch<PublishOutcome>(packPath(packId, "/versions"), { method: "POST", body: { note, step, acceptWarnings: accept } }));
    } catch (cause) {
      setError(errorMessage(cause, t));
      setBusy(false);
      if (cause instanceof StudioRequestError && cause.code === "publishBlocked") setAccept(false);
    }
  };

  return (
    <Dialog
      title={t("studio.release.publishTitle")}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="studio-button" onClick={onClose}>{t("studio.common.cancel")}</button>
          <button type="button" className="studio-button is-primary" disabled={busy || !next || !note.trim() || (warnings && !accept)} onClick={() => void submit()}>
            {busy ? t("studio.release.publishing") : t("studio.release.publishAction", { version: next ? next[step] : "…" })}
          </button>
        </>
      )}
    >
      <p className="studio-muted">{t("studio.release.publishIntro")}</p>
      <fieldset className="studio-fieldset">
        <legend>{t("studio.release.versionNumber")}</legend>
        <label className="studio-check-row">
          <input type="radio" name="studio-publish-step" checked={step === "minor"} onChange={() => setStep("minor")} />
          <span>{t("studio.release.stepMinor", { version: next?.minor ?? "…", current: pack.meta.version })}</span>
        </label>
        <label className="studio-check-row">
          <input type="radio" name="studio-publish-step" checked={step === "major"} onChange={() => setStep("major")} />
          <span>{t("studio.release.stepMajor", { version: next?.major ?? "…" })}</span>
        </label>
      </fieldset>
      <div className="studio-field">
        <label htmlFor="studio-publish-note">{t("studio.release.note")}</label>
        <textarea id="studio-publish-note" className="studio-textarea" rows={4} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
        <p className="studio-hint">{t("studio.release.noteHint")}</p>
      </div>
      {validation.level === "ok"
        ? <Notice kind="info">{t("studio.release.willValidate")}</Notice>
        : (
          <>
            <Notice kind="warning">{t("studio.release.statusKept", { status: t(`studio.status.${pack.meta.status}`) })}</Notice>
            <label className="studio-check-row">
              <input type="checkbox" checked={accept} onChange={(event) => setAccept(event.target.checked)} />
              <span>{t("studio.release.acceptWarnings")}</span>
            </label>
          </>
        )}
      {error && <Notice kind="error">{error}</Notice>}
    </Dialog>
  );
}

/** Downloads a published version's zip; an error answer (a secret, no version) is shown instead. */
async function download(packId: string, version: string, runs: boolean): Promise<void> {
  const response = await fetch(`/api/studio${packPath(packId, `/export?version=${encodeURIComponent(version)}${runs ? "&runs=1" : ""}`)}`, { cache: "no-store" });
  if (!response.ok) {
    let body: unknown = {};
    try {
      body = await response.json();
    } catch {
      // keep the empty body
    }
    throw new StudioRequestError(response.status, body as never);
  }
  const blob = await response.blob();
  const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? `${packId}-v${version}.zip`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "Exporter" (lot 4): a published version as a zip, campaigns optional. */
export function ExportDialog({ packId, initialVersion, onClose }: { packId: string; initialVersion?: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [versions, setVersions] = useState<PublishedVersion[] | null>(null);
  const [version, setVersion] = useState(initialVersion ?? "");
  const [runs, setRuns] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    studioFetch<VersionsResponse>(packPath(packId, "/versions"))
      .then((data) => {
        setVersions(data.versions);
        setVersion((current) => current || data.versions[0]?.version || "");
      })
      .catch((cause) => setError(errorMessage(cause, t)));
  }, [packId, t]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await download(packId, version, runs);
      setDone(true);
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t("studio.release.exportTitle")}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="studio-button" onClick={onClose}>{t("studio.common.close")}</button>
          <button type="button" className="studio-button is-primary" disabled={busy || !version} onClick={() => void submit()}>{t("studio.release.download")}</button>
        </>
      )}
    >
      {versions === null && !error && <p className="studio-muted">{t("studio.common.loading")}</p>}
      {versions?.length === 0 && <Notice kind="info">{t("studio.release.exportNone")}</Notice>}
      {versions && versions.length > 0 && (
        <>
          <p className="studio-muted">{t("studio.release.exportIntro")}</p>
          <div className="studio-field">
            <label htmlFor="studio-export-version">{t("studio.release.exportVersion")}</label>
            <select id="studio-export-version" className="studio-input" value={version} onChange={(event) => setVersion(event.target.value)}>
              {versions.map((item) => (
                <option key={item.tag} value={item.version}>{t("studio.release.versionOption", { version: item.version, date: formatStudioDate(item.date, locale) })}</option>
              ))}
            </select>
          </div>
          <label className="studio-check-row">
            <input type="checkbox" checked={runs} onChange={(event) => setRuns(event.target.checked)} />
            <span>{t("studio.release.includeRuns")}</span>
          </label>
          {done && <Notice kind="info">{t("studio.release.downloaded")}</Notice>}
        </>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </Dialog>
  );
}

/** "Versions publiées", at the top of the pack history. */
export function PublishedVersions({ packId, refreshKey, onExport }: { packId: string; refreshKey: number; onExport: (version: string) => void }) {
  const { t, locale } = useI18n();
  const [versions, setVersions] = useState<PublishedVersion[] | null>(null);
  useEffect(() => {
    studioFetch<VersionsResponse>(packPath(packId, "/versions")).then((data) => setVersions(data.versions)).catch(() => setVersions([]));
  }, [packId, refreshKey]);
  return (
    <section className="studio-card" aria-labelledby="studio-published-title">
      <h3 id="studio-published-title" className="studio-subtitle">{t("studio.release.publishedTitle")}</h3>
      {versions === null && <p className="studio-muted">{t("studio.common.loading")}</p>}
      {versions?.length === 0 && <p className="studio-muted">{t("studio.release.publishedNone")}</p>}
      {versions && versions.length > 0 && (
        <ul className="studio-plain-list studio-versions">
          {versions.map((item) => (
            <li key={item.tag} className="studio-version-row">
              <span>
                <strong>{t("studio.release.versionLabel", { version: item.version })}</strong>
                <span className="studio-hint"> {t("studio.release.versionMeta", { date: formatStudioDate(item.date, locale), author: item.author })}</span>
                {item.note && <span className="studio-prewrap studio-version-note">{item.note}</span>}
              </span>
              <button type="button" className="studio-button" onClick={() => onExport(item.version)}>{t("studio.release.export")}</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
