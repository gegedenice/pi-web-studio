import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getProjectTrustStatus } from "../../project-trust";
import { loadSkillsWithInstallInfo } from "../../skills-service";
import { getStudioConfig } from "../config";
import { isStudioError } from "../errors";
import { readPackText } from "../files";
import { inspectMcpServer, type InspectionResult, type McpInspector, piInspector } from "../mcp/inspect";
import { listMcpServers } from "../mcp/servers";
import { externalChanges, nonEmpty, readPackMeta } from "../packs";
import { AGENTS_FILE, APPEND_SYSTEM_FILE, assertPackId, MCP_CONFIG_FILE, packsRoot, resolvePackPath, SETTINGS_FILE, SYSTEM_FILE } from "../paths";
import { listSkills } from "../skills";
import { readRuns } from "../tests/runs";
import { listSuites } from "../tests/suites";
import { hasErrors } from "../validate";
import { findSecrets } from "./secrets";

// "Valider le pack" (STUDIO.md lot 4): one list, green, orange or red, built
// from what the other lots already check. Red blocks a publication (Q-L4-1).

export type CheckLevel = "ok" | "warning" | "error";

export interface CheckDetail {
  /** i18n key suffix under `studio.release.detail.` */
  key: string;
  params?: Record<string, string | number>;
}

export interface ReleaseCheck {
  id: "trust" | "instructions" | "skills" | "mcpFile" | "mcpReach" | "secrets" | "suites" | "campaign" | "parents" | "external";
  level: CheckLevel;
  /** i18n key suffix under `studio.release.check.` */
  key: string;
  params?: Record<string, string | number>;
  details?: CheckDetail[];
  /** The workshop section that fixes it. */
  section?: "instructions" | "skills" | "mcp" | "tests" | "configuration" | "history";
}

export interface PackValidation {
  level: CheckLevel;
  checks: ReleaseCheck[];
  validatedAt: string;
}

const RANK: Record<CheckLevel, number> = { ok: 0, warning: 1, error: 2 };

export function worstLevel(levels: CheckLevel[]): CheckLevel {
  return levels.reduce<CheckLevel>((worst, level) => (RANK[level] > RANK[worst] ? level : worst), "ok");
}

async function checkSkills(packId: string, trusted: boolean): Promise<ReleaseCheck> {
  const skills = listSkills(packId);
  if (!skills.length) return { id: "skills", level: "error", key: "noSkill", section: "skills" };
  const broken = skills.filter((skill) => hasErrors(skill.issues));
  if (broken.length) return { id: "skills", level: "error", key: "skillsBroken", params: { count: broken.length }, details: broken.map((skill) => ({ key: "skill", params: { name: skill.name } })), section: "skills" };
  const details: CheckDetail[] = skills.filter((skill) => skill.issues.length).map((skill) => ({ key: "skillWarnings", params: { name: skill.name } }));
  if (trusted) {
    try {
      const dir = resolvePackPath(packId);
      const loaded = new Set((await loadSkillsWithInstallInfo(dir)).skills.filter((skill) => skill.filePath.startsWith(`${dir}/`)).map((skill) => skill.name));
      for (const skill of skills) if (!loaded.has(skill.name)) details.push({ key: "skillNotLoaded", params: { name: skill.name } });
    } catch {
      // Pi's loader is a second opinion: its failure is not the pack's.
    }
  }
  return details.length
    ? { id: "skills", level: "warning", key: "skillsWarnings", params: { count: skills.length }, details, section: "skills" }
    : { id: "skills", level: "ok", key: "skillsOk", params: { count: skills.length }, section: "skills" };
}

async function checkMcp(packId: string, inspector: McpInspector): Promise<ReleaseCheck[]> {
  const overview = await listMcpServers(packId);
  const fileDetails: CheckDetail[] = [];
  let fileLevel: CheckLevel = "ok";
  if (overview.fileInvalid) {
    fileLevel = "error";
    fileDetails.push({ key: "mcpFileInvalid" });
  }
  for (const server of overview.servers) {
    if (server.invalid) {
      fileLevel = "error";
      fileDetails.push({ key: "serverInvalid", params: { name: server.name, reason: server.invalid } });
    } else if (server.outside === "stdio" || server.outside === "sse" || server.outside === "notAnObject") {
      fileLevel = "error";
      fileDetails.push({ key: `serverOutside.${server.outside}`, params: { name: server.name } });
    } else if (server.outside) {
      fileLevel = worstLevel([fileLevel, "warning"]);
      fileDetails.push({ key: "serverOutsideOther", params: { name: server.name } });
    }
  }
  const fileCheck: ReleaseCheck = {
    id: "mcpFile",
    level: fileLevel,
    key: overview.servers.length ? (fileLevel === "ok" ? "mcpFileOk" : "mcpFileProblems") : "mcpNone",
    params: { count: overview.servers.length },
    ...(fileDetails.length ? { details: fileDetails } : {}),
    section: "mcp",
  };

  // Every enabled server the Studio may connect, inspected now and in parallel (Q-L4-4).
  const reachable = overview.servers.filter((server) => server.enabled && !server.invalid && (server.form || server.url) && server.outside !== "stdio" && server.outside !== "sse");
  const results = await Promise.all(reachable.map(async (server) => {
    try {
      return { name: server.name, result: await inspectMcpServer(packId, server.name, inspector) };
    } catch (error) {
      return { name: server.name, error: isStudioError(error) ? error.code : "unexpected" };
    }
  }));
  const reachDetails: CheckDetail[] = [];
  const levels: CheckLevel[] = [];
  for (const item of results) {
    const result: InspectionResult | undefined = "result" in item ? item.result : undefined;
    if (!result) {
      levels.push("error");
      reachDetails.push({ key: "inspectRefused", params: { name: item.name, reason: "error" in item ? item.error ?? "" : "" } });
    } else if (result.state === "connected") {
      reachDetails.push({ key: "inspectOk", params: { name: item.name, count: result.toolCount } });
    } else if (result.state === "needs-auth" || result.state === "variable-missing") {
      levels.push("warning");
      reachDetails.push({ key: `inspect.${result.state}`, params: { name: item.name } });
    } else {
      levels.push("error");
      reachDetails.push({ key: `inspect.${result.state}`, params: { name: item.name } });
    }
  }
  const reachLevel = worstLevel(levels);
  const reachCheck: ReleaseCheck = {
    id: "mcpReach",
    level: reachLevel,
    key: !reachable.length ? "mcpReachNone" : reachLevel === "ok" ? "mcpReachOk" : "mcpReachProblems",
    params: { count: reachable.length },
    ...(reachDetails.length ? { details: reachDetails } : {}),
    section: "mcp",
  };
  return [fileCheck, reachCheck];
}

function checkSuites(packId: string): ReleaseCheck {
  const suites = listSuites(packId);
  if (!suites.length) return { id: "suites", level: "warning", key: "noSuite", section: "tests" };
  const broken = suites.filter((suite) => hasErrors(suite.issues));
  if (broken.length) return { id: "suites", level: "error", key: "suitesBroken", params: { count: broken.length }, details: broken.map((suite) => ({ key: "suite", params: { name: suite.titre } })), section: "tests" };
  return { id: "suites", level: "ok", key: "suitesOk", params: { count: suites.length }, section: "tests" };
}

async function checkCampaign(packId: string): Promise<ReleaseCheck> {
  const finished = (await readRuns(packId)).filter((run) => run.status !== "en-cours");
  const last = finished[finished.length - 1];
  if (!last) return { id: "campaign", level: "warning", key: "noCampaign", section: "tests" };
  const ko = last.cases.filter((item) => item.verdict === "ko").length;
  const unjudged = last.cases.filter((item) => item.verdict === null).length;
  const params = { model: last.model.id, total: last.cases.length, ko, unjudged };
  if (ko) return { id: "campaign", level: "warning", key: "campaignKo", params, section: "tests" };
  if (unjudged) return { id: "campaign", level: "warning", key: "campaignUnjudged", params, section: "tests" };
  return { id: "campaign", level: "ok", key: "campaignOk", params, section: "tests" };
}

/** Context files above the pack that Pi would also read, outside any export (E6). */
function checkParents(packId: string): ReleaseCheck {
  const found: string[] = [];
  let dir = dirname(resolvePackPath(packId));
  for (;;) {
    for (const name of ["AGENTS.md", "AGENTS.override.md", "CLAUDE.md"]) {
      if (existsSync(join(dir, name))) found.push(join(dir, name));
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found.length
    ? { id: "parents", level: "warning", key: "parentsFound", details: found.map((path) => ({ key: "path", params: { path } })) }
    : { id: "parents", level: "ok", key: "parentsOk" };
}

export async function validatePack(packId: string, inspector: McpInspector = piInspector): Promise<PackValidation> {
  const id = assertPackId(packId);
  readPackMeta(id);
  packsRoot();
  const trusted = getProjectTrustStatus(resolvePackPath(id), getStudioConfig().agentDir).trusted;
  const agents = nonEmpty(id, AGENTS_FILE);
  const prompt = nonEmpty(id, APPEND_SYSTEM_FILE) || nonEmpty(id, SYSTEM_FILE);
  const secrets = findSecrets(readPackText(resolvePackPath(id, MCP_CONFIG_FILE)), readPackText(resolvePackPath(id, SETTINGS_FILE)));
  const changes = await externalChanges(id);
  const checks: ReleaseCheck[] = [
    trusted ? { id: "trust", level: "ok", key: "trustOk" } : { id: "trust", level: "error", key: "trustMissing" },
    agents && prompt
      ? { id: "instructions", level: "ok", key: "instructionsOk", section: "instructions" }
      : { id: "instructions", level: "error", key: !agents ? "agentsMissing" : "promptMissing", section: "instructions" },
    await checkSkills(id, trusted),
    ...(await checkMcp(id, inspector)),
    secrets.length
      ? { id: "secrets", level: "error", key: "secretsFound", details: secrets.map((finding) => ({ key: "secret", params: { file: finding.file, where: finding.where } })), section: "mcp" }
      : { id: "secrets", level: "ok", key: "secretsOk" },
    checkSuites(id),
    await checkCampaign(id),
    checkParents(id),
    changes.length
      ? { id: "external", level: "warning", key: "externalChanges", params: { count: changes.length }, section: "history" }
      : { id: "external", level: "ok", key: "externalNone" },
  ];
  return { level: worstLevel(checks.map((check) => check.level)), checks, validatedAt: new Date().toISOString() };
}
