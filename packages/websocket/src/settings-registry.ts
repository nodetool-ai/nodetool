/**
 * Settings registry + defaults — shared between the tRPC settings router,
 * http-api.ts (for /api/settings/secrets handlers), and unified-websocket-runner.ts
 * (for getSetting()).
 */

import { Setting } from "@nodetool/models";

// ── Types ──────────────────────────────────────────────────────────

export interface SettingWithValue {
  package_name: string;
  env_var: string;
  group: string;
  description: string;
  enum: string[] | null;
  value: unknown;
  is_secret: boolean;
}

export interface SettingDefinition {
  packageName: string;
  envVar: string;
  group: string;
  description: string;
  enum?: string[];
  isSecret?: boolean;
}

// ── Registry ───────────────────────────────────────────────────────

const registry: SettingDefinition[] = [];

/** Register a setting definition. Called by packages at startup. */
export function registerSetting(def: SettingDefinition): void {
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

function s(
  envVar: string,
  group: string,
  description: string,
  enumValues?: string[]
): void {
  registerSetting({
    packageName: "nodetool",
    envVar,
    group,
    description,
    enum: enumValues
  });
}
function sec(envVar: string, group: string, description: string): void {
  registerSetting({
    packageName: "nodetool",
    envVar,
    group,
    description,
    isSecret: true
  });
}

// Folders / paths
s(
  "FONT_PATH",
  "Folders",
  "Location of font folder used by image processing nodes like RenderText. If not specified, the system will use default fonts."
);
s(
  "VECTORSTORE_DB_PATH",
  "Folders",
  "Location of the sqlite-vec vector database file. Used to store and retrieve embeddings for semantic search and RAG applications."
);
s(
  "USERS_FILE",
  "Folders",
  "Path to users.yaml file for multi-user bearer token authentication. Defaults to ~/.config/nodetool/users.yaml for local deployments."
);
s(
  "TRANSFORMERS_JS_CACHE_DIR",
  "TransformersJs",
  "Cache directory for Transformers.js (@huggingface/transformers) model downloads. Defaults to <data-dir>/transformers-js-cache. This is separate from the Python HuggingFace Hub cache because the on-disk layout differs."
);

// Autosave
s(
  "AUTOSAVE_ENABLED",
  "Autosave",
  "Enable automatic saving of workflow versions (default: true)",
  ["true", "false"]
);
s(
  "AUTOSAVE_INTERVAL_MINUTES",
  "Autosave",
  "Interval in minutes between automatic workflow autosaves (default: 5, range: 1-60)"
);
s(
  "AUTOSAVE_MIN_INTERVAL_SECONDS",
  "Autosave",
  "Minimum interval in seconds between autosaves to prevent duplicates (default: 30)"
);
s(
  "AUTOSAVE_MAX_VERSIONS_PER_WORKFLOW",
  "Autosave",
  "Maximum number of autosave versions to keep per workflow (default: 20)"
);
s(
  "AUTOSAVE_KEEP_DAYS",
  "Autosave",
  "Number of days to keep autosave versions before cleanup (default: 7)"
);

// ComfyUI
s(
  "COMFYUI_ADDR",
  "ComfyUI",
  "ComfyUI server address for API/WebSocket access (e.g., 127.0.0.1:8188)."
);

// Provider endpoints
s(
  "VLLM_BASE_URL",
  "vLLM",
  "Base URL for the vLLM OpenAI-compatible server (e.g., http://localhost:7777)"
);
s(
  "OLLAMA_CONTEXT_LENGTH",
  "Ollama",
  "Context window size (in tokens) for Ollama models. If not set, the provider will query the model for its default context length."
);
s(
  "LLAMA_CPP_URL",
  "LlamaCpp",
  "Base URL for the llama.cpp server (e.g., http://127.0.0.1:8080)."
);
s(
  "LLAMA_CPP_CONTEXT_LENGTH",
  "LlamaCpp",
  "Context window size (in tokens) for llama.cpp models. Defaults to 128000."
);
s(
  "LMSTUDIO_API_URL",
  "LMStudio",
  "Base URL for the LM Studio OpenAI-compatible server (e.g., http://localhost:1234)"
);

// NodeSupabase
s(
  "NODE_SUPABASE_URL",
  "NodeSupabase",
  "Supabase project URL used by user-provided nodes (separate from core SUPABASE_URL)"
);
s(
  "NODE_SUPABASE_SCHEMA",
  "NodeSupabase",
  "Optional schema for user/node Supabase tables (defaults to public when unset)"
);
s(
  "NODE_SUPABASE_TABLE_PREFIX",
  "NodeSupabase",
  "Optional prefix applied to user/node Supabase tables to avoid clashes with core tables"
);

// Observability
s(
  "TRACELOOP_ENABLED",
  "Observability",
  "Enable Traceloop OpenLLMetry tracing",
  ["true", "false"]
);
s(
  "TRACELOOP_APP_NAME",
  "Observability",
  "Override the OpenLLMetry application name (defaults to service name)"
);
s(
  "TRACELOOP_BASE_URL",
  "Observability",
  "Override the Traceloop OTLP base URL"
);
s(
  "TRACELOOP_DISABLE_BATCH",
  "Observability",
  "Disable Traceloop batch span processing for local development",
  ["true", "false"]
);

// SERP
s(
  "SERP_PROVIDER",
  "SERP",
  "Select which SERP provider to use for search operations. Options: 'serpapi', 'apify', 'dataforseo'.",
  ["serpapi", "apify", "dataforseo"]
);
s(
  "ZAI_USE_CODING_PLAN",
  "ZAI",
  "Use Z.AI coding plan endpoint instead of normal endpoint",
  ["true", "false"]
);

// Secrets (value shown as "****" when env var is set, null otherwise)
sec(
  "OPENAI_API_KEY",
  "OpenAI",
  "OpenAI API key for accessing GPT models, DALL-E, and other OpenAI services"
);
sec(
  "OPENROUTER_API_KEY",
  "OpenRouter",
  "OpenRouter API key for accessing multiple AI models through a unified API"
);
sec(
  "ANTHROPIC_API_KEY",
  "Anthropic",
  "Anthropic API key for accessing Claude models and other Anthropic services"
);
sec(
  "CEREBRAS_API_KEY",
  "Cerebras",
  "Cerebras API key for accessing fast LLM inference on Cerebras hardware"
);
sec(
  "TOGETHER_API_KEY",
  "Together",
  "Together AI API key for accessing open-source LLMs through Together's inference API"
);
sec(
  "DEEPSEEK_API_KEY",
  "DeepSeek",
  "DeepSeek API key for accessing DeepSeek-V3 chat and DeepSeek-R1 reasoning models"
);
sec(
  "XAI_API_KEY",
  "xAI",
  "xAI API key for accessing Grok models via xAI's OpenAI-compatible API"
);
sec(
  "GROQ_API_KEY",
  "Groq",
  "Groq API key for accessing ultra-fast LLM inference on Groq's LPU hardware"
);
sec(
  "ZHIPU_API_KEY",
  "ZAI",
  "Z.AI API key for accessing GLM models through Z.AI's OpenAI-compatible API"
);
sec(
  "MISTRAL_API_KEY",
  "Mistral",
  "Mistral API key for accessing Mistral AI models"
);
sec(
  "KIMI_API_KEY",
  "Kimi",
  "Kimi (Moonshot) API key for accessing Kimi models via the Claude-compatible endpoint"
);
sec(
  "MINIMAX_API_KEY",
  "MiniMax",
  "MiniMax API key for accessing MiniMax AI models"
);
sec(
  "AKI_API_KEY",
  "AKI",
  "AKI.IO API key for accessing the AKI AI Model Hub"
);
sec(
  "GEMINI_API_KEY",
  "Gemini",
  "Gemini API key for accessing Google's Gemini AI models"
);
sec("HF_TOKEN", "HF", "Token for HuggingFace Inference Providers");
sec(
  "LLAMA_API_KEY",
  "LlamaCpp",
  "API key for authenticating with llama-server"
);
sec(
  "REPLICATE_API_TOKEN",
  "Replicate",
  "Replicate API Token for running models on Replicate's cloud infrastructure"
);
sec("AIME_API_KEY", "Aime", "Aime API key for accessing Aime AI services");
sec(
  "GOOGLE_MAIL_USER",
  "Google",
  "Google mail user for email integration features"
);
sec(
  "GOOGLE_APP_PASSWORD",
  "Google",
  "Google app password for secure authentication with Google services"
);
sec(
  "ELEVENLABS_API_KEY",
  "ElevenLabs",
  "ElevenLabs API key for high-quality text-to-speech services"
);
sec(
  "FAL_API_KEY",
  "FAL",
  "FAL API key for accessing FAL.ai's serverless AI infrastructure"
);
sec(
  "SERPAPI_API_KEY",
  "SerpAPI",
  "API key for accessing SerpAPI scraping infrastructure"
);
sec(
  "APIFY_API_KEY",
  "Apify",
  "API key for accessing Apify's web scraping and automation platform"
);
sec("BROWSER_URL", "Browser", "Browser URL for accessing a browser instance");
sec(
  "RUNPOD_API_KEY",
  "RunPod",
  "RunPod API key for accessing serverless endpoints"
);
sec(
  "NODE_SUPABASE_KEY",
  "NodeSupabase",
  "Supabase service key for user-provided nodes"
);
sec(
  "DATA_FOR_SEO_LOGIN",
  "DataForSEO",
  "DataForSEO login for accessing DataForSEO's API"
);
sec(
  "DATA_FOR_SEO_PASSWORD",
  "DataForSEO",
  "DataForSEO password for accessing DataForSEO's API"
);
sec(
  "TRACELOOP_API_KEY",
  "Observability",
  "Traceloop API key for OpenLLMetry trace export"
);
sec("KIE_API_KEY", "KIE", "KIE API key for accessing kie.ai");
s(
  "KIE_TIMEOUT_SECONDS",
  "KIE",
  "Global timeout in seconds for Kie.ai API calls (0 = use default per-model timeout)"
);
sec("MESHY_API_KEY", "Meshy", "Meshy AI API key for 3D model generation");
sec("RODIN_API_KEY", "Rodin", "Rodin AI API key for 3D model generation");
sec(
  "GITHUB_CLIENT_ID",
  "GitHub",
  "GitHub OAuth App Client ID for OAuth PKCE authentication flow"
);
sec(
  "GITHUB_CLIENT_SECRET",
  "GitHub",
  "GitHub OAuth App Client Secret for OAuth PKCE authentication flow"
);
sec(
  "SERVER_AUTH_TOKEN",
  "Deployment",
  "Bearer auth token for securing NodeTool server endpoints in deployment. If unset, bearer auth is disabled."
);
