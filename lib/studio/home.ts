import { NextResponse, type NextRequest } from "next/server";

// PI Studio (fork), STUDIO_HOME=true: "/" opens the place the person used last.
// The Studio by default; after "Retour à Pi Web" (/?pi-web), pi-web, until the
// Studio is opened again.
//
// Only a real page load (a document request) moves anything. In a production
// build, Next.js hands the proxy neither its `rsc` / `next-router-prefetch`
// headers nor the `_rsc` parameter, so a <Link> prefetch, a client navigation
// and pi-web's own router.replace("/") all look alike here; what tells a page
// load apart is the browser's Sec-Fetch-Dest: document (`empty` for those
// fetches; a navigation the service worker passes on keeps Accept: text/html).
// Treating every request as a page load is what sent pi-web back to
// the Studio: showing pi-web prefetched its « π Studio » link (/studio), which
// forgot the place, and its own fetch of "/" was redirected (STUDIO-NOTES §18.6).
// The links that cross between the two are therefore plain <a> elements: a
// click on them is a page load, which is what sets the place.

export const STUDIO_PLACE_COOKIE = "pi_studio_place";
const PI_WEB_PLACE = "pi-web";
const ONE_YEAR_S = 60 * 60 * 24 * 365;

/** A page load in the browser's tab: an address typed, a reload, a plain link followed. */
export function isDocumentRequest(request: NextRequest): boolean {
  const dest = request.headers.get("sec-fetch-dest");
  if (dest === "document") return true;
  // pi-web's service worker (public/sw.js, production only) fetches every
  // navigation again to fall back on offline.html: that request reaches the
  // server as `empty` / `same-origin`, but keeps the browser's own Accept,
  // which starts with text/html. The router's fetches send Accept: */*.
  const pageAccept = /^\s*text\/html/i.test(request.headers.get("accept") ?? "");
  if (dest) return dest === "empty" && pageAccept;
  // Without Fetch Metadata (an old browser, a script), a page asks for HTML.
  return pageAccept;
}

/** The response for an authenticated (or password-less) page or API request, `next` being pi-web's own. */
export function withStudioHome(request: NextRequest, next: () => NextResponse): NextResponse {
  if (process.env.STUDIO_HOME !== "true") return next();
  if (!isDocumentRequest(request)) return next();
  const { pathname, searchParams, search } = request.nextUrl;
  const place = request.cookies.get(STUDIO_PLACE_COOKIE)?.value;

  if (pathname === "/" && searchParams.has("pi-web")) {
    const response = next();
    if (place !== PI_WEB_PLACE) {
      response.cookies.set(STUDIO_PLACE_COOKIE, PI_WEB_PLACE, { path: "/", sameSite: "lax", httpOnly: true, maxAge: ONE_YEAR_S });
    }
    return response;
  }
  if (pathname === "/studio" || pathname.startsWith("/studio/")) {
    const response = next();
    if (place === PI_WEB_PLACE) response.cookies.delete({ name: STUDIO_PLACE_COOKIE, path: "/" });
    return response;
  }
  if (pathname === "/" && search === "" && place !== PI_WEB_PLACE) {
    return NextResponse.redirect(new URL("/studio", request.url));
  }
  return next();
}
