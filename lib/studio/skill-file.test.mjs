import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { DefaultResourceLoader, ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import { loadStudio, setupStudioEnv } from "./studio-test-env.mjs";

const [skillFile, templates, validate] = await loadStudio("skill-file", "templates", "validate");

test("the form rewrites name and description and keeps the other frontmatter keys in order", () => {
  const raw = "---\nname: a\nlicense: MIT\ndescription: ancienne\ndisable-model-invocation: true\n---\n\n# Corps\n";
  const next = skillFile.composeSkill({ name: "a", description: "Nouvelle : avec « deux-points »", body: "# Corps modifié" }, raw);
  assert.equal(next, "---\nname: a\ndescription: 'Nouvelle : avec « deux-points »'\nlicense: MIT\ndisable-model-invocation: true\n---\n\n# Corps modifié\n");
  const fields = skillFile.readSkillFields(next);
  assert.deepEqual([fields.declaredName, fields.description, fields.body], ["a", "Nouvelle : avec « deux-points »", "# Corps modifié\n"]);
  assert.deepEqual(fields.extra, { license: "MIT", "disable-model-invocation": true });
});

test("withSkillName changes only the name", () => {
  const raw = skillFile.composeSkill({ name: "old", description: "D", body: "B\n" });
  assert.equal(skillFile.withSkillName(raw, "old"), raw);
  assert.equal(skillFile.readSkillFields(skillFile.withSkillName(raw, "new")).declaredName, "new");
});

test("templates fill their values; the skill template is valid for any description", (t) => {
  setupStudioEnv(t);
  assert.equal(templates.fillTemplate("{{title}} / {{ id }} / {{other}}", { title: "T", id: "i" }), "T / i / {{other}}");
  for (const key of ["agents", "appendSystem", "settings"]) {
    assert.doesNotMatch(templates.renderPackTemplate(key, { id: "lr", title: "LR", description: "D" }), /\{\{/);
  }
  const raw = templates.renderSkillTemplate({ name: "openalex-search", description: "Cherche: \"quoi\" ? # pas un commentaire" });
  assert.deepEqual(validate.validateSkill({ dirName: "openalex-search", raw, fileExists: () => false }), []);
  assert.equal(skillFile.readSkillFields(raw).description, "Cherche: \"quoi\" ? # pas un commentaire");
  assert.match(raw, /\n# openalex-search\n/);
});

test("a skill the Studio accepts is loaded by Pi without diagnostics", async (t) => {
  const { base } = setupStudioEnv(t);
  const project = join(base, "project");
  const agentDir = join(base, "agent");
  mkdirSync(agentDir, { recursive: true });
  const raw = templates.renderSkillTemplate({ name: "openalex-search", description: "Recherche : OpenAlex." });
  mkdirSync(join(project, ".pi/skills/openalex-search"), { recursive: true });
  writeFileSync(join(project, ".pi/skills/openalex-search/SKILL.md"), raw);
  writeFileSync(join(project, ".pi/APPEND_SYSTEM.md"), "Consignes\n");
  new ProjectTrustStore(agentDir).set(project, true);
  const loader = new DefaultResourceLoader({ cwd: project, agentDir });
  await loader.reload({ resolveProjectTrust: async () => true });
  const { skills, diagnostics } = loader.getSkills();
  const loaded = skills.find((skill) => skill.name === "openalex-search");
  assert.ok(loaded, "Pi loads the skill");
  assert.equal(loaded.description, "Recherche : OpenAlex.");
  assert.deepEqual(diagnostics.filter((item) => String(item.path ?? "").includes(project)), []);
});
