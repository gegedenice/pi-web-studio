import { NextResponse, type NextRequest } from "next/server";

// PI Studio (fork), STUDIO_HOME=true: "/" opens the place the person used last.
// The Studio by default; after "Retour à Pi Web" (/?pi-web), pi-web, until the
// Studio is opened again. Only a page load of a bare "/" ever moves: pi-web
// rewrites its own address to "/" (router.replace) and fetches it as an RSC
// request, which must never be sent to the Studio.

export const STUDIO_PLACE_COOKIE = "pi_studio_place";
const PI_WEB_PLACE = "pi-web";
const ONE_YEAR_S = 60 * 60 * 24 * 365;

/**
 * A request Next.js sends ahead of any click: a <Link> in view is prefetched in
 * production (pi-web's « π Studio » button, the Studio's « Retour à Pi Web »).
 * It must never move the place, or merely showing pi-web would send "/" back to
 * the Studio (and showing the Studio would send it to pi-web).
 */
function isPrefetchRequest(request: NextRequest): boolean {
  return request.headers.has("next-router-prefetch")
    || request.headers.has("next-router-segment-prefetch")
    || /prefetch/i.test(request.headers.get("purpose") ?? "")
    || /prefetch/i.test(request.headers.get("sec-purpose") ?? "");
}

function isRscRequest(request: NextRequest): boolean {
  return request.headers.has("rsc")
    || request.headers.has("next-router-state-tree")
    || request.nextUrl.searchParams.has("_rsc");
}

/** The response for an authenticated (or password-less) page or API request, `next` being pi-web's own. */
export function withStudioHome(request: NextRequest, next: () => NextResponse): NextResponse {
  if (process.env.STUDIO_HOME !== "true") return next();
  const { pathname, searchParams, search } = request.nextUrl;
  const place = request.cookies.get(STUDIO_PLACE_COOKIE)?.value;

  if (pathname === "/" && searchParams.has("pi-web")) {
    const response = next();
    if (place !== PI_WEB_PLACE && !isPrefetchRequest(request)) {
      response.cookies.set(STUDIO_PLACE_COOKIE, PI_WEB_PLACE, { path: "/", sameSite: "lax", httpOnly: true, maxAge: ONE_YEAR_S });
    }
    return response;
  }
  if (pathname === "/studio" || pathname.startsWith("/studio/")) {
    const response = next();
    if (place === PI_WEB_PLACE && !isPrefetchRequest(request)) response.cookies.delete({ name: STUDIO_PLACE_COOKIE, path: "/" });
    return response;
  }
  if (pathname === "/" && search === "" && place !== PI_WEB_PLACE && !isRscRequest(request)) {
    return NextResponse.redirect(new URL("/studio", request.url));
  }
  return next();
}
