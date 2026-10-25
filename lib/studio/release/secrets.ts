import { isReferenceOnly, isSecretName, literalSecretFields, looksLikeSecretValue } from "../../mcp-secrets";

// No secret in a published or exported pack (STUDIO.md lot 4, Q-L4-7): the
// Studio writes only references (`Bearer ${NAME}`), but `.pi/mcp.json` and
// `.pi/settings.json` can be edited by hand. Instructions and skills are not
// searched: a false alarm there would be frequent.

export interface SecretFinding {
  file: ".pi/mcp.json" | ".pi/settings.json";
  /** Where, without the value: `openalex › en-tête Authorization`. */
  where: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parse(text: string | undefined): unknown {
  if (!text?.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const FIELD_LABELS: Record<string, string> = {
  env: "variable",
  header: "en-tête",
  "oauth-client-secret": "oauth.clientSecret",
  url: "adresse",
  args: "arguments",
  command: "commande",
};

export function findMcpSecrets(text: string | undefined): SecretFinding[] {
  const data = parse(text);
  if (!isRecord(data) || !isRecord(data.mcpServers)) return [];
  return Object.entries(data.mcpServers).flatMap(([name, entry]) => literalSecretFields(entry).map((field) => ({
    file: ".pi/mcp.json" as const,
    where: `${name} › ${FIELD_LABELS[field.kind]}${"name" in field ? ` ${field.name}` : ""}`,
  })));
}

/**
 * String values of `.pi/settings.json` under a key named like a credential
 * (`apiKey`, `token`…) that are not references. Values alone are not judged:
 * a model id such as `Qwen3-VL-8B-Instruct-GGUF` looks random enough to pass for a key.
 */
export function findSettingsSecrets(text: string | undefined): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const walk = (value: unknown, path: string[]) => {
    if (typeof value === "string") {
      const key = path[path.length - 1] ?? "";
      if (value && !value.startsWith("!") && !isReferenceOnly(value) && isSecretName(key) && looksLikeSecretOrLong(value)) {
        findings.push({ file: ".pi/settings.json", where: path.join(" › ") });
      }
    } else if (Array.isArray(value)) value.forEach((item, index) => walk(item, [...path, String(index)]));
    else if (isRecord(value)) for (const [key, item] of Object.entries(value)) walk(item, [...path, key]);
  };
  walk(parse(text), []);
  return findings;
}

function looksLikeSecretOrLong(value: string): boolean {
  return looksLikeSecretValue(value) || value.length >= 6;
}

export function findSecrets(mcpText: string | undefined, settingsText: string | undefined): SecretFinding[] {
  return [...findMcpSecrets(mcpText), ...findSettingsSecrets(settingsText)];
}
