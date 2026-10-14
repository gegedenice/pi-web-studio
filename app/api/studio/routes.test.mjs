import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import { gitIn, repoRoot, setupStudioEnv } from "../../../lib/studio/studio-test-env.mjs";

const jiti = createJiti(import.meta.url, { alias: { "@": repoRoot }, interopDefault: true });
const packsRoute = await jiti.import("./packs/route.ts");
const packRoute = await jiti.import("./packs/[pack]/route.ts");
const filesRoute = await jiti.import("./packs/[pack]/files/route.ts");
const skillsRoute = await jiti.import("./packs/[pack]/skills/route.ts");
const skillRoute = await jiti.import("./packs/[pack]/skills/[skill]/route.ts");
const historyRoute = await jiti.import("./packs/[pack]/history/route.ts");
const meRoute = await jiti.import("./me/route.ts");

const url = (path) => `http://127.0.0.1:30141/api/studio${path}`;
const request = (method, path, body, headers = {}) => new Request(url(path), {
  method,
  headers: { "content-type": "application/json", ...headers },
  ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
});
const params = (values) => ({ params: Promise.resolve(values) });
const json = async (response) => ({ status: response.status, body: await response.json() });

function quiet(t) {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  t.after(() => { console.warn = warn; console.error = error; });
}

test("the lot 1 journey through the API: create, add a skill, save, restore, with the proxy's user", async (t) => {
  const { base, packsDir } = setupStudioEnv(t, { STUDIO_TRUSTED_PROXY: "true" });
  quiet(t);
  writeFileSync(join(base, "studio-users.json"), JSON.stringify({ geraldine: { name: "Géraldine", email: "g@example.org" } }));
  const as = { "remote-user": "geraldine" };

  assert.deepEqual((await json(await meRoute.GET(request("GET", "/me", undefined, as)))).body, { id: "geraldine", name: "Géraldine", fallback: false });

  let res = await json(await packsRoute.POST(request("POST", "/packs", { id: "literature-review", title: "Revue de littérature" }, as)));
  assert.equal(res.status, 201);
  res = await json(await packsRoute.POST(request("POST", "/packs", { id: "literature-review", title: "Encore" }, as)));
  assert.deepEqual([res.status, res.body.code], [409, "packExists"]);
  res = await json(await packsRoute.POST(request("POST", "/packs", "pas du json", as)));
  assert.deepEqual([res.status, res.body.code], [400, "invalidRequest"]);
  assert.equal((await json(await packsRoute.GET())).body.packs.length, 1);

  const pack = params({ pack: "literature-review" });
  res = await json(await skillsRoute.POST(request("POST", "/packs/literature-review/skills", { name: "openalex-search", description: "Recherche OpenAlex." }, as), pack));
  assert.equal(res.status, 201);
  const first = res.body.skill;

  const skill = params({ pack: "literature-review", skill: "openalex-search" });
  res = await json(await skillRoute.PUT(request("PUT", "/x", { description: "", body: "x", baseHash: first.hash }, as), skill));
  assert.deepEqual([res.status, res.body.code, res.body.issues.map((issue) => issue.code)], [422, "validationFailed", ["descriptionMissing"]]);
  res = await json(await skillRoute.PUT(request("PUT", "/x", { description: "Modifiée", body: first.body, baseHash: first.hash }, as), skill));
  assert.equal(res.status, 200);
  res = await json(await skillRoute.PUT(request("PUT", "/x", { description: "Encore", body: first.body, baseHash: first.hash }, as), skill));
  assert.deepEqual([res.status, res.body.code], [409, "conflict"]);

  res = await json(await historyRoute.GET(request("GET", "/x?path=.pi/skills/openalex-search/SKILL.md"), pack));
  assert.equal(res.body.versions.length, 2);
  const oldest = res.body.versions.at(-1).rev;
  res = await json(await historyRoute.GET(request("GET", `/x?path=.pi/skills/openalex-search/SKILL.md&rev=${oldest}`), pack));
  assert.match(res.body.version.content, /Recherche OpenAlex\./);
  res = await json(await historyRoute.POST(request("POST", "/x", { action: "restore-file", path: ".pi/skills/openalex-search/SKILL.md", rev: oldest }, as), pack));
  assert.equal(res.status, 200);
  assert.equal((await json(await skillRoute.GET(request("GET", "/x"), skill))).body.skill.description, "Recherche OpenAlex.");

  const log = gitIn(packsDir, "log", "--format=%an <%ae>|%s").trim().split("\n");
  assert.equal(log.length, 5);
  assert.ok(log.slice(0, 4).every((line) => line.startsWith("Géraldine <g@example.org>|[literature-review] ")), log.join("\n"));

  res = await json(await packRoute.GET(request("GET", "/x"), pack));
  assert.equal(res.body.pack.journey.design, "ready");
  assert.deepEqual(res.body.skills.map((item) => item.name), ["openalex-search"]);
});

test("files: only the editable ones, and paths that leave the pack are refused", async (t) => {
  setupStudioEnv(t);
  quiet(t);
  await packsRoute.POST(request("POST", "/packs", { id: "p", title: "P" }));
  const pack = params({ pack: "p" });
  let res = await json(await filesRoute.GET(request("GET", "/x?path=AGENTS.md"), pack));
  assert.equal(res.body.file.exists, true);
  res = await json(await filesRoute.PUT(request("PUT", "/x", { path: "AGENTS.md", content: "Nouveau\n", baseHash: res.body.file.hash, note: "Réécrit" }), pack));
  assert.equal(res.status, 200);
  res = await json(await filesRoute.GET(request("GET", "/x?path=../../etc/passwd"), pack));
  assert.deepEqual([res.status, res.body.code], [400, "invalidPath"]);
  res = await json(await filesRoute.GET(request("GET", "/x?path=.studio/pack.json"), pack));
  assert.deepEqual([res.status, res.body.code], [403, "fileNotEditable"]);
  res = await json(await packRoute.GET(request("GET", "/x"), params({ pack: "absent" })));
  assert.deepEqual([res.status, res.body.code], [404, "packNotFound"]);
  res = await json(await packRoute.GET(request("GET", "/x"), params({ pack: "../p" })));
  assert.deepEqual([res.status, res.body.code], [400, "invalidPackId"]);
});

test("a deleted skill is listed in the pack history and comes back from it", async (t) => {
  setupStudioEnv(t);
  quiet(t);
  await packsRoute.POST(request("POST", "/packs", { id: "p", title: "P" }));
  const pack = params({ pack: "p" });
  await skillsRoute.POST(request("POST", "/x", { import: "---\nname: crossref\ndescription: Vérifie les DOI.\n---\n\n# Crossref\n" }), pack);
  assert.equal((await json(await skillRoute.DELETE(request("DELETE", "/x"), params({ pack: "p", skill: "crossref" })))).status, 200);
  let res = await json(await historyRoute.GET(request("GET", "/x"), pack));
  assert.deepEqual(res.body.deletedSkills.map((item) => item.name), ["crossref"]);
  assert.ok(res.body.versions.length >= 3);
  res = await json(await historyRoute.POST(request("POST", "/x", { action: "restore-skill", name: "crossref", rev: res.body.deletedSkills[0].rev }), pack));
  assert.equal(res.status, 200);
  assert.deepEqual((await json(await skillsRoute.GET(request("GET", "/x"), pack))).body.skills.map((item) => item.name), ["crossref"]);
});
