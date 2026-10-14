"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { issueMessage } from "@/lib/studio/client";
import type { ValidationIssue } from "@/lib/studio/types";

// Small building blocks shared by the Studio's screens. Colors come from
// pi-web's theme tokens (app/globals.css) through app/studio/studio.css.

const ADVANCED_KEY = "pi-studio:advanced-mode";

/** "Mode avancé" (raw files, SYSTEM.md, settings), remembered per browser. */
export function useAdvancedMode(): [boolean, (value: boolean) => void] {
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    try {
      setAdvanced(window.localStorage.getItem(ADVANCED_KEY) === "1");
    } catch {
      // storage unavailable: stays off
    }
  }, []);
  const update = useCallback((value: boolean) => {
    setAdvanced(value);
    try {
      window.localStorage.setItem(ADVANCED_KEY, value ? "1" : "0");
    } catch {
      // not remembered
    }
  }, []);
  return [advanced, update];
}

/** Ctrl/Cmd+S saves while `enabled`; the browser's own "save page" never opens in the Studio. */
export function useSaveShortcut(onSave: () => void, enabled: boolean): void {
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (enabled) saveRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

/** Warns before the tab closes or reloads with unsaved changes. */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

export function Dialog({ title, onClose, children, footer, labelledBy = "studio-dialog-title" }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("input, textarea, select, button:not(.studio-dialog-close)");
    (first ?? panel)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="studio-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} className="studio-dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        <h2 id={labelledBy} className="studio-dialog-title">{title}</h2>
        <div className="studio-dialog-body">{children}</div>
        {footer && <div className="studio-dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, danger, busy, onConfirm, onCancel }: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      footer={(
        <>
          <button type="button" className="studio-button" onClick={onCancel} disabled={busy}>{t("studio.common.cancel")}</button>
          <button type="button" className={`studio-button ${danger ? "is-danger" : "is-primary"}`} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </>
      )}
    >
      <p>{message}</p>
    </Dialog>
  );
}

export function ValidationList({ issues, emptyLabel }: { issues: ValidationIssue[]; emptyLabel?: string }) {
  const { t } = useI18n();
  if (!issues.length) {
    return emptyLabel ? <p className="studio-validation-ok">{emptyLabel}</p> : null;
  }
  return (
    <ul className="studio-validation" aria-label={t("studio.validation.title")}>
      {issues.map((issue, index) => {
        const { text, fix } = issueMessage(issue, t);
        return (
          <li key={`${issue.code}-${index}`} className={`studio-validation-item is-${issue.severity}`}>
            <span className="studio-validation-kind">
              {issue.severity === "error" ? t("studio.validation.blocking") : t("studio.validation.warning")}
            </span>
            <span>
              {issue.line ? <strong>{t("studio.validation.line", { line: issue.line })} </strong> : null}
              {text}
              {fix && <span className="studio-validation-fix"> {fix}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Notice({ kind = "info", children, actions }: {
  kind?: "info" | "warning" | "error" | "success";
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className={`studio-notice is-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <div className="studio-notice-text">{children}</div>
      {actions && <div className="studio-notice-actions">{actions}</div>}
    </div>
  );
}

/** Ready / to check / to fix, from a file's validation. */
export function IssueBadge({ issues }: { issues: ValidationIssue[] }) {
  const { t } = useI18n();
  const errors = issues.some((issue) => issue.severity === "error");
  const warnings = !errors && issues.length > 0;
  const kind = errors ? "error" : warnings ? "warning" : "ok";
  return (
    <span className={`studio-badge is-${kind}`}>
      {errors ? t("studio.state.toFix") : warnings ? t("studio.state.toCheck") : t("studio.state.ready")}
    </span>
  );
}

/** A date as a person reads it: "14 oct. 2026 à 15:20". */
export function formatStudioDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
