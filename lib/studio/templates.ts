import { join } from "node:path";
import { readRegularFileText } from "../regular-file";
import { getStudioConfig } from "./config";
import { StudioError } from "./errors";
import { composeSkill } from "./skill-file";

export const PACK_TEMPLATES = {
  agents: "pack/AGENTS.md",
  appendSystem: "pack/APPEND_SYSTEM.md",
  settings: "pack/settings.json",
} as const;
export const SKILL_TEMPLATE = "skill/SKILL.md";

/** Replaces `{{key}}`; unknown keys are left as written. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (token, key: string) => values[key] ?? token);
}

export function readTemplate(relPath: string): string {
  const text = readRegularFileText(join(getStudioConfig().templatesDir, relPath), 256 * 1024);
  if (text === undefined) throw new StudioError("templateMissing", 500, { template: relPath });
  return text;
}

export function renderPackTemplate(key: keyof typeof PACK_TEMPLATES, values: { id: string; title: string; description: string }): string {
  return fillTemplate(readTemplate(PACK_TEMPLATES[key]), values);
}

/**
 * A new SKILL.md: the template's body with `{{name}}` filled in, under a
 * frontmatter generated from the values (never by text substitution, so any
 * description gives valid YAML).
 */
export function renderSkillTemplate(values: { name: string; description: string }): string {
  const filled = fillTemplate(readTemplate(SKILL_TEMPLATE), { name: values.name, description: "" });
  const bodyStart = filled.startsWith("---") ? filled.indexOf("\n---", 3) : -1;
  const body = bodyStart === -1 ? filled : filled.slice(filled.indexOf("\n", bodyStart + 4) + 1);
  return composeSkill({ name: values.name, description: values.description, body });
}
