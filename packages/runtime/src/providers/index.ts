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
import { BaseProvider } from "./base-provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { GeminiProvider } from "./gemini-provider.js";
import { LlamaProvider } from "./llama-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { OllamaProvider } from "./ollama-provider.js";
import { GroqProvider } from "./groq-provider.js";
import { MistralProvider } from "./mistral-provider.js";
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
export { BaseProvider };
export { AnthropicProvider };
export { ClaudeAgentProvider };
export type { OnToolCall } from "./claude-agent-provider.js";
export { GeminiProvider };
export { LlamaProvider };
export { OpenAIProvider };
export { OllamaProvider };
export { GroqProvider };
export { MistralProvider };
export { OpenRouterProvider };
export { TogetherProvider };
export { CerebrasProvider };
export { LMStudioProvider };
export { VLLMProvider };
export { HuggingFaceProvider };
export { PythonProvider };
export { ReplicateProvider };
export { FalProvider };
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
  TextToImageParams,
  ImageToImageParams,
  TextToVideoParams,
  ImageToVideoParams,
  ProviderStreamItem,
  StreamingAudioChunk,
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
registerBuiltinProvider("replicate", ReplicateProvider, {
  REPLICATE_API_TOKEN: process.env["REPLICATE_API_TOKEN"]
});
registerBuiltinProvider("fal_ai", FalProvider, {
  FAL_API_KEY: process.env["FAL_API_KEY"]
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

// Local-only providers — require local servers/CLIs, skip in production
if (process.env["NODETOOL_ENV"] !== "production") {
  registerBuiltinProvider("ollama", OllamaProvider, {
    OLLAMA_API_URL: process.env["OLLAMA_API_URL"]
  });
  registerBuiltinProvider("lmstudio", LMStudioProvider, {});
  registerBuiltinProvider("claude_agent", ClaudeAgentProvider, {});
}
