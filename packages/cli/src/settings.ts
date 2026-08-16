import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";

export interface ChatSettings {
  provider: string;
  model: string;
  enabledTools: string[];
}

/**
 * Tools the chat turn is broken without, added to a settings file that predates
 * them. The `nodetool.*` object model documents these namespaces, so a belt
 * missing one turns a documented call into "tool not in this toolbelt" —
 * which is what `nodetool.models.pick()` did until `find_model` landed here.
 * They need no credential of their own: each resolves its provider from the
 * model it is handed, or reports that none is configured.
 */
export const ALWAYS_ENABLED_TOOLS: readonly string[] = [
  // Documents.
  "extract_pdf_text",
  "convert_pdf_to_markdown",
  "convert_document",
  // Discovery: providers, models, node types.
  "find_model",
  "list_models",
  "list_provider_models",
  "search_nodes",
  "get_node_info",
  "list_nodes",
  // Generation, and reading back what it produced.
  "generate_image",
  "edit_image",
  "generate_video",
  "animate_image",
  "generate_speech",
  "transcribe_audio",
  "read_media_bytes"
];

export const DEFAULT_SETTINGS: ChatSettings = {
  provider: detectDefaultProvider(),
  model: detectDefaultModel(),
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
    // NodeTool MCP tools
    "list_workflows",
    "get_workflow",
    "create_workflow",
    "run_workflow",
    "validate_workflow",
    "get_example_workflow",
    "export_workflow_digraph",
    "list_jobs",
    "get_job",
    "get_job_logs",
    "start_background_job",
    "list_assets",
    "get_asset",
    "asset_search",
    "save_asset",
    "read_asset",
    ...ALWAYS_ENABLED_TOOLS
  ]
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
      return "gemini-3.5-flash";
    default:
      return "llama3.2";
  }
}

const SETTINGS_DIR = join(homedir(), ".nodetool");
const SETTINGS_FILE = join(SETTINGS_DIR, "chat-settings.json");

/**
 * Drop legacy fields from older settings files: agent-mode / planner toggles
 * (the unified chat agent has no mode) and `workspace` (it now always defaults
 * to the current directory and is never persisted).
 */
function migrateSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const {
    agentMode: _dropMode,
    agentPlanner: _dropPlanner,
    workspace: _dropWorkspace,
    ...rest
  } = raw;
  void _dropMode;
  void _dropPlanner;
  void _dropWorkspace;
  return rest;
}

export async function loadSettings(): Promise<ChatSettings> {
  try {
    const content = await readFile(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return { ...DEFAULT_SETTINGS, ...migrateSettings(parsed) };
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
