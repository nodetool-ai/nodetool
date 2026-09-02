/**
 * The setting catalog — every configuration knob NodeTool ships, with its
 * group, description, allowed values, and whether it holds a credential.
 *
 * It lives in `config` rather than in the server because two packages need the
 * same table and neither can import the other: the tRPC settings router reads
 * it to answer `settings.list`, and the `settings` capability module reads it
 * to decide what sandboxed code may see and change. A capability that had to
 * guess whether `OPENAI_API_KEY` is a secret would guess from the name, which
 * is how a credential ends up in a model's context.
 *
 * Definitions only. Reading a value needs the database (`Setting`), which is
 * above this package — `getSetting()` in the server's `settings-registry.ts`
 * does that half.
 */

export interface SettingCatalogEntry {
  packageName: string;
  envVar: string;
  group: string;
  description: string;
  enum?: string[];
  isSecret?: boolean;
}

const catalog: SettingCatalogEntry[] = [];

/** Register a definition. First registration of an env var wins. */
export function registerSettingDefinition(def: SettingCatalogEntry): void {
  if (!catalog.some((s) => s.envVar === def.envVar)) {
    catalog.push(def);
  }
}

/** Every registered definition, in registration order. */
export function settingCatalog(): SettingCatalogEntry[] {
  return catalog;
}

/** One definition by env var, or undefined when nothing registered it. */
export function settingDefinition(
  envVar: string
): SettingCatalogEntry | undefined {
  return catalog.find((s) => s.envVar === envVar);
}

// ── Default settings (ported from nodetool/config/settings.py) ────

function s(
  envVar: string,
  group: string,
  description: string,
  enumValues?: string[]
): void {
  registerSettingDefinition({
    packageName: "nodetool",
    envVar,
    group,
    description,
    enum: enumValues
  });
}
function sec(envVar: string, group: string, description: string): void {
  registerSettingDefinition({
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

// Execution
s(
  "MAX_CONCURRENT_JOBS",
  "Execution",
  "Maximum number of workflow runs a single client can execute at once (default: 4). Additional runs are queued and start automatically as running ones finish, preventing provider/API overload."
);
s(
  "MAX_CONCURRENT_RUNS_PER_WORKFLOW",
  "Execution",
  "Maximum number of concurrent runs of the same workflow before additional runs queue (default: 4). Only applies to runs that opt into concurrency (e.g. timeline/sketch generation); canvas runs always stay sequential per workflow. Also bounded by MAX_CONCURRENT_JOBS."
);
// Agent budgets — the bounds one agent run shares across every loop it starts
// (a chat turn, its sub-agents, an AgentNode it spawns). See A1 in
// docs/plans/agent-system-improvements.md.
s(
  "NODETOOL_AGENT_TURN_COST_CAP_USD",
  "Agents",
  "Ceiling on provider spend for one agent run, in US dollars (default: 5.00). The whole run shares it: sub-agents, background subtasks, and agent nodes reserve against the same cap rather than opening their own. A turn whose worst case would cross it is refused before the call, and the run stops with a message naming the cap. Set it to 0 for no cap at all, which is what a local-only install wants — clearing the value restores the default instead, because an empty setting is indistinguishable from an unset one."
);
s(
  "NODETOOL_AGENT_TURN_DEADLINE_MS",
  "Agents",
  "Wall-clock bound on one agent run, in milliseconds (default: 1800000, i.e. 30 minutes). Checked before every model turn and every tool call, so a run that stalls on a slow provider ends instead of hanging."
);
s(
  "NODETOOL_AGENT_MAX_CONCURRENCY",
  "Agents",
  "Maximum provider conversations an agent run may have open at once (default: 8). Shared by the whole run, so a fan-out of sub-agents inside a fan-out of steps cannot multiply into hundreds of simultaneous calls."
);
s(
  "NODETOOL_AGENT_MAX_TURNS",
  "Agents",
  "Maximum model turns an agent run may make in total (default: 200), counted across every loop it starts. This is the bound that still holds for a local model with no price, where the dollar cap cannot apply."
);
s(
  "NODETOOL_AGENT_UNPRICED_TOKEN_CEILING",
  "Agents",
  "Prompt-token ceiling for a turn on a model the price catalog does not cover (default: 400000). An unpriced model has no worst-case cost to reserve, so admitting it freely would make the dollar cap advisory; this bounds it by size instead. Such turns are counted as unpriced rather than as free spend."
);
// Chat compaction — replacing the earlier turns of a long thread with one
// summary the provider is sent instead. See A4 in
// docs/plans/agent-system-improvements.md.
s(
  "NODETOOL_CHAT_COMPACTION_TOKENS",
  "Agents",
  "Estimated prompt size, in tokens, at which a chat turn summarizes the earlier part of its thread before calling the model (default: 120000). The estimate tokenizes the messages and their tool calls alone — it misses the tool definitions the same turn sends and reads an image as the length of its base64 — so leave room under the model's context window rather than setting it close. A provider that holds the conversation itself (a resumed session, the Claude Agent SDK) is not measured this way; it compacts when it reports that the transcript no longer fits."
);
s(
  "NODETOOL_CHAT_COMPACTION_KEEP_TURNS",
  "Agents",
  "How many of the most recent user turns a compaction leaves verbatim (default: 4). Everything before them becomes the summary. The cut always lands on a user message, so a tool call is never separated from its result."
);
s(
  "NODETOOL_COMPACTION_MODEL",
  "Agents",
  "Model that writes the compaction summary, as `provider/model` or a bare model id on the turn's own provider. Unset, the turn summarizes with the model it is already running. A summarizer that fails leaves the thread uncompacted and the turn runs against the full history."
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
  "NODE_LLAMA_CPP_MODELS_DIR",
  "NodeLlamaCpp",
  "Directory containing local GGUF model files for in-process llama.cpp inference. Defaults to the platform llama.cpp cache directory."
);
s(
  "NODE_LLAMA_CPP_GPU_BACKEND",
  "NodeLlamaCpp",
  "GPU backend for in-process llama.cpp inference. 'auto' lets node-llama-cpp detect the best backend.",
  ["auto", "metal", "cuda", "vulkan", "cpu"]
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

// Search
s(
  "SERP_PROVIDER",
  "Search",
  "Select which search provider to use for web search operations.",
  ["serpapi", "dataforseo", "brave", "apify", "openai", "gemini"]
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
  "OpenAI API key for accessing GPT models, GPT-Image, and other OpenAI services. Get yours at https://platform.openai.com/api-keys"
);
sec(
  "OPENROUTER_API_KEY",
  "OpenRouter",
  "OpenRouter API key for accessing multiple AI models through a unified API. Get yours at https://openrouter.ai/settings/keys"
);
sec(
  "ANTHROPIC_API_KEY",
  "Anthropic",
  "Anthropic API key for accessing Claude models and other Anthropic services. Get yours at https://console.anthropic.com/settings/keys"
);
sec(
  "DASHSCOPE_API_KEY",
  "Alibaba Cloud",
  "Alibaba Cloud Model Studio (DashScope) API key for accessing Qwen models through the OpenAI-compatible endpoint. Get yours at https://modelstudio.console.alibabacloud.com/"
);
s(
  "DASHSCOPE_BASE_URL",
  "Alibaba Cloud",
  "Base URL for Alibaba Cloud Model Studio's OpenAI-compatible endpoint. Model Studio keys are region-scoped; set this to your region's endpoint (default: https://dashscope-intl.aliyuncs.com/compatible-mode/v1, the international/Singapore region)"
);
sec(
  "CEREBRAS_API_KEY",
  "Cerebras",
  "Cerebras API key for accessing fast LLM inference on Cerebras hardware. Get yours at https://cloud.cerebras.ai/"
);
sec(
  "GMI_API_KEY",
  "GMI Cloud",
  "GMI Cloud API key for accessing open-weight LLMs through GMI's OpenAI-compatible inference API. Get yours at https://console.gmicloud.ai/"
);
sec(
  "META_API_KEY",
  "Meta AI",
  "Meta AI API key for accessing the Muse Spark models through Meta's OpenAI-compatible API. Get yours at https://dev.meta.ai/"
);
sec(
  "TOGETHER_API_KEY",
  "Together",
  "Together AI API key for accessing open-source LLMs through Together's inference API. Get yours at https://api.together.ai/settings/api-keys"
);
sec(
  "DEEPSEEK_API_KEY",
  "DeepSeek",
  "DeepSeek API key for accessing DeepSeek-V3 chat and DeepSeek-R1 reasoning models. Get yours at https://platform.deepseek.com/api-keys"
);
sec(
  "XAI_API_KEY",
  "xAI",
  "xAI API key for accessing Grok models via xAI's OpenAI-compatible API. Get yours at https://console.x.ai/"
);
sec(
  "GROQ_API_KEY",
  "Groq",
  "Groq API key for accessing ultra-fast LLM inference on Groq's LPU hardware. Get yours at https://console.groq.com/keys"
);
sec(
  "ZHIPU_API_KEY",
  "ZAI",
  "Z.AI API key for accessing GLM models through Z.AI's OpenAI-compatible API. Get yours at https://open.bigmodel.cn/usercenter/apikeys"
);
sec(
  "MISTRAL_API_KEY",
  "Mistral",
  "Mistral API key for accessing Mistral AI models. Get yours at https://console.mistral.ai/api-keys"
);
sec(
  "KIMI_API_KEY",
  "Kimi",
  "Kimi (Moonshot) API key for accessing Kimi models via the OpenAI-compatible endpoint. Get yours at https://platform.moonshot.ai/console/api-keys"
);
sec(
  "MINIMAX_API_KEY",
  "MiniMax",
  "MiniMax API key for accessing MiniMax AI models. Get yours at https://platform.minimax.chat/user-center/basic-information/interface-key"
);
sec(
  "AKI_API_KEY",
  "AKI",
  "AKI.IO API key for accessing the AKI AI Model Hub. Get yours at https://aki.io/"
);
sec(
  "GEMINI_API_KEY",
  "Gemini",
  "Gemini API key for accessing Google's Gemini AI models. Get yours at https://aistudio.google.com/app/apikey"
);
sec(
  "HF_TOKEN",
  "HF",
  "Token for HuggingFace Inference Providers. Get yours at https://huggingface.co/settings/tokens"
);
sec(
  "LLAMA_API_KEY",
  "LlamaCpp",
  "API key for authenticating with llama-server"
);
sec(
  "REPLICATE_API_TOKEN",
  "Replicate",
  "Replicate API Token for running models on Replicate's cloud infrastructure. Get yours at https://replicate.com/account/api-tokens"
);
sec(
  "GOOGLE_MAIL_USER",
  "Google",
  "Google mail user for email integration features"
);
sec(
  "GOOGLE_APP_PASSWORD",
  "Google",
  "Google app password for secure authentication with Google services. Manage at https://myaccount.google.com/apppasswords"
);
sec(
  "ELEVENLABS_API_KEY",
  "ElevenLabs",
  "ElevenLabs API key for high-quality text-to-speech services. Get yours at https://elevenlabs.io/app/settings/api-keys"
);
sec(
  "FAL_API_KEY",
  "FAL",
  "FAL API key for accessing FAL.ai's serverless AI infrastructure. Get yours at https://fal.ai/dashboard/keys"
);
sec(
  "SERPAPI_API_KEY",
  "Search",
  "SerpAPI API key. Powers web search and the SerpAPI engine capability — Google and its verticals (news, images, scholar, maps, jobs, flights, trends), Bing, DuckDuckGo, YouTube, Amazon, eBay, Walmart, Yelp, and the rest of its catalog. Get yours at https://serpapi.com/manage-api-key"
);
sec(
  "APIFY_API_TOKEN",
  "Search",
  "Apify API token. Powers the Apify actor capability (crawling, browser automation, structured extraction, maps, social, media, screenshots, transcripts) and Apify-backed web search. Get yours at https://console.apify.com/account/integrations"
);
// The name this install shipped first. Still read as a fallback everywhere the
// token is resolved, so an existing configuration keeps working; new setups
// should use APIFY_API_TOKEN, which is what Apify's own docs call it.
sec(
  "APIFY_API_KEY",
  "Search",
  "Deprecated alias for APIFY_API_TOKEN. Existing installs keep working; set APIFY_API_TOKEN for new ones."
);
sec(
  "BRAVE_API_KEY",
  "Search",
  "Brave Search API key for web search. Get yours at https://api-dashboard.search.brave.com/"
);
sec("BROWSER_URL", "Browser", "Browser URL for accessing a browser instance");
sec(
  "RUNPOD_API_KEY",
  "RunPod",
  "RunPod API key for accessing serverless endpoints. Get yours at https://www.runpod.io/console/user/settings"
);
sec(
  "NODE_SUPABASE_KEY",
  "NodeSupabase",
  "Supabase service key for user-provided nodes"
);
sec(
  "DATA_FOR_SEO_LOGIN",
  "Search",
  "DataForSEO login for web search. Sign up at https://app.dataforseo.com/register"
);
sec(
  "DATA_FOR_SEO_PASSWORD",
  "Search",
  "DataForSEO password for web search. Sign up at https://app.dataforseo.com/register"
);
sec(
  "TRACELOOP_API_KEY",
  "Observability",
  "Traceloop API key for OpenLLMetry trace export. Get yours at https://app.traceloop.com/"
);
sec("KIE_API_KEY", "KIE", "KIE API key for accessing kie.ai. Get yours at https://kie.ai/");
s(
  "KIE_TIMEOUT_SECONDS",
  "KIE",
  "Global timeout in seconds for Kie.ai API calls (0 = use default per-model timeout)"
);
sec(
  "TOPAZ_API_KEY",
  "Topaz",
  "Topaz Labs API key for image and video enhancement. Get yours at https://developer.topazlabs.com/"
);
sec(
  "REVE_API_KEY",
  "Reve",
  "Reve API key for image creation, editing, and remix. Get yours at https://api.reve.com/"
);
sec(
  "ATLASCLOUD_API_KEY",
  "AtlasCloud",
  "AtlasCloud.ai API key for chat models (DeepSeek, Qwen, GPT, Claude, Gemini) plus hosted image (GPT Image, Nano Banana, Seedream) and video (Seedance, Veo, Kling, Wan) generation. Get yours at https://www.atlascloud.ai/"
);
sec("MESHY_API_KEY", "Meshy", "Meshy AI API key for 3D model generation. Get yours at https://app.meshy.ai/settings/api-keys");
sec("RODIN_API_KEY", "Rodin", "Rodin AI API key for 3D model generation. Get yours at https://hyperhuman.deemos.com/");
sec(
  "GITHUB_CLIENT_ID",
  "GitHub",
  "GitHub OAuth App Client ID for OAuth PKCE authentication flow. Manage at https://github.com/settings/developers"
);
sec(
  "GITHUB_CLIENT_SECRET",
  "GitHub",
  "GitHub OAuth App Client Secret for OAuth PKCE authentication flow. Manage at https://github.com/settings/developers"
);
sec(
  "SERVER_AUTH_TOKEN",
  "Deployment",
  "Bearer auth token for securing NodeTool server endpoints in deployment. If unset, bearer auth is disabled."
);
