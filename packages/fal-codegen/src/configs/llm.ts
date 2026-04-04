import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    "openrouter/router": {
      className: "OpenRouter",
      docstring:
        "OpenRouter provides unified access to any LLM (Large Language Model) through a single API.",
      tags: ["llm", "chat", "openrouter", "multimodel", "language-model"],
      useCases: [
        "Run any LLM through unified interface",
        "Switch between models seamlessly",
        "Access multiple LLM providers",
        "Flexible model selection",
        "Unified LLM API access"
      ],
      basicFields: ["prompt", "model"]
    },
    "openrouter/router/openai/v1/chat/completions": {
      className: "OpenRouterChatCompletions",
      docstring:
        "OpenRouter Chat Completions provides OpenAI-compatible interface for any LLM.",
      tags: [
        "llm",
        "chat",
        "openai-compatible",
        "openrouter",
        "chat-completions"
      ],
      useCases: [
        "OpenAI-compatible LLM access",
        "Drop-in replacement for OpenAI API",
        "Multi-model chat completions",
        "Standardized chat interface",
        "Universal LLM chat API"
      ],
      basicFields: ["messages", "model"]
    },
    "fal-ai/qwen-3-guard": {
      className: "Qwen3Guard",
      docstring:
        "Qwen 3 Guard provides content safety and moderation using Qwen's LLM.",
      tags: ["llm", "safety", "moderation", "qwen", "guard"],
      useCases: [
        "Content safety checking",
        "Moderation of text content",
        "Safety filtering for outputs",
        "Content policy enforcement",
        "Text safety analysis"
      ],
      basicFields: ["text"]
    },
    "openrouter/router/openai/v1/responses": {
      className: "OpenrouterRouterOpenaiV1Responses",
      docstring:
        "The OpenRouter Responses API with fal, powered by OpenRouter, provides unified access to a wide range of large language models - including GPT, Claude, Gemini, and many others through a single API interface.",
      tags: ["llm", "language-model", "text-generation", "ai"],
      useCases: [
        "Text generation and completion",
        "Conversational AI",
        "Content summarization",
        "Code generation",
        "Creative writing assistance"
      ]
    },
    "openrouter/router/openai/v1/embeddings": {
      className: "OpenrouterRouterOpenaiV1Embeddings",
      docstring:
        "The OpenRouter Embeddings API with fal, powered by OpenRouter, provides unified access to a wide range of large language models - including GPT, Claude, Gemini, and many others through a single API interface.",
      tags: ["llm", "language-model", "text-generation", "ai"],
      useCases: [
        "Text generation and completion",
        "Conversational AI",
        "Content summarization",
        "Code generation",
        "Creative writing assistance"
      ]
    },
    "fal-ai/video-prompt-generator": {
      className: "VideoPromptGenerator",
      docstring:
        "Generate video prompts using a variety of techniques including camera direction, style, pacing, special effects and more.",
      tags: ["llm", "language-model", "text-generation", "ai"],
      useCases: [
        "Text generation and completion",
        "Conversational AI",
        "Content summarization",
        "Code generation",
        "Creative writing assistance"
      ]
    }
  }
};
