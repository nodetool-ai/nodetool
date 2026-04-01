/**
 * Settings API — application settings registry endpoints.
 *
 * GET /api/settings  — returns all registered settings + secrets with configured flags
 * PUT /api/settings  — updates non-secret settings to DB; saves secrets to DB
 */

import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { Secret, Setting } from "@nodetool/models";
import { clearProviderCache } from "@nodetool/runtime";
import { clearSecretCache } from "@nodetool/security";
import { createLogger } from "@nodetool/config";

const log = createLogger("nodetool.settings-api");

interface SettingsHandlerOptions {
  userIdHeader?: string;
}

// ── One-time migration from settings.json ──────────────────────────

let migrationDone = false;

function legacySettingsFilePath(): string {
  const platform = process.platform;
  if (platform === "win32") {
    const appdata = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(appdata, "nodetool", "settings.json");
  }
  return join(homedir(), ".config", "nodetool", "settings.json");
}

async function migrateSettingsFromFile(userId: string): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;

  const filePath = legacySettingsFilePath();
  try {
    const data = await readFile(filePath, "utf8");
    const settings = JSON.parse(data) as Record<string, unknown>;
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === "string" && value.length > 0) {
        await Setting.upsert({ userId, key, value });
      }
    }
    await rename(filePath, filePath + ".migrated");
    log.info("Migrated settings.json to DB", { count: Object.keys(settings).length });
  } catch {
    // File doesn't exist or is unreadable — nothing to migrate
  }
}

// ── Types ──────────────────────────────────────────────────────────

export interface SettingWithValue {
  package_name: string;
  env_var: string;
  group: string;
  description: string;
  enum?: string[] | null;
  value: unknown;
  is_secret: boolean;
}

// ── Registry ───────────────────────────────────────────────────────

export interface SettingDefinition {
  packageName: string;
  envVar: string;
  group: string;
  description: string;
  enum?: string[];
  isSecret?: boolean;
}

const registry: SettingDefinition[] = [];

/** Register a setting definition. Called by packages at startup. */
export function registerSetting(def: SettingDefinition): void {
  // Deduplicate by envVar
  if (!registry.some((s) => s.envVar === def.envVar)) {
    registry.push(def);
  }
}

/** Get all registered definitions. */
export function getRegisteredSettings(): SettingDefinition[] {
  return registry;
}

/** Get a single setting value from DB, then env var. */
export async function getSetting(key: string): Promise<string | null> {
  const setting = await Setting.find("1", key);
  if (setting && setting.value.length > 0) return setting.value;
  const envVal = process.env[key];
  if (envVal !== undefined && envVal.length > 0) return envVal;
  return null;
}

// ── Default settings (ported from nodetool/config/settings.py) ────

function s(envVar: string, group: string, description: string, enumValues?: string[]): void {
  registerSetting({ packageName: "nodetool", envVar, group, description, enum: enumValues });
}
function sec(envVar: string, group: string, description: string): void {
  registerSetting({ packageName: "nodetool", envVar, group, description, isSecret: true });
}

// Folders / paths
s("FONT_PATH", "Folders", "Location of font folder used by image processing nodes like RenderText. If not specified, the system will use default fonts.");
s("VECTORSTORE_DB_PATH", "Folders", "Location of the sqlite-vec vector database file. Used to store and retrieve embeddings for semantic search and RAG applications.");
s("USERS_FILE", "Folders", "Path to users.yaml file for multi-user bearer token authentication. Defaults to ~/.config/nodetool/users.yaml for local deployments.");

// Autosave
s("AUTOSAVE_ENABLED", "Autosave", "Enable automatic saving of workflow versions (default: true)", ["true", "false"]);
s("AUTOSAVE_INTERVAL_MINUTES", "Autosave", "Interval in minutes between automatic workflow autosaves (default: 5, range: 1-60)");
s("AUTOSAVE_MIN_INTERVAL_SECONDS", "Autosave", "Minimum interval in seconds between autosaves to prevent duplicates (default: 30)");
s("AUTOSAVE_MAX_VERSIONS_PER_WORKFLOW", "Autosave", "Maximum number of autosave versions to keep per workflow (default: 20)");
s("AUTOSAVE_KEEP_DAYS", "Autosave", "Number of days to keep autosave versions before cleanup (default: 7)");

// ComfyUI
s("COMFYUI_ADDR", "ComfyUI", "ComfyUI server address for API/WebSocket access (e.g., 127.0.0.1:8188).");

// Provider endpoints
s("VLLM_BASE_URL", "vLLM", "Base URL for the vLLM OpenAI-compatible server (e.g., http://localhost:7777)");
s("OLLAMA_CONTEXT_LENGTH", "Ollama", "Context window size (in tokens) for Ollama models. If not set, the provider will query the model for its default context length.");
s("LLAMA_CPP_URL", "LlamaCpp", "Base URL for the llama.cpp server (e.g., http://127.0.0.1:8080).");
s("LLAMA_CPP_CONTEXT_LENGTH", "LlamaCpp", "Context window size (in tokens) for llama.cpp models. Defaults to 128000.");
s("LMSTUDIO_API_URL", "LMStudio", "Base URL for the LM Studio OpenAI-compatible server (e.g., http://localhost:1234)");

// NodeSupabase
s("NODE_SUPABASE_URL", "NodeSupabase", "Supabase project URL used by user-provided nodes (separate from core SUPABASE_URL)");
s("NODE_SUPABASE_SCHEMA", "NodeSupabase", "Optional schema for user/node Supabase tables (defaults to public when unset)");
s("NODE_SUPABASE_TABLE_PREFIX", "NodeSupabase", "Optional prefix applied to user/node Supabase tables to avoid clashes with core tables");

// Observability
s("TRACELOOP_ENABLED", "Observability", "Enable Traceloop OpenLLMetry tracing", ["true", "false"]);
s("TRACELOOP_APP_NAME", "Observability", "Override the OpenLLMetry application name (defaults to service name)");
s("TRACELOOP_BASE_URL", "Observability", "Override the Traceloop OTLP base URL");
s("TRACELOOP_DISABLE_BATCH", "Observability", "Disable Traceloop batch span processing for local development", ["true", "false"]);

// SERP
s("SERP_PROVIDER", "SERP", "Select which SERP provider to use for search operations. Options: 'serpapi', 'apify', 'dataforseo'.", ["serpapi", "apify", "dataforseo"]);
s("ZAI_USE_CODING_PLAN", "ZAI", "Use Z.AI coding plan endpoint instead of normal endpoint", ["true", "false"]);

// Secrets (value shown as "****" when env var is set, null otherwise)
sec("OPENAI_API_KEY", "OpenAI", "OpenAI API key for accessing GPT models, DALL-E, and other OpenAI services");
sec("OPENROUTER_API_KEY", "OpenRouter", "OpenRouter API key for accessing multiple AI models through a unified API");
sec("ANTHROPIC_API_KEY", "Anthropic", "Anthropic API key for accessing Claude models and other Anthropic services");
sec("CEREBRAS_API_KEY", "Cerebras", "Cerebras API key for accessing fast LLM inference on Cerebras hardware");
sec("TOGETHER_API_KEY", "Together", "Together AI API key for accessing open-source LLMs through Together's inference API");
sec("GROQ_API_KEY", "Groq", "Groq API key for accessing ultra-fast LLM inference on Groq's LPU hardware");
sec("ZHIPU_API_KEY", "ZAI", "Z.AI API key for accessing GLM models through Z.AI's OpenAI-compatible API");
sec("MISTRAL_API_KEY", "Mistral", "Mistral API key for accessing Mistral AI models");
sec("MINIMAX_API_KEY", "MiniMax", "MiniMax API key for accessing MiniMax AI models");
sec("GEMINI_API_KEY", "Gemini", "Gemini API key for accessing Google's Gemini AI models");
sec("HF_TOKEN", "HF", "Token for HuggingFace Inference Providers");
sec("LLAMA_API_KEY", "LlamaCpp", "API key for authenticating with llama-server");
sec("REPLICATE_API_TOKEN", "Replicate", "Replicate API Token for running models on Replicate's cloud infrastructure");
sec("AIME_API_KEY", "Aime", "Aime API key for accessing Aime AI services");
sec("GOOGLE_MAIL_USER", "Google", "Google mail user for email integration features");
sec("GOOGLE_APP_PASSWORD", "Google", "Google app password for secure authentication with Google services");
sec("ELEVENLABS_API_KEY", "ElevenLabs", "ElevenLabs API key for high-quality text-to-speech services");
sec("FAL_API_KEY", "FAL", "FAL API key for accessing FAL.ai's serverless AI infrastructure");
sec("SERPAPI_API_KEY", "SerpAPI", "API key for accessing SerpAPI scraping infrastructure");
sec("APIFY_API_KEY", "Apify", "API key for accessing Apify's web scraping and automation platform");
sec("BROWSER_URL", "Browser", "Browser URL for accessing a browser instance");
sec("RUNPOD_API_KEY", "RunPod", "RunPod API key for accessing serverless endpoints");
sec("NODE_SUPABASE_KEY", "NodeSupabase", "Supabase service key for user-provided nodes");
sec("DATA_FOR_SEO_LOGIN", "DataForSEO", "DataForSEO login for accessing DataForSEO's API");
sec("DATA_FOR_SEO_PASSWORD", "DataForSEO", "DataForSEO password for accessing DataForSEO's API");
sec("TRACELOOP_API_KEY", "Observability", "Traceloop API key for OpenLLMetry trace export");
sec("KIE_API_KEY", "KIE", "KIE API key for accessing kie.ai");
s("KIE_TIMEOUT_SECONDS", "KIE", "Global timeout in seconds for Kie.ai API calls (0 = use default per-model timeout)");
sec("MESHY_API_KEY", "Meshy", "Meshy AI API key for 3D model generation");
sec("RODIN_API_KEY", "Rodin", "Rodin AI API key for 3D model generation");
sec("GITHUB_CLIENT_ID", "GitHub", "GitHub OAuth App Client ID for OAuth PKCE authentication flow");
sec("GITHUB_CLIENT_SECRET", "GitHub", "GitHub OAuth App Client Secret for OAuth PKCE authentication flow");
sec("SERVER_AUTH_TOKEN", "Deployment", "Bearer auth token for securing NodeTool server endpoints in deployment. If unset, bearer auth is disabled.");

// ── Helpers ────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, status);
}

// ── Handlers ───────────────────────────────────────────────────────

async function handleGetSettings(userId: string): Promise<Response> {
  await migrateSettingsFromFile(userId);

  const userSettings = await Setting.listForUser(userId);
  const settingsMap = new Map(userSettings.map(s => [s.key, s.value]));
  const result: SettingWithValue[] = [];

  // Non-secret settings: read from DB then env
  for (const def of registry) {
    if (def.isSecret) continue;
    result.push({
      package_name: def.packageName,
      env_var: def.envVar,
      group: def.group,
      description: def.description,
      enum: def.enum ?? null,
      value: settingsMap.get(def.envVar) ?? process.env[def.envVar] ?? null,
      is_secret: false,
    });
  }

  // Secrets: query DB then env; "****" if configured, null otherwise
  for (const def of registry) {
    if (!def.isSecret) continue;
    const secret = await Secret.find(userId, def.envVar);
    const hasEnvVar = Boolean(process.env[def.envVar]);
    result.push({
      package_name: def.packageName,
      env_var: def.envVar,
      group: def.group,
      description: def.description,
      enum: null,
      value: (secret || hasEnvVar) ? "****" : null,
      is_secret: true,
    });
  }

  return jsonResponse({ settings: result });
}


async function handleUpdateSettings(request: Request, userId: string): Promise<Response> {

  let body: { settings?: Record<string, unknown>; secrets?: Record<string, unknown> };
  try {
    body = (await request.json()) as { settings?: Record<string, unknown>; secrets?: Record<string, unknown> };
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  // Save non-secret settings to DB
  if (body.settings) {
    for (const [key, value] of Object.entries(body.settings)) {
      await Setting.upsert({ userId, key, value: String(value ?? "") });
    }
  }

  // Save secrets to DB (skip "****" placeholder values)
  let secretsChanged = false;
  if (body.secrets) {
    for (const [key, value] of Object.entries(body.secrets)) {
      if (typeof value === "string" && value.split("").every((c) => c === "*")) continue;
      await Secret.upsert({ userId, key, value: String(value ?? ""), description: `Secret for ${key}` });
      clearSecretCache(userId, key);
      secretsChanged = true;
    }
  }

  if (secretsChanged) {
    clearProviderCache();
  }

  return jsonResponse({ message: "Settings updated successfully" });
}

// ── Main export ────────────────────────────────────────────────────

export async function handleSettingsRequest(
  request: Request,
  pathname: string,
  options: SettingsHandlerOptions
): Promise<Response | null> {
  // Only handle /api/settings (not /api/settings/secrets which is handled by http-api.ts)
  if (pathname !== "/api/settings") return null;

  const userId = request.headers.get(options.userIdHeader ?? "x-user-id") ?? request.headers.get("x-user-id") ?? "1";

  if (request.method === "GET") {
    return handleGetSettings(userId);
  }
  if (request.method === "PUT") {
    return handleUpdateSettings(request, userId);
  }
  return errorResponse(405, "Method not allowed");
}
