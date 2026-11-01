import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * Credential requirements of the remote providers the runtime registers
 * (`packages/runtime/src/providers/index.ts`). The lean CLI does not load the
 * runtime, so it reads credential state from this table instead.
 */
interface ProviderCredential {
  readonly id: string;
  readonly name: string;
  /** Every listed name must resolve. */
  readonly credentials: readonly string[];
}

export const KEYED_PROVIDERS: readonly ProviderCredential[] = [
  { id: "openai", name: "OpenAI", credentials: ["OPENAI_API_KEY"] },
  { id: "codex", name: "OpenAI Codex (ChatGPT login)", credentials: ["CODEX_ACCESS_TOKEN"] },
  { id: "anthropic", name: "Anthropic", credentials: ["ANTHROPIC_API_KEY"] },
  { id: "gemini", name: "Google Gemini", credentials: ["GEMINI_API_KEY"] },
  { id: "groq", name: "Groq", credentials: ["GROQ_API_KEY"] },
  { id: "mistral", name: "Mistral", credentials: ["MISTRAL_API_KEY"] },
  { id: "moonshot", name: "Moonshot", credentials: ["KIMI_API_KEY"] },
  { id: "minimax", name: "MiniMax", credentials: ["MINIMAX_API_KEY"] },
  { id: "replicate", name: "Replicate", credentials: ["REPLICATE_API_TOKEN"] },
  { id: "fal_ai", name: "fal", credentials: ["FAL_API_KEY"] },
  { id: "kie", name: "Kie", credentials: ["KIE_API_KEY"] },
  { id: "comfy_cloud", name: "Comfy Cloud", credentials: ["COMFY_API_KEY"] },
  { id: "elevenlabs", name: "ElevenLabs", credentials: ["ELEVENLABS_API_KEY"] },
  { id: "topaz", name: "Topaz Labs", credentials: ["TOPAZ_API_KEY"] },
  { id: "reve", name: "Reve", credentials: ["REVE_API_KEY"] },
  { id: "atlascloud", name: "AtlasCloud", credentials: ["ATLASCLOUD_API_KEY"] },
  { id: "higgsfield", name: "Higgsfield", credentials: ["HIGGSFIELD_API_KEY_ID", "HIGGSFIELD_API_KEY_SECRET"] },
  { id: "useapi", name: "useapi.net", credentials: ["USEAPI_API_TOKEN"] },
  { id: "vgenv", name: "VGenV", credentials: ["VGENV_API_KEY"] },
  { id: "toapis", name: "ToAPIs", credentials: ["TOAPIS_API_KEY"] },
  { id: "aki", name: "AKI", credentials: ["AKI_API_KEY"] },
  { id: "meshy", name: "Meshy", credentials: ["MESHY_API_KEY"] },
  { id: "rodin", name: "Rodin", credentials: ["RODIN_API_KEY"] },
  { id: "openrouter", name: "OpenRouter", credentials: ["OPENROUTER_API_KEY"] },
  { id: "requesty", name: "Requesty", credentials: ["REQUESTY_API_KEY"] },
  { id: "opper", name: "Opper", credentials: ["OPPER_API_KEY"] },
  { id: "api_route", name: "API Route", credentials: ["API_ROUTE_API_KEY"] },
  { id: "together", name: "Together", credentials: ["TOGETHER_API_KEY"] },
  { id: "alibaba", name: "Alibaba", credentials: ["DASHSCOPE_API_KEY"] },
  { id: "cerebras", name: "Cerebras", credentials: ["CEREBRAS_API_KEY"] },
  { id: "evolink", name: "EvoLink", credentials: ["EVOLINK_API_KEY"] },
  { id: "gmi", name: "GMI Cloud", credentials: ["GMI_API_KEY"] },
  { id: "meta", name: "Meta", credentials: ["META_API_KEY"] },
  { id: "cohere", name: "Cohere", credentials: ["COHERE_API_KEY"] },
  { id: "voyage", name: "Voyage AI", credentials: ["VOYAGE_API_KEY"] },
  { id: "jina", name: "Jina AI", credentials: ["JINA_API_KEY"] },
  { id: "deepseek", name: "DeepSeek", credentials: ["DEEPSEEK_API_KEY"] },
  { id: "xai", name: "xAI", credentials: ["XAI_API_KEY"] },
  { id: "azure_openai", name: "Azure OpenAI", credentials: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"] },
  { id: "bedrock", name: "Amazon Bedrock", credentials: ["BEDROCK_ACCESS_KEY_ID", "BEDROCK_SECRET_ACCESS_KEY"] },
  { id: "huggingface", name: "Hugging Face", credentials: ["HF_TOKEN"] },
  { id: "gemini_vertex", name: "Gemini (Google Cloud)", credentials: ["GOOGLE_CLOUD_PROJECT"] },
  { id: "llama_cpp", name: "llama.cpp server", credentials: ["LLAMA_CPP_URL"] },
  { id: "vllm", name: "vLLM", credentials: ["VLLM_BASE_URL"] }
];

/** Names a vendor's own SDK reads, accepted like the runtime registry does. */
const CREDENTIAL_ALIASES: Readonly<Record<string, readonly string[]>> = { FAL_API_KEY: ["FAL_KEY"] };

/** Providers that an installed pack registers, keyed by pack id. */
const PACK_PROVIDERS: readonly { readonly id: string; readonly name: string; readonly pack: string }[] = [
  { id: "transformers_js", name: "Transformers.js (local)", pack: "transformers-js" },
  { id: "whisper_cpp", name: "whisper.cpp (local)", pack: "whisper-cpp" }
];

export type CredentialSource = "env" | "stored" | "claude CLI" | "pack";

export interface ProviderState {
  readonly id: string;
  readonly name: string;
  /** Credential names (never values), or the executable or pack that enables the provider. */
  readonly requires: string;
  readonly usable: boolean;
  readonly source: CredentialSource | null;
}

export interface ProviderStateInput {
  readonly env: NodeJS.ProcessEnv;
  /** Secret names in the local encrypted store. */
  readonly storedKeys: ReadonlySet<string>;
  /** Installed pack ids. */
  readonly installedPacks: ReadonlySet<string>;
}

function isExecutable(file: string): boolean {
  try {
    if (!statSync(file).isFile()) { return false; }
    if (process.platform !== "win32") { accessSync(file, constants.X_OK); }
    return true;
  } catch {
    return false;
  }
}

/** The `claude` executable: CLAUDE_CLI_PATH, then PATH, then the native installer location. */
export function findClaudeCli(env: NodeJS.ProcessEnv): string | null {
  const pinned = env.CLAUDE_CLI_PATH?.trim();
  if (pinned) { return isExecutable(pinned) ? pinned : null; }
  const name = process.platform === "win32" ? "claude.exe" : "claude";
  const directories = (env.PATH ?? "").split(delimiter).filter(Boolean);
  if (env.HOME) { directories.push(join(env.HOME, ".local", "bin"), join(env.HOME, ".claude", "local")); }
  for (const directory of directories) {
    const candidate = join(directory, name);
    if (isExecutable(candidate)) { return candidate; }
  }
  return null;
}

function credentialSource(name: string, input: ProviderStateInput): CredentialSource | null {
  if (input.storedKeys.has(name)) { return "stored"; }
  return [name, ...CREDENTIAL_ALIASES[name] ?? []].some(candidate => input.env[candidate]) ? "env" : null;
}

/** Credential state of every known provider, without reading any secret value. */
export function providerStates(input: ProviderStateInput): ProviderState[] {
  const keyed = KEYED_PROVIDERS.map(provider => {
    const sources = provider.credentials.map(name => credentialSource(name, input));
    const usable = sources.every(source => source !== null);
    return { id: provider.id, name: provider.name, requires: provider.credentials.join(" + "), usable, source: usable ? sources.includes("stored") ? "stored" as const : "env" as const : null };
  });
  const claude = findClaudeCli(input.env) !== null;
  const local: ProviderState[] = [
    { id: "claude_agent_sdk", name: "Claude (claude CLI login)", requires: "claude CLI", usable: claude, source: claude ? "claude CLI" : null },
    ...PACK_PROVIDERS.map(provider => {
      const installed = input.installedPacks.has(provider.pack);
      return { id: provider.id, name: provider.name, requires: `pack ${provider.pack}`, usable: installed, source: installed ? "pack" as const : null };
    })
  ];
  return [...keyed, ...local];
}
