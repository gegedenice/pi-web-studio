// Browser side of the /api/studio routes. Client-safe: no Node imports.
import type { StudioErrorBody, ValidationIssue } from "./types";

export class StudioRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly params?: Record<string, string | number>;
  readonly issues?: ValidationIssue[];

  constructor(status: number, body: Partial<StudioErrorBody>) {
    super(body.code ?? "unexpected");
    this.code = body.code ?? (status === 401 ? "unauthenticated" : "unexpected");
    this.status = status;
    this.params = body.params;
    this.issues = body.issues;
  }
}

export async function studioFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/studio${path}`, {
      method: init.method ?? "GET",
      cache: "no-store",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new StudioRequestError(0, { code: "network" });
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // an empty or non-JSON answer (a proxy error page)
  }
  if (!response.ok) throw new StudioRequestError(response.status, (body ?? {}) as Partial<StudioErrorBody>);
  return body as T;
}

export function packPath(packId: string, suffix = ""): string {
  return `/packs/${encodeURIComponent(packId)}${suffix}`;
}

export function skillPath(packId: string, name: string): string {
  return packPath(packId, `/skills/${encodeURIComponent(name)}`);
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** The sentence for an error, in the page's language. */
export function errorMessage(error: unknown, t: Translate): string {
  const code = error instanceof StudioRequestError ? error.code : "unexpected";
  const key = `studio.error.${code}`;
  const text = t(key, error instanceof StudioRequestError ? error.params : undefined);
  return text === key ? t("studio.error.unexpected") : text;
}

/** One validation problem as a sentence, with its line and the expected fix. */
export function issueMessage(issue: ValidationIssue, t: Translate): { text: string; fix: string } {
  const params = issue.params ?? {};
  const text = t(`studio.validation.${issue.code}`, params);
  const fixKey = `studio.validation.${issue.code}.fix`;
  const fix = t(fixKey, params);
  return { text, fix: fix === fixKey ? "" : fix };
}
