/**
 * The user's saved tool rules: which tools run without asking.
 *
 * A rule is either "always allow" or "ask". Ask is the default, so only the
 * always-allow keys are stored, as one JSON array in the user's settings row
 * {@link TOOL_RULES_SETTING_KEY}. A chat turn loads them into the gate's
 * `alwaysAllow` set, the approval card's "Always allow" adds one, and the
 * Settings page lists and edits them.
 *
 * Design: packages/agents/docs/permission-gate.md § "Saved tool rules".
 */

import { Setting } from "@nodetool-ai/models";
import {
  EXECUTE_CODE_TOOL_NAME,
  capabilityModuleOf,
  listCapabilitySpecs
} from "@nodetool-ai/agents";
import type {
  ToolPermissionGroup,
  ToolPermissionRule
} from "@nodetool-ai/protocol/api-schemas/settings.js";

export const TOOL_RULES_SETTING_KEY = "tool_permissions.always_allow";

/** Rule keys are tool names, or `tool:target` for a narrowed approval. */
const MAX_RULE_KEY_LENGTH = 256;

function parseRuleKeys(value: string | undefined | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (key): key is string =>
        typeof key === "string" &&
        key.length > 0 &&
        key.length <= MAX_RULE_KEY_LENGTH
    );
  } catch {
    // A hand-edited or truncated row reads as "no saved rules", which is the
    // safe reading: every tool asks again.
    return [];
  }
}

/** The rule keys the user set to "Always allow". */
export async function loadAlwaysAllowedTools(
  userId: string
): Promise<Set<string>> {
  const row = await Setting.find(userId, TOOL_RULES_SETTING_KEY);
  return new Set(parseRuleKeys(row?.value));
}

/**
 * Set one tool's rule and return the full always-allow set after the write.
 * Writing "ask" for a key that has no rule is a no-op.
 */
export async function setToolRule(
  userId: string,
  ruleKey: string,
  rule: ToolPermissionRule
): Promise<Set<string>> {
  const keys = await loadAlwaysAllowedTools(userId);
  const had = keys.has(ruleKey);
  if (rule === "always_allow") {
    keys.add(ruleKey);
  } else {
    keys.delete(ruleKey);
  }
  if (had !== keys.has(ruleKey)) {
    await Setting.upsert({
      userId,
      key: TOOL_RULES_SETTING_KEY,
      value: JSON.stringify([...keys].sort()),
      description: "Tools that run in chat without asking"
    });
  }
  return keys;
}

/** Group titles for the capability modules a user is likely to scan for. */
const GROUP_LABELS: Readonly<Record<string, string>> = {
  code: "Code",
  "js-scripts": "Scripts",
  workflows: "Workflows",
  nodes: "Nodes",
  jobs: "Runs & jobs",
  runs: "Runs & jobs",
  media: "Media generation",
  generations: "Media generation",
  assets: "Assets & files",
  files: "Assets & files",
  documents: "Documents",
  email: "Email",
  google: "Google Workspace",
  web: "Web",
  browser: "Browser",
  apify: "Web",
  serpapi: "Web",
  apps: "Apps",
  timelines: "Timelines",
  fonts: "Timelines",
  "hf-downloads": "Models",
  "example-timelines": "Timelines",
  "video-production": "Video production",
  storyboards: "Storyboards",
  scripts: "Storyboards",
  entities: "Storyboards",
  compositions: "Timelines",
  sketches: "Sketches",
  model3d: "3D",
  game: "Games",
  collections: "Collections",
  memory: "Memory",
  shared: "Memory",
  projects: "Projects",
  trash: "Projects",
  threads: "Chats",
  agents: "Agents",
  flow: "Agents",
  workers: "Workers",
  packs: "Packs & skills",
  skills: "Packs & skills",
  settings: "Settings",
  presets: "Presets",
  models: "Models",
  costs: "Models",
  errors: "Runs & jobs",
  analysis: "Analysis",
  ui: "Editor"
};

/** The groups always listed first, in this order; the rest sort by title. */
const LEADING_GROUPS = ["Code", "Workflows", "Media generation", "Web"];

function groupTitle(moduleName: string | undefined): string {
  if (!moduleName) {
    return "Other";
  }
  return (
    GROUP_LABELS[moduleName] ??
    moduleName.charAt(0).toUpperCase() + moduleName.slice(1).replace(/-/g, " ")
  );
}

function groupId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function firstSentence(description: string): string {
  const trimmed = description.trim();
  const end = trimmed.search(/(?<=[.!?])\s/);
  return end > 0 ? trimmed.slice(0, end) : trimmed;
}

interface CatalogTool {
  name: string;
  description: string;
  category: "write" | "execute" | "external";
  group: string;
}

/**
 * Every tool that can ask, grouped for the Settings page. Read-class tools
 * never ask, so a rule for one would change nothing and they are left out.
 * Saved keys no catalog entry owns (an Apify actor, an external MCP tool)
 * are listed under "Other" so the user can still take them back.
 */
export function toolPermissionCatalog(
  alwaysAllow: ReadonlySet<string>
): ToolPermissionGroup[] {
  const tools: CatalogTool[] = [
    {
      name: EXECUTE_CODE_TOOL_NAME,
      description:
        "Run a code action that changes things, spends money or deletes data.",
      category: "execute",
      group: "Code"
    },
    {
      name: "run_node",
      description: "Run one workflow node with the inputs the agent picks.",
      category: "execute",
      group: "Nodes"
    }
  ];
  const seen = new Set(tools.map((tool) => tool.name));
  for (const spec of listCapabilitySpecs()) {
    if (spec.category === "read" || seen.has(spec.name)) {
      continue;
    }
    seen.add(spec.name);
    tools.push({
      name: spec.name,
      description: firstSentence(spec.description),
      category: spec.category,
      group: groupTitle(capabilityModuleOf(spec.name))
    });
  }
  for (const key of alwaysAllow) {
    if (!seen.has(key)) {
      seen.add(key);
      tools.push({
        name: key,
        description: "",
        category: "external",
        group: "Other"
      });
    }
  }

  const byGroup = new Map<string, CatalogTool[]>();
  for (const tool of tools) {
    const list = byGroup.get(tool.group) ?? [];
    list.push(tool);
    byGroup.set(tool.group, list);
  }
  const rank = (title: string): number => {
    const index = LEADING_GROUPS.indexOf(title);
    if (index >= 0) return index;
    return title === "Other" ? Number.MAX_SAFE_INTEGER : LEADING_GROUPS.length;
  };
  return [...byGroup.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([title, list]) => ({
      id: groupId(title),
      title,
      tools: list
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          category: tool.category,
          rule: alwaysAllow.has(tool.name) ? "always_allow" : "ask"
        }))
    }));
}
