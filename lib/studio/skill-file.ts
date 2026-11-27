import { dump } from "js-yaml";
import { parseSkill } from "./validate";

/** What the skill form edits, read from a SKILL.md. */
export interface SkillFields {
  declaredName: string;
  description: string;
  body: string;
  /** Other frontmatter keys, kept as they are when the form saves. */
  extra: Record<string, unknown>;
}

export function readSkillFields(raw: string): SkillFields {
  const { frontmatter, body } = parseSkill(raw);
  if (!frontmatter) return { declaredName: "", description: "", body: raw, extra: {} };
  const { name, description, ...extra } = frontmatter;
  return {
    declaredName: typeof name === "string" ? name : "",
    description: typeof description === "string" ? description : "",
    body: body.replace(/^\n+/, ""),
    extra,
  };
}

/**
 * Writes a SKILL.md from the form: `name` and `description` first, the other
 * frontmatter keys of `previousRaw` after them in their order, then the body.
 * The YAML is generated, so a description holding `:` or quotes stays valid.
 */
export function composeSkill(fields: { name: string; description: string; body: string }, previousRaw?: string): string {
  const extra = previousRaw ? readSkillFields(previousRaw).extra : {};
  const yaml = dump({ name: fields.name, description: fields.description, ...extra }, { lineWidth: -1, noRefs: true });
  const body = fields.body.replace(/\r\n?/g, "\n").replace(/^\n+/, "");
  return `---\n${yaml}---\n\n${body.endsWith("\n") || body === "" ? body : `${body}\n`}`;
}

/** The same file with its `name` set to `name` (renaming, restoring under a new folder, importing). */
export function withSkillName(raw: string, name: string): string {
  const fields = readSkillFields(raw);
  if (fields.declaredName === name) return raw;
  return composeSkill({ name, description: fields.description, body: fields.body }, raw);
}
