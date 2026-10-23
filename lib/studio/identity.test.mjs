import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import test from "node:test";
import { loadStudio, setupStudioEnv } from "./studio-test-env.mjs";

const [identity, messages] = await loadStudio("identity", "commit-message");
const headers = (values) => new Headers(values);

function captureWarnings(t) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  t.after(() => { console.warn = original; });
  return warnings;
}

test("the identity header is ignored unless the trusted proxy is declared", (t) => {
  setupStudioEnv(t, { STUDIO_DEFAULT_USER: "accueil" });
  captureWarnings(t);
  const id = identity.getStudioIdentity(headers({ "Remote-User": "mallory" }));
  assert.equal(id.id, "accueil");
  assert.equal(id.email, "accueil@studio.invalid");
  assert.equal(id.fallback, true);
});

test("behind the trusted proxy the configured header names the user, mapped through studio-users.json", (t) => {
  const { base } = setupStudioEnv(t, { STUDIO_TRUSTED_PROXY: "true", STUDIO_IDENTITY_HEADER: "X-Forwarded-User" });
  captureWarnings(t);
  writeFileSync(`${base}/studio-users.json`, JSON.stringify({ geraldine: { name: "Géraldine G.", email: "g@example.org" } }));
  assert.deepEqual(identity.getStudioIdentity(headers({ "x-forwarded-user": "geraldine" })), {
    id: "geraldine", name: "Géraldine G.", email: "g@example.org", fallback: false,
  });
  assert.equal(identity.getStudioIdentity(headers({ "Remote-User": "geraldine" })).id, "studio", "another header is not read");
});

test("an unknown user is saved under a fallback author, with a warning in the server log", (t) => {
  setupStudioEnv(t, { STUDIO_TRUSTED_PROXY: "true" });
  const warnings = captureWarnings(t);
  const id = identity.getStudioIdentity(headers({ "Remote-User": "bibliothecaire-2" }));
  assert.deepEqual([id.name, id.email, id.fallback], ["bibliothecaire-2", "bibliothecaire-2@studio.invalid", true]);
  assert.ok(warnings.some((line) => line.includes("bibliothecaire-2")));
});

test("header values and user entries that would forge a Git author line are not used", (t) => {
  const { base } = setupStudioEnv(t, { STUDIO_TRUSTED_PROXY: "true" });
  captureWarnings(t);
  assert.equal(identity.getStudioIdentity(headers({ "Remote-User": "eve <x@y>" })).id, "studio");
  writeFileSync(`${base}/studio-users.json`, JSON.stringify({ eve: { name: "Eve <evil@x>\nCommitter", email: "e@x.org" } }));
  assert.equal(identity.getStudioIdentity(headers({ "Remote-User": "eve" })).name, "Eve evil@xCommitter");
  writeFileSync(`${base}/studio-users.json`, "not json");
  assert.equal(identity.getStudioIdentity(headers({ "Remote-User": "eve" })).fallback, true);
});

test("version messages follow the spec's format; a note becomes the title and keeps the summary", () => {
  assert.equal(messages.commitMessage("literature-review", { kind: "edit-skill", name: "openalex-search" }), "[literature-review] Modifie skill openalex-search");
  assert.equal(messages.commitMessage("lr", { kind: "edit-file", path: "AGENTS.md" }), "[lr] Modifie AGENTS.md");
  assert.equal(messages.commitMessage("lr", { kind: "edit-file", path: ".pi/APPEND_SYSTEM.md" }, "  Ajoute\nles contraintes  "), "[lr] Ajoute les contraintes\n\nModifie consignes système");
  assert.equal(messages.cleanNote("x".repeat(500)).length, 200);
  assert.match(messages.commitMessage("lr", { kind: "restore-file", path: "AGENTS.md", date: "2026-10-14T15:20:00Z" }), /Restaure AGENTS.md \(version du 14\/10\/2026 15:20 UTC\)$/);
});
