import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createJiti } from "jiti";
import { NextRequest } from "next/server.js";
import { repoRoot } from "./studio-test-env.mjs";

const saved = { password: process.env.PI_WEB_PASSWORD, home: process.env.STUDIO_HOME };
const jiti = createJiti(import.meta.url, { alias: { "@": repoRoot }, interopDefault: true, moduleCache: false });
const { proxy, config } = await jiti.import("../../proxy.ts");
const { createWebSessionToken } = await jiti.import("../web-auth.ts");

after(() => {
  for (const [key, value] of [["PI_WEB_PASSWORD", saved.password], ["STUDIO_HOME", saved.home]]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// A page load, as the browser sends it; FETCH is what the proxy sees of every other request
// in a production build (Next.js strips its rsc / next-router-* headers and _rsc first).
const DOCUMENT = { "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate", Accept: "text/html,application/xhtml+xml" };
const FETCH = { "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", Accept: "*/*" };
// A page load passed on by pi-web's service worker (public/sw.js, production only): its
// fetch(request) turns the navigation into `empty` / `same-origin`, the Accept stays.
const SW_NAVIGATION = { "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "same-origin", Accept: "text/html,application/xhtml+xml" };
const request = (path, headers = {}) => new NextRequest(`http://localhost${path}`, { headers: { Host: "localhost", ...DOCUMENT, ...headers } });

test("Studio pages go through the proxy and need the web password like /", () => {
  assert.ok(config.matcher.includes("/studio"));
  assert.ok(config.matcher.includes("/studio/:path*"));
  process.env.PI_WEB_PASSWORD = "secret";
  delete process.env.STUDIO_HOME;
  const response = proxy(request("/studio/literature-review"));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost/login");
  const cookie = `pi_web_session=${createWebSessionToken("secret")}`;
  assert.equal(proxy(request("/studio", { Cookie: cookie })).status, 200);
  assert.equal(proxy(request("/studio", { Host: "evil.example" })).status, 403);
});

test("STUDIO_HOME=true sends a bare / to /studio, after login, and leaves pi-web links alone", () => {
  process.env.STUDIO_HOME = "true";
  process.env.PI_WEB_PASSWORD = "secret";
  const cookie = `pi_web_session=${createWebSessionToken("secret")}`;
  assert.equal(proxy(request("/")).headers.get("location"), "http://localhost/login");
  assert.equal(proxy(request("/", { Cookie: cookie })).headers.get("location"), "http://localhost/studio");
  assert.equal(proxy(request("/?session=abc", { Cookie: cookie })).status, 200);
  delete process.env.PI_WEB_PASSWORD;
  assert.equal(proxy(request("/")).headers.get("location"), "http://localhost/studio");
  delete process.env.STUDIO_HOME;
  assert.equal(proxy(request("/")).status, 200);
});

test("after « Retour à Pi Web », / stays on pi-web until the Studio is opened again", () => {
  process.env.STUDIO_HOME = "true";
  delete process.env.PI_WEB_PASSWORD;
  // The link sets the place.
  const back = proxy(request("/?pi-web"));
  assert.equal(back.status, 200);
  const setCookie = back.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /pi_studio_place=pi-web/);
  assert.match(setCookie, /HttpOnly/i);
  // pi-web rewrites its address to "/" (router.replace) and reloads stay there.
  assert.equal(proxy(request("/", { Cookie: "pi_studio_place=pi-web" })).status, 200);
  // Opening the Studio forgets the place; "/" then opens the Studio again.
  const studio = proxy(request("/studio", { Cookie: "pi_studio_place=pi-web" }));
  assert.equal(studio.status, 200);
  assert.match(studio.headers.get("set-cookie") ?? "", /pi_studio_place=;/);
  assert.equal(proxy(request("/")).headers.get("location"), "http://localhost/studio");
  delete process.env.STUDIO_HOME;
});

test("only a page load moves anything: prefetches, client navigations and pi-web's own fetches change nothing", () => {
  process.env.STUDIO_HOME = "true";
  delete process.env.PI_WEB_PASSWORD;
  const onPiWeb = { Cookie: "pi_studio_place=pi-web" };
  // pi-web is shown: its « π Studio » link is prefetched (production), it fetches "/" itself (router.replace).
  const prefetch = proxy(request("/studio", { ...onPiWeb, ...FETCH, "Next-Url": "/" }));
  assert.equal(prefetch.status, 200);
  assert.equal(prefetch.headers.get("set-cookie"), null, "the place is kept");
  assert.equal(proxy(request("/", { ...onPiWeb, ...FETCH })).status, 200);
  assert.equal(proxy(request("/", FETCH)).status, 200, "a fetch of / is never redirected, even without a place");
  assert.equal(proxy(request("/", onPiWeb)).status, 200, "a reload of / stays on pi-web");
  // The Studio is shown: its « Retour à Pi Web » link, prefetched, does not choose pi-web.
  assert.equal(proxy(request("/?pi-web", { ...FETCH, "Next-Url": "/studio" })).headers.get("set-cookie"), null);
  assert.equal(proxy(request("/")).headers.get("location"), "http://localhost/studio");
  // Both links are plain <a>: a click is a page load, which does move the place.
  assert.match(proxy(request("/studio", onPiWeb)).headers.get("set-cookie") ?? "", /pi_studio_place=;/);
  assert.match(proxy(request("/?pi-web")).headers.get("set-cookie") ?? "", /pi_studio_place=pi-web/);
  // The same page loads through the service worker.
  assert.match(proxy(request("/?pi-web", SW_NAVIGATION)).headers.get("set-cookie") ?? "", /pi_studio_place=pi-web/);
  assert.equal(proxy(request("/", { ...SW_NAVIGATION, ...onPiWeb })).status, 200, "a reload through the service worker stays on pi-web");
  assert.match(proxy(request("/studio", { ...SW_NAVIGATION, ...onPiWeb })).headers.get("set-cookie") ?? "", /pi_studio_place=;/);
  assert.equal(proxy(request("/", SW_NAVIGATION)).headers.get("location"), "http://localhost/studio");
  // Without Fetch Metadata (an old browser), Accept: text/html still marks a page load.
  assert.equal(proxy(new NextRequest("http://localhost/", { headers: { Host: "localhost", Accept: "text/html" } })).headers.get("location"), "http://localhost/studio");
  delete process.env.STUDIO_HOME;
});
