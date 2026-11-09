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

const request = (path, headers = {}) => new NextRequest(`http://localhost${path}`, { headers: { Host: "localhost", ...headers } });

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

test("an RSC request for / is never redirected to the Studio", () => {
  process.env.STUDIO_HOME = "true";
  delete process.env.PI_WEB_PASSWORD;
  assert.equal(proxy(request("/", { RSC: "1" })).status, 200);
  assert.equal(proxy(request("/", { "Next-Router-State-Tree": "%5B%5D" })).status, 200);
  assert.equal(proxy(request("/?_rsc=abc")).status, 200);
  delete process.env.STUDIO_HOME;
});

test("a prefetch never moves the place: showing pi-web's « π Studio » link or the Studio's « Retour à Pi Web » changes nothing", () => {
  process.env.STUDIO_HOME = "true";
  delete process.env.PI_WEB_PASSWORD;
  const onPiWeb = { Cookie: "pi_studio_place=pi-web" };
  // pi-web is shown: its sidebar link to /studio is prefetched in production.
  for (const headers of [{ RSC: "1", "Next-Router-Prefetch": "1" }, { RSC: "1", "Next-Router-Segment-Prefetch": "/_tree" }, { Purpose: "prefetch" }, { "Sec-Purpose": "prefetch" }]) {
    const prefetch = proxy(request("/studio", { ...onPiWeb, ...headers }));
    assert.equal(prefetch.status, 200);
    assert.equal(prefetch.headers.get("set-cookie"), null, JSON.stringify(headers));
  }
  assert.equal(proxy(request("/", onPiWeb)).status, 200, "a reload of / stays on pi-web");
  // A click on that link (a client navigation, not a prefetch) does open the Studio.
  assert.match(proxy(request("/studio", { ...onPiWeb, RSC: "1" })).headers.get("set-cookie") ?? "", /pi_studio_place=;/);
  // The Studio is shown: its « Retour à Pi Web » link is prefetched, which must not choose pi-web.
  assert.equal(proxy(request("/?pi-web", { RSC: "1", "Next-Router-Prefetch": "1" })).headers.get("set-cookie"), null);
  assert.equal(proxy(request("/")).headers.get("location"), "http://localhost/studio");
  delete process.env.STUDIO_HOME;
});
