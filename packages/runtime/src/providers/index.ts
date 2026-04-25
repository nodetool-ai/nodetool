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
import { LMStudioProvider } from "./lmstudio-provider.js";
import { VLLMProvider } from "./vllm-provider.js";
import { HuggingFaceProvider } from "./huggingface-provider.js";
import { PythonProvider } from "./python-provider.js";
import { ReplicateProvider } from "./replicate-provider.js";
import { ClaudeAgentProvider } from "./claude-agent-provider.js";
import { FalProvider } from "./fal-provider.js";
import { KieProvider } from "./kie-provider.js";
import { AkiProvider } from "./aki-provider.js";
import { MeshyProvider } from "./meshy-provider.js";
import { RodinProvider } from "./rodin-provider.js";
import { CohereProvider } from "./cohere-provider.js";
import { VoyageProvider } from "./voyage-provider.js";
import { JinaProvider } from "./jina-provider.js";
export { BaseProvider, providerCapabilities } from "./base-provider.js";
export type { ProviderCapability } from "./base-provider.js";
export { AnthropicProvider };
export { ClaudeAgentProvider };
export {
  ClaudeAgentError,
  classifyClaudeAgentError
} from "./claude-agent-provider.js";
export type {
  OnToolCall,
  ClaudeAgentErrorKind
} from "./claude-agent-provider.js";
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
export { LMStudioProvider };
export { VLLMProvider };
export { HuggingFaceProvider };
export { PythonProvider };
export { ReplicateProvider };
export { FalProvider };
export { KieProvider };
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
  clearProviderCache,
  listRegisteredProviderIds,
  setSecretResolver
} from "./provider-registry.js";
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

registerBuiltinProvider("openai", OpenAIProvider, {
  OPENAI_API_KEY: process.env["OPENAI_API_KEY"]
});
registerBuiltinProvider("anthropic", AnthropicProvider, {
  ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"]
});
registerBuiltinProvider("gemini", GeminiProvider, {
  GEMINI_API_KEY: process.env["GEMINI_API_KEY"]
});
registerBuiltinProvider("groq", GroqProvider, {
  GROQ_API_KEY: process.env["GROQ_API_KEY"]
});
registerBuiltinProvider("mistral", MistralProvider, {
  MISTRAL_API_KEY: process.env["MISTRAL_API_KEY"]
});
registerBuiltinProvider("moonshot", MoonshotProvider, {
  KIMI_API_KEY: process.env["KIMI_API_KEY"]
});
registerBuiltinProvider("minimax", MinimaxProvider, {
  MINIMAX_API_KEY: process.env["MINIMAX_API_KEY"]
});
registerBuiltinProvider("replicate", ReplicateProvider, {
  REPLICATE_API_TOKEN: process.env["REPLICATE_API_TOKEN"]
});
registerBuiltinProvider("fal_ai", FalProvider, {
  FAL_API_KEY: process.env["FAL_API_KEY"]
});
registerBuiltinProvider("kie", KieProvider, {
  KIE_API_KEY: process.env["KIE_API_KEY"]
});
registerBuiltinProvider("aki", AkiProvider, {
  AKI_API_KEY: process.env["AKI_API_KEY"]
});
registerBuiltinProvider("meshy", MeshyProvider, {
  MESHY_API_KEY: process.env["MESHY_API_KEY"]
});
registerBuiltinProvider("rodin", RodinProvider, {
  RODIN_API_KEY: process.env["RODIN_API_KEY"]
});
registerBuiltinProvider("openrouter", OpenRouterProvider, {
  OPENROUTER_API_KEY: process.env["OPENROUTER_API_KEY"]
});
registerBuiltinProvider("together", TogetherProvider, {
  TOGETHER_API_KEY: process.env["TOGETHER_API_KEY"]
});
registerBuiltinProvider("cerebras", CerebrasProvider, {
  CEREBRAS_API_KEY: process.env["CEREBRAS_API_KEY"]
});
registerBuiltinProvider("cohere", CohereProvider, {
  COHERE_API_KEY: process.env["COHERE_API_KEY"]
});
registerBuiltinProvider("voyage", VoyageProvider, {
  VOYAGE_API_KEY: process.env["VOYAGE_API_KEY"]
});
registerBuiltinProvider("jina", JinaProvider, {
  JINA_API_KEY: process.env["JINA_API_KEY"]
});

// Local-only providers — require local servers/CLIs, skip in production
if (process.env["NODETOOL_ENV"] !== "production") {
  // Ollama defaults to the standard local daemon port so the provider is
  // usable out-of-the-box. Users running a remote instance override via env.
  registerBuiltinProvider("ollama", OllamaProvider, {
    OLLAMA_API_URL:
      process.env["OLLAMA_API_URL"] ?? "http://127.0.0.1:11434"
  });
  registerBuiltinProvider("lmstudio", LMStudioProvider, {});
  registerBuiltinProvider("claude_agent", ClaudeAgentProvider, {});
}
