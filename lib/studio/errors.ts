import type { StudioErrorBody, ValidationIssue } from "./types";

/**
 * A refusal the Studio explains to the user. `code` is an i18n key suffix under
 * `studio.error.`: the API never sends an English sentence for the page to show.
 */
export class StudioError extends Error {
  readonly code: string;
  readonly status: number;
  readonly params?: Record<string, string | number>;
  readonly issues?: ValidationIssue[];

  constructor(
    code: string,
    status: number,
    params?: Record<string, string | number>,
    issues?: ValidationIssue[],
  ) {
    super(code);
    this.name = "StudioError";
    this.code = code;
    this.status = status;
    this.params = params;
    this.issues = issues;
  }
}

export function isStudioError(error: unknown): error is StudioError {
  return error instanceof StudioError;
}

/** The JSON body and status a route answers for `error`. */
export function studioErrorPayload(error: unknown): { body: StudioErrorBody; status: number } {
  if (isStudioError(error)) {
    return {
      status: error.status,
      body: {
        error: error.code,
        code: error.code,
        ...(error.params ? { params: error.params } : {}),
        ...(error.issues ? { issues: error.issues } : {}),
      },
    };
  }
  // Unexpected failures (git missing, disk full) are logged with their detail
  // on the server; the page gets a generic message.
  console.error("[studio]", error);
  return { status: 500, body: { error: "unexpected", code: "unexpected" } };
}
