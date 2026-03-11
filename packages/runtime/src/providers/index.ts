export {
  CostType,
  CostCalculator,
  calculateChatCost,
  calculateEmbeddingCost,
  calculateSpeechCost,
  calculateWhisperCost,
  calculateImageCost,
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
export { BaseProvider };
export { AnthropicProvider };
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
export {
  FakeProvider,
  createFakeToolCall,
  createSimpleFakeProvider,
  createStreamingFakeProvider,
  createToolCallingFakeProvider,
} from "./fake-provider.js";
export type { FakeProviderOptions } from "./fake-provider.js";
export {
  ScriptedProvider,
  planScript,
  stepScript,
  textScript,
  toolCallScript,
  autoScript,
  toolThenFinishScript,
} from "./scripted-provider.js";
export type { ScriptFn, ScriptItem, TaskPlanSpec } from "./scripted-provider.js";
export {
  registerProvider,
  getRegisteredProvider,
  getProvider,
  clearProviderCache,
  listRegisteredProviderIds,
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
} from "./types.js";

registerBuiltinProvider("openai", OpenAIProvider, {
  OPENAI_API_KEY: process.env["OPENAI_API_KEY"],
});
registerBuiltinProvider("anthropic", AnthropicProvider, {
  ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"],
});
registerBuiltinProvider("gemini", GeminiProvider, {
  GEMINI_API_KEY: process.env["GEMINI_API_KEY"],
});
registerBuiltinProvider("ollama", OllamaProvider, {
  OLLAMA_API_URL: process.env["OLLAMA_API_URL"],
});
registerBuiltinProvider("groq", GroqProvider, {
  GROQ_API_KEY: process.env["GROQ_API_KEY"],
});
registerBuiltinProvider("mistral", MistralProvider, {
  MISTRAL_API_KEY: process.env["MISTRAL_API_KEY"],
});
