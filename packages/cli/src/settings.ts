import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";

/**
 * Chat agent mode.
 *
 * - `"off"`         — plain chat: a single LLM call per turn, no planning.
 * - `"loop"`        — agent loop: iterative LLM + tool calling (SimpleAgent-style).
 * - `"plan"`        — TaskPlanner builds a parallel task DAG of LLM steps; CompilerAgent synthesizes.
 * - `"graph"`       — GraphPlanner builds a workflow graph using `nodetool.*` core nodes.
 * - `"multi-agent"` — A team of sub-agents collaborates via shared task board.
 */
export type AgentMode = "off" | "loop" | "plan" | "graph" | "multi-agent";

export const AGENT_MODES: readonly AgentMode[] = [
  "off",
  "loop",
  "plan",
  "graph",
  "multi-agent"
] as const;

export function isAgentMode(value: unknown): value is AgentMode {
  return (
    typeof value === "string" && (AGENT_MODES as readonly string[]).includes(value)
  );
}

export interface ChatSettings {
  provider: string;
  model: string;
  agentMode: AgentMode;
  enabledTools: string[];
  workspace: string;
}

export const DEFAULT_SETTINGS: ChatSettings = {
  provider: detectDefaultProvider(),
  model: detectDefaultModel(),
  agentMode: "off",
  enabledTools: [
    "read_file",
    "write_file",
    "edit_file",
    "list_directory",
    "glob",
    "grep",
    "download_file",
    "http_request",
    "browser",
    "take_screenshot",
    "run_code",
    "calculate",
    // NodeTool MCP tools
    "list_workflows",
    "get_workflow",
    "create_workflow",
    "run_workflow",
    "validate_workflow",
    "get_example_workflow",
    "export_workflow_digraph",
    "list_nodes",
    "search_nodes",
    "get_node_info",
    "list_jobs",
    "get_job",
    "get_job_logs",
    "start_background_job",
    "list_assets",
    "get_asset",
    "list_models"
  ],
  workspace: process.cwd()
};

function detectDefaultProvider(): string {
  if (process.env["ANTHROPIC_API_KEY"]) return "anthropic";
  if (process.env["OPENAI_API_KEY"]) return "openai";
  if (process.env["GEMINI_API_KEY"]) return "gemini";
  return "ollama"; // local fallback
}

function detectDefaultModel(): string {
  const prov = detectDefaultProvider();
  switch (prov) {
    case "anthropic":
      return "claude-sonnet-4-6";
    case "openai":
      return "gpt-4o";
    case "gemini":
      return "gemini-2.0-flash";
    default:
      return "llama3.2";
  }
}

const SETTINGS_DIR = join(homedir(), ".nodetool");
const SETTINGS_FILE = join(SETTINGS_DIR, "chat-settings.json");

/**
 * Migrate the legacy `agentMode: boolean` + `agentPlanner: "multi" | "graph"`
 * shape to the unified `agentMode: AgentMode` enum.
 */
function migrateSettings(raw: Record<string, unknown>): Record<string, unknown> {
  if (isAgentMode(raw["agentMode"])) return raw;

  const legacyMode = raw["agentMode"];
  const legacyPlanner = raw["agentPlanner"];
  let mode: AgentMode = "off";
  if (legacyMode === true) {
    mode = legacyPlanner === "graph" ? "graph" : "plan";
  }
  const { agentPlanner: _drop, ...rest } = raw;
  void _drop;
  return { ...rest, agentMode: mode };
}

export async function loadSettings(): Promise<ChatSettings> {
  try {
    const content = await readFile(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return { ...DEFAULT_SETTINGS, ...migrateSettings(parsed) } as ChatSettings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(
  settings: Partial<ChatSettings>
): Promise<void> {
  try {
    await mkdir(SETTINGS_DIR, { recursive: true });
    const current = await loadSettings();
    await writeFile(
      SETTINGS_FILE,
      JSON.stringify({ ...current, ...settings }, null, 2)
    );
  } catch {
    // ignore save errors silently
  }
}
