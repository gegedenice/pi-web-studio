import { NextResponse } from "next/server";
import { studioErrorPayload, StudioError } from "./errors";
import { getStudioIdentity, type StudioIdentity } from "./identity";

// Shared plumbing of the /api/studio routes. Authentication (password, host
// checks) is pi-web's: proxy.ts covers every /api path.

export function studioJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function studioHandle(task: () => Promise<unknown> | unknown, status = 200): Promise<NextResponse> {
  try {
    return studioJson(await task(), status);
  } catch (error) {
    const { body, status: errorStatus } = studioErrorPayload(error);
    return studioJson(body, errorStatus);
  }
}

export function identityOf(req: Request): StudioIdentity {
  return getStudioIdentity(req.headers);
}

/** The JSON object of a request body; anything else is a 400 the page can name. */
export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new StudioError("invalidRequest", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new StudioError("invalidRequest", 400);
  return body as Record<string, unknown>;
}

export function searchParam(req: Request, name: string): string | null {
  return new URL(req.url).searchParams.get(name);
}
