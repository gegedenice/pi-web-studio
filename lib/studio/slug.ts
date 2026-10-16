// Client-safe naming rules shared by the pages and the server.

/** Pack ids and skill names: the Agent Skills name rule (also what Pi checks). */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 64;
export const DESCRIPTION_MAX_LENGTH = 1024;

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);
}

/** An id proposed from a title: "Revue de littérature" → "revue-de-litterature". */
export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}
