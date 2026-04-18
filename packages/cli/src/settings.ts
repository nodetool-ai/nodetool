import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";

export interface ChatSettings {
  provider: string;
  model: string;
  agentMode: boolean;
  enabledTools: string[];
  workspace: string;
}

export const DEFAULT_SETTINGS: ChatSettings = {
  provider: detectDefaultProvider(),
  model: detectDefaultModel(),
  agentMode: false,
  enabledTools: [
    "read_file",
    "write_file",
    "edit_file",
    "list_directory",
    "glob",
    "grep",
    "download_file",
    "http_request",
    "http_get",
    "browser",
    "screenshot",
    "run_code",
    "calculator",
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

export async function loadSettings(): Promise<ChatSettings> {
  try {
    const content = await readFile(SETTINGS_FILE, "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
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
