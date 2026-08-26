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
      ]
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
      ]
    },
    "openrouter/router/openai/v1/responses": {
      className: "RouterOpenaiV1Responses",
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
      className: "RouterOpenaiV1Embeddings",
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
    },
    "nvidia/nemotron-3-nano-omni": {
      className: "Nemotron3NanoOmni",
      docstring: "Nvidia Nemotron 3 Nano Omni multimodal LLM.",
      tags: ["llm", "language-model", "text-generation", "nvidia", "nemotron"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },
    "fal-ai/bytedance/seed/v2/mini": {
      className: "BytedanceSeedV2Mini",
      docstring:
        "Seed 2.0 Mini is a high-performance multimodal model optimized for low latency and high concurrency. It supports text, image, and video input with 256K context and configurable thinking/reasoning modes.",
      tags: ["llm", "text-generation", "chat", "bytedance", "seed", "mini"],
      useCases: [
        "Automated content generation",
        "Creative workflows",
        "Batch processing",
        "Professional applications",
        "Rapid prototyping"
      ]
    },

    "openrouter/router/enterprise": {
      className: "OpenRouterEnterprise",
      docstring:
        "Runs any OpenRouter LLM through fal on the enterprise routing tier.",
      tags: ["llm", "text", "chat", "openrouter", "enterprise"],
      useCases: [
        "Route prompts to any OpenRouter model",
        "Compare models behind one endpoint",
        "Run enterprise-tier inference",
        "Fall back across providers",
        "Centralize LLM access through fal"
      ]
    }
  }
};
