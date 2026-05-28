export {
  CostType,
  CostCalculator,
  calculateChatCost,
  calculateEmbeddingCost,
  calculateSpeechCost,
  calculateWhisperCost,
  calculateImageCost
} from "./cost-calculator.js";
export type { PricingTier, UsageInfo } from "./cost-calculator.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { GeminiProvider } from "./gemini-provider.js";
import { LlamaProvider } from "./llama-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { OllamaProvider } from "./ollama-provider.js";
import { GroqProvider } from "./groq-provider.js";
import { MinimaxProvider } from "./minimax-provider.js";
import { MistralProvider } from "./mistral-provider.js";
import { MoonshotProvider } from "./moonshot-provider.js";
import { OpenRouterProvider } from "./openrouter-provider.js";
import { TogetherProvider } from "./together-provider.js";
import { CerebrasProvider } from "./cerebras-provider.js";
import { DeepSeekProvider } from "./deepseek-provider.js";
import { XAIProvider } from "./xai-provider.js";
import { LMStudioProvider } from "./lmstudio-provider.js";
import { VLLMProvider } from "./vllm-provider.js";
import { HuggingFaceProvider } from "./huggingface-provider.js";
import { PythonProvider } from "./python-provider.js";
import { ReplicateProvider } from "./replicate-provider.js";
import { FalProvider } from "./fal-provider.js";
import { KieProvider } from "./kie-provider.js";
import { TopazProvider } from "./topaz-provider.js";
import { AtlasCloudProvider } from "./atlascloud-provider.js";
import { AkiProvider } from "./aki-provider.js";
import { MeshyProvider } from "./meshy-provider.js";
import { RodinProvider } from "./rodin-provider.js";
import { CohereProvider } from "./cohere-provider.js";
import { VoyageProvider } from "./voyage-provider.js";
import { JinaProvider } from "./jina-provider.js";
import { FakeProvider } from "./fake-provider.js";
export { BaseProvider, providerCapabilities } from "./base-provider.js";
export type { ProviderCapability } from "./base-provider.js";
export { AnthropicProvider };
export { GeminiProvider };
export { LlamaProvider };
export { OpenAIProvider };
export { OllamaProvider };
export { GroqProvider };
export { MinimaxProvider };
export { MistralProvider };
export { MoonshotProvider };
export { OpenRouterProvider };
export { TogetherProvider };
export { CerebrasProvider };
export { DeepSeekProvider };
export { XAIProvider };
export { LMStudioProvider };
export { VLLMProvider };
export { HuggingFaceProvider };
export { PythonProvider };
export { ReplicateProvider };
export { FalProvider };
export { KieProvider };
export { TopazProvider };
export { AtlasCloudProvider };
export { AkiProvider };
export { MeshyProvider };
export { RodinProvider };
export { CohereProvider };
export { VoyageProvider };
export { JinaProvider };
export {
  FakeProvider,
  createFakeToolCall,
  createSimpleFakeProvider,
  createStreamingFakeProvider,
  createToolCallingFakeProvider
} from "./fake-provider.js";
export type { FakeProviderOptions } from "./fake-provider.js";
export {
  ScriptedProvider,
  planScript,
  multiTaskPlanScript,
  stepScript,
  textScript,
  toolCallScript,
  autoScript,
  toolThenFinishScript
} from "./scripted-provider.js";
export type {
  ScriptFn,
  ScriptItem,
  TaskPlanSpec,
  MultiTaskPlanSpec
} from "./scripted-provider.js";
export {
  registerProvider,
  getRegisteredProvider,
  getProvider,
  getProviderSecretKey,
  isProviderConfigured,
  listRegisteredProviderIds
} from "./provider-registry.js";
export type { GetSecret } from "./provider-registry.js";
import { registerProvider as registerBuiltinProvider } from "./provider-registry.js";
export type {
  ProviderId,
  LanguageModel,
  ImageModel,
  VideoModel,
  TTSModel,
  ASRModel,
  EmbeddingModel,
  ToolCall,
  ProviderTool,
  Message,
  MessageContent,
  MessageTextContent,
  MessageImageContent,
  MessageAudioContent,
  Model3D,
  TextTo3DParams,
  ImageTo3DParams,
  TextToImageParams,
  ImageToImageParams,
  TextToVideoParams,
  ImageToVideoParams,
  ProviderStreamItem,
  StreamingAudioChunk,
  EncodedAudioResult,
  AudioChunk,
  ASRResult
} from "./types.js";

// Register hosted providers with the secret key NAME each one needs but no
// pre-resolved value. Pre-baking `process.env[KEY]` here at module-load time
// would shadow the encrypted DB: a stale or expired env value would short-
// circuit the registry's resolution branch (which only re-resolves when the
// kwarg is empty/null). Empty-string declarations force every getProvider()
// call to ask the supplied `getSecret` (DB-then-env) at instantiation time.
registerBuiltinProvider("openai", OpenAIProvider, { OPENAI_API_KEY: "" });
registerBuiltinProvider("anthropic", AnthropicProvider, { ANTHROPIC_API_KEY: "" });
registerBuiltinProvider("gemini", GeminiProvider, { GEMINI_API_KEY: "" });
registerBuiltinProvider("groq", GroqProvider, { GROQ_API_KEY: "" });
registerBuiltinProvider("mistral", MistralProvider, { MISTRAL_API_KEY: "" });
registerBuiltinProvider("moonshot", MoonshotProvider, { KIMI_API_KEY: "" });
registerBuiltinProvider("minimax", MinimaxProvider, { MINIMAX_API_KEY: "" });
registerBuiltinProvider("replicate", ReplicateProvider, { REPLICATE_API_TOKEN: "" });
registerBuiltinProvider("fal_ai", FalProvider, { FAL_API_KEY: "" });
registerBuiltinProvider("kie", KieProvider, { KIE_API_KEY: "" });
registerBuiltinProvider("topaz", TopazProvider, { TOPAZ_API_KEY: "" });
registerBuiltinProvider("atlascloud", AtlasCloudProvider, { ATLASCLOUD_API_KEY: "" });
registerBuiltinProvider("aki", AkiProvider, { AKI_API_KEY: "" });
registerBuiltinProvider("meshy", MeshyProvider, { MESHY_API_KEY: "" });
registerBuiltinProvider("rodin", RodinProvider, { RODIN_API_KEY: "" });
registerBuiltinProvider("openrouter", OpenRouterProvider, { OPENROUTER_API_KEY: "" });
registerBuiltinProvider("together", TogetherProvider, { TOGETHER_API_KEY: "" });
registerBuiltinProvider("cerebras", CerebrasProvider, { CEREBRAS_API_KEY: "" });
registerBuiltinProvider("cohere", CohereProvider, { COHERE_API_KEY: "" });
registerBuiltinProvider("voyage", VoyageProvider, { VOYAGE_API_KEY: "" });
registerBuiltinProvider("jina", JinaProvider, { JINA_API_KEY: "" });
registerBuiltinProvider("deepseek", DeepSeekProvider, { DEEPSEEK_API_KEY: "" });
registerBuiltinProvider("xai", XAIProvider, { XAI_API_KEY: "" });

// Local-only providers — require local servers/CLIs, skip in production
if (process.env["NODETOOL_ENV"] !== "production") {
  // Ollama defaults to the standard local daemon port so the provider is
  // usable out-of-the-box. The URL is registered as an optionalKwarg so it
  // re-resolves from the secret store / env on every getProvider() call —
  // users changing OLLAMA_API_URL via Settings → API Keys see the change
  // take effect without a restart. Empty kwargs keep isProviderConfigured()
  // returning true for the zero-config localhost case.
  registerBuiltinProvider(
    "ollama",
    OllamaProvider,
    {},
    { OLLAMA_API_URL: "http://127.0.0.1:11434" }
  );
  // LM Studio: URL (and optional API key) are user-configurable via the
  // Settings → API Keys panel. Register them as optionalKwargs so the
  // registry resolves them from the secret store / env on every
  // getProvider() call — that way changing the port in settings takes
  // effect immediately without forcing isProviderConfigured() to return
  // false when the user hasn't set anything (LM Studio runs at the default
  // localhost:1234 out of the box).
  registerBuiltinProvider(
    "lmstudio",
    LMStudioProvider,
    {},
    {
      LMSTUDIO_API_URL: "http://127.0.0.1:1234",
      LMSTUDIO_API_KEY: "lm-studio"
    }
  );
  // llama.cpp OpenAI-compatible server — URL only from Settings / env (no
  // default host). Empty kwarg keeps the provider "unavailable" until configured.
  registerBuiltinProvider("llama_cpp", LlamaProvider, {
    LLAMA_CPP_URL: ""
  });
  // vLLM — base URL from Settings / env; optional API key defaults like LM Studio.
  registerBuiltinProvider(
    "vllm",
    VLLMProvider,
    { VLLM_BASE_URL: "" },
    { VLLM_API_KEY: "sk-no-key-required" }
  );
}

// Fake provider for end-to-end testing without external API keys.
// Opt-in via env flag — never enabled in production builds.
if (
  process.env["NODETOOL_ENV"] !== "production" &&
  process.env["NODETOOL_ENABLE_FAKE_PROVIDER"] === "1"
) {
  registerBuiltinProvider("fake", FakeProvider, {});
}
