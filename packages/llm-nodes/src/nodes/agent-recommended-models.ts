// Recommended-model catalogs for the agent nodes. Pure data lifted out of
// the node classes; each node references its constant via
// `static readonly recommendedModels = ...`.

export const GEMMA_3_4B_IT_GGUF_TAGS = [
  "gguf",
  "image-text-to-text",
  "arxiv:1905.07830",
  "arxiv:1905.10044",
  "arxiv:1911.11641",
  "arxiv:1904.09728",
  "arxiv:1705.03551",
  "arxiv:1911.01547",
  "arxiv:1907.10641",
  "arxiv:1903.00161",
  "arxiv:2009.03300",
  "arxiv:2304.06364",
  "arxiv:2103.03874",
  "arxiv:2110.14168",
  "arxiv:2311.12022",
  "arxiv:2108.07732",
  "arxiv:2107.03374",
  "arxiv:2210.03057",
  "arxiv:2106.03193",
  "arxiv:1910.11856",
  "arxiv:2502.12404",
  "arxiv:2502.21228",
  "arxiv:2404.16816",
  "arxiv:2104.12756",
  "arxiv:2311.16502",
  "arxiv:2203.10244",
  "arxiv:2404.12390",
  "arxiv:1810.12440",
  "arxiv:1908.02660",
  "arxiv:2312.11805",
  "base_model:google/gemma-3-4b-it",
  "base_model:quantized:google/gemma-3-4b-it",
  "license:gemma",
  "endpoints_compatible",
  "region:us",
  "conversational"
] as const;

export const GEMMA_3_4B_IT_GGUF_BASE = {
  id: "ggml-org/gemma-3-4b-it-GGUF:gemma-3-4b-it-Q4_K_M.gguf",
  type: "llama_cpp_model",
  name: "Gemma 3 4B IT (GGUF)",
  repo_id: "ggml-org/gemma-3-4b-it-GGUF",
  path: "gemma-3-4b-it-Q4_K_M.gguf",
  size_on_disk: 3113851289,
  pipeline_tag: "image-text-to-text",
  tags: GEMMA_3_4B_IT_GGUF_TAGS,
  has_model_index: false,
  downloads: 25779,
  likes: 48
} as const;

export const SUMMARIZER_RECOMMENDED_MODELS = [
    {
      id: "phi3.5:latest",
      type: "llama_model",
      name: "Phi3.5",
      repo_id: "phi3.5:latest",
      description:
        "Lightweight 3.8B model tuned for crisp instruction following and compact summaries on modest hardware.",
      size_on_disk: 2362232012
    },
    {
      id: "mistral-small:latest",
      type: "llama_model",
      name: "Mistral Small",
      repo_id: "mistral-small:latest",
      description:
        "Efficient mixture-of-experts model that delivers reliable abstractive summaries with low latency.",
      size_on_disk: 7730941132
    },
    {
      id: "llama3.2:3b",
      type: "llama_model",
      name: "Llama 3.2 - 3B",
      repo_id: "llama3.2:3b",
      description:
        "Compact Llama variant that balances coverage and brevity for everyday summarization workloads.",
      size_on_disk: 2040109465
    },
    {
      id: "gemma3:4b",
      type: "llama_model",
      name: "Gemma3 - 4B",
      repo_id: "gemma3:4b",
      description:
        "Google's 4B multimodal model performs strong factual summaries while staying resource friendly.",
      size_on_disk: 2791728742
    },
    {
      id: "granite3.1-moe:3b",
      type: "llama_model",
      name: "Granite 3.1 MOE - 3B",
      repo_id: "granite3.1-moe:3b",
      description:
        "IBM Granite MoE delivers focused meeting notes and bullet summaries with minimal VRAM needs.",
      size_on_disk: 1717986918
    },
    {
      id: "qwen3:4b",
      type: "llama_model",
      name: "Qwen3 - 4B",
      repo_id: "qwen3:4b",
      description:
        "Qwen3 4B offers multilingual summarization with tight, well-structured outputs.",
      size_on_disk: 2684354560
    },
    {
      ...GEMMA_3_4B_IT_GGUF_BASE,
      description: "Efficient Gemma 3 for summarization via llama.cpp."
    }
];

export const ENHANCE_PROMPT_RECOMMENDED_MODELS = [
    {
      id: "llama3.2:3b",
      type: "llama_model",
      name: "Llama 3.2 - 3B",
      repo_id: "llama3.2:3b",
      description:
        "Compact Llama variant that rewrites prompts with strong instruction following on modest hardware.",
      size_on_disk: 2040109465
    },
    {
      id: "qwen3:4b",
      type: "llama_model",
      name: "Qwen3 - 4B",
      repo_id: "qwen3:4b",
      description:
        "Qwen3 4B produces tight, well-structured prompt rewrites across languages.",
      size_on_disk: 2684354560
    },
    {
      id: "mistral-small:latest",
      type: "llama_model",
      name: "Mistral Small",
      repo_id: "mistral-small:latest",
      description:
        "Efficient model that expands terse prompts into detailed, usable instructions with low latency.",
      size_on_disk: 7730941132
    },
    {
      ...GEMMA_3_4B_IT_GGUF_BASE,
      description: "Efficient Gemma 3 for prompt enhancement via llama.cpp."
    }
];

export const EXTRACTOR_RECOMMENDED_MODELS = [
    {
      id: "phi3.5:latest",
      type: "llama_model",
      name: "Phi3.5",
      repo_id: "phi3.5:latest",
      description:
        "Small Phi variant excels at JSON-style outputs and faithful field extraction on laptops.",
      size_on_disk: 2362232012
    },
    {
      id: "mistral-small:latest",
      type: "llama_model",
      name: "Mistral Small",
      repo_id: "mistral-small:latest",
      description:
        "MoE architecture keeps structured extraction consistent while staying resource efficient.",
      size_on_disk: 7730941132
    },
    {
      id: "granite3.1-moe:3b",
      type: "llama_model",
      name: "Granite 3.1 MOE - 3B",
      repo_id: "granite3.1-moe:3b",
      description:
        "Granite MoE models are tuned for business document parsing and schema-following tasks.",
      size_on_disk: 1717986918
    },
    {
      id: "gemma3:4b",
      type: "llama_model",
      name: "Gemma3 - 4B",
      repo_id: "gemma3:4b",
      description:
        "Gemma 3 4B handles multilingual extraction and adheres to required JSON schemas.",
      size_on_disk: 2791728742
    },
    {
      id: "qwen2.5-coder:3b",
      type: "llama_model",
      name: "Qwen2.5-Coder - 3B",
      repo_id: "qwen2.5-coder:3b",
      description:
        "Code-focused Qwen variant generates precise structured outputs and respects schema rules.",
      size_on_disk: 1932735283
    },
    {
      id: "deepseek-r1:7b",
      type: "llama_model",
      name: "Deepseek R1 - 7B",
      repo_id: "deepseek-r1:7b",
      description:
        "Reasoning-oriented DeepSeek shines when extraction needs cross-field validation.",
      size_on_disk: 4617089843
    },
    {
      ...GEMMA_3_4B_IT_GGUF_BASE,
      description: "Efficient Gemma 3 for extraction via llama.cpp."
    }
];

export const CLASSIFIER_RECOMMENDED_MODELS = [
    {
      id: "phi3.5:latest",
      type: "llama_model",
      name: "Phi3.5",
      repo_id: "phi3.5:latest",
      description:
        "Reliable small model for intent and sentiment classification when VRAM is tight.",
      size_on_disk: 2362232012
    },
    {
      id: "mistral-small:latest",
      type: "llama_model",
      name: "Mistral Small",
      repo_id: "mistral-small:latest",
      description:
        "Fast MoE model that keeps category predictions consistent across batches.",
      size_on_disk: 7730941132
    },
    {
      id: "granite3.1-moe:1b",
      type: "llama_model",
      name: "Granite 3.1 MOE - 1B",
      repo_id: "granite3.1-moe:1b",
      description:
        "IBM Granite 1B excels at classification and routing tasks on CPUs and edge devices.",
      size_on_disk: 751619276
    },
    {
      id: "qwen3:1.7b",
      type: "llama_model",
      name: "Qwen3 - 1.7B",
      repo_id: "qwen3:1.7b",
      description:
        "Compact Qwen variant provides multilingual label understanding with low latency.",
      size_on_disk: 1073741824
    },
    {
      id: "gemma3:1b",
      type: "llama_model",
      name: "Gemma3 - 1B",
      repo_id: "gemma3:1b",
      description:
        "Gemma 3 1B offers deterministic small-footprint classification for mobile scenarios.",
      size_on_disk: 805306368
    },
    {
      id: "deepseek-r1:1.5b",
      type: "llama_model",
      name: "Deepseek R1 - 1.5B",
      repo_id: "deepseek-r1:1.5b",
      description:
        "Reasoning-focused DeepSeek variant is great for multi-step label decisions.",
      size_on_disk: 912680550
    },
    {
      ...GEMMA_3_4B_IT_GGUF_BASE,
      description: "Efficient Gemma 3 for classification via llama.cpp."
    }
];

export const AGENT_RECOMMENDED_MODELS = [
    {
      id: "gpt-oss:20b",
      type: "llama_model",
      name: "GPT - OSS",
      repo_id: "gpt-oss:20b",
      description:
        "OpenAI's open-weight model excels at multi-tool routing and reasoning.",
      size_on_disk: 15032385536
    },
    {
      id: "qwen3-vl:4b",
      type: "llama_model",
      name: "Qwen3 VL - 4B",
      repo_id: "qwen3-vl:4b",
      description:
        "The most powerful vision-language model in the Qwen model family to date.",
      size_on_disk: 3543348019
    },
    {
      id: "qwen3-vl:8b",
      type: "llama_model",
      name: "Qwen3 VL - 8B",
      repo_id: "qwen3-vl:8b",
      description:
        "The most powerful vision-language model in the Qwen model family to date.",
      size_on_disk: 6549825126
    },
    {
      id: "gemma3:1b",
      type: "llama_model",
      name: "Gemma3 - 1B",
      repo_id: "gemma3:1b",
      description:
        "Gemma3 1B is a small model that can process text and images.",
      size_on_disk: 875099586
    },
    {
      id: "gemma3:4b",
      type: "llama_model",
      name: "Gemma3 - 4B",
      repo_id: "gemma3:4b",
      description:
        "Gemma3 4B is a small model that can process text and images.",
      size_on_disk: 3543348019
    },
    {
      id: "llama3.2:3b",
      type: "llama_model",
      name: "Llama 3.2 - 3B",
      repo_id: "llama3.2:3b",
      description:
        "Compact Llama 3.2 variant keeps latency low while following tool schemas accurately.",
      size_on_disk: 2040109465
    },
    {
      id: "qwen3:4b",
      type: "llama_model",
      name: "Qwen3 - 4B",
      repo_id: "qwen3:4b",
      description:
        "Qwen3 4B ships strong function-calling primitives and dependable multi-turn tool use.",
      size_on_disk: 2684354560
    },
    {
      id: "qwen3:8b",
      type: "llama_model",
      name: "Qwen3 - 8B",
      repo_id: "qwen3:8b",
      description:
        "Qwen3 8B ships strong function-calling primitives and dependable multi-turn tool use.",
      size_on_disk: 5583457484
    },
    {
      id: "deepseek-r1:8b",
      type: "llama_model",
      name: "Deepseek R1 - 8B",
      repo_id: "deepseek-r1:8b",
      description:
        "DeepSeek R1 8B balances reasoning with precise function calls for iterative agents.",
      size_on_disk: 5583457484
    },
    {
      id: "ggml-org/gpt-oss-20b-GGUF:gpt-oss-20b-mxfp4.gguf",
      type: "llama_cpp_model",
      name: "GPT-OSS 20B (GGUF)",
      repo_id: "ggml-org/gpt-oss-20b-GGUF",
      path: "gpt-oss-20b-mxfp4.gguf",
      description:
        "OpenAI's open-weight model in efficient MXFP4 format for llama.cpp.",
      size_on_disk: 9191230013,
      tags: [
        "gguf",
        "base_model:openai/gpt-oss-20b",
        "base_model:quantized:openai/gpt-oss-20b",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 156909,
      likes: 135
    },
    {
      ...GEMMA_3_4B_IT_GGUF_BASE,
      description:
        "Google's Gemma 3 4B in Q4_K_M quantization for efficient inference."
    },
    {
      id: "ggml-org/gemma-3-12b-it-GGUF:gemma-3-12b-it-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Gemma 3 12B IT (GGUF)",
      repo_id: "ggml-org/gemma-3-12b-it-GGUF",
      path: "gemma-3-12b-it-Q4_K_M.gguf",
      description:
        "Google's Gemma 3 12B in Q4_K_M quantization with strong reasoning.",
      size_on_disk: 7838315315,
      pipeline_tag: "image-text-to-text",
      tags: [
        "gguf",
        "image-text-to-text",
        "arxiv:1905.07830",
        "arxiv:1905.10044",
        "arxiv:1911.11641",
        "arxiv:1904.09728",
        "arxiv:1705.03551",
        "arxiv:1911.01547",
        "arxiv:1907.10641",
        "arxiv:1903.00161",
        "arxiv:2009.03300",
        "arxiv:2304.06364",
        "arxiv:2103.03874",
        "arxiv:2110.14168",
        "arxiv:2311.12022",
        "arxiv:2108.07732",
        "arxiv:2107.03374",
        "arxiv:2210.03057",
        "arxiv:2106.03193",
        "arxiv:1910.11856",
        "arxiv:2502.12404",
        "arxiv:2502.21228",
        "arxiv:2404.16816",
        "arxiv:2104.12756",
        "arxiv:2311.16502",
        "arxiv:2203.10244",
        "arxiv:2404.12390",
        "arxiv:1810.12440",
        "arxiv:1908.02660",
        "arxiv:2312.11805",
        "base_model:google/gemma-3-12b-it",
        "base_model:quantized:google/gemma-3-12b-it",
        "license:gemma",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 214667,
      likes: 30
    },
    {
      id: "ggml-org/Kimi-VL-A3B-Thinking-2506-GGUF:Kimi-VL-A3B-Thinking-2506-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Kimi VL A3B Thinking (GGUF)",
      repo_id: "ggml-org/Kimi-VL-A3B-Thinking-2506-GGUF",
      path: "Kimi-VL-A3B-Thinking-2506-Q4_K_M.gguf",
      description:
        "Moonshot AI's vision-language model with enhanced reasoning capabilities.",
      size_on_disk: 2362232012,
      tags: [
        "gguf",
        "base_model:moonshotai/Kimi-VL-A3B-Thinking-2506",
        "base_model:quantized:moonshotai/Kimi-VL-A3B-Thinking-2506",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 3039,
      likes: 29
    },
    {
      id: "ggml-org/Qwen3-Coder-30B-A3B-Instruct-Q8_0-GGUF:qwen3-coder-30b-a3b-instruct-q8_0.gguf",
      type: "llama_cpp_model",
      name: "Qwen3 Coder 30B A3B (GGUF)",
      repo_id: "ggml-org/Qwen3-Coder-30B-A3B-Instruct-Q8_0-GGUF",
      path: "qwen3-coder-30b-a3b-instruct-q8_0.gguf",
      description:
        "MoE coding model with 3B active params, excellent for code generation.",
      size_on_disk: 3865470566,
      pipeline_tag: "text-generation",
      tags: [
        "transformers",
        "gguf",
        "llama-cpp",
        "gguf-my-repo",
        "text-generation",
        "base_model:Qwen/Qwen3-Coder-30B-A3B-Instruct",
        "base_model:quantized:Qwen/Qwen3-Coder-30B-A3B-Instruct",
        "license:apache-2.0",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 80721,
      likes: 7
    },
    {
      id: "ggml-org/Qwen3-0.6B-GGUF:Qwen3-0.6B-Q4_0.gguf",
      type: "llama_cpp_model",
      name: "Qwen3 0.6B (GGUF)",
      repo_id: "ggml-org/Qwen3-0.6B-GGUF",
      path: "Qwen3-0.6B-Q4_0.gguf",
      description:
        "Ultra-lightweight Qwen3 for edge devices and fast inference.",
      size_on_disk: 429496729,
      tags: [
        "gguf",
        "base_model:Qwen/Qwen3-0.6B",
        "base_model:quantized:Qwen/Qwen3-0.6B",
        "license:apache-2.0",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 44304,
      likes: 13
    },
    {
      id: "ggml-org/gemma-3-270m-GGUF:gemma-3-270m-Q8_0.gguf",
      type: "llama_cpp_model",
      name: "Gemma 3 270M (GGUF)",
      repo_id: "ggml-org/gemma-3-270m-GGUF",
      path: "gemma-3-270m-Q8_0.gguf",
      description: "Tiny Gemma 3 for ultra-fast inference on CPU.",
      size_on_disk: 375809638,
      tags: [
        "gguf",
        "base_model:google/gemma-3-270m",
        "base_model:quantized:google/gemma-3-270m",
        "endpoints_compatible",
        "region:us"
      ],
      has_model_index: false,
      downloads: 595,
      likes: 19
    },
    {
      id: "ggml-org/gemma-3-27b-it-GGUF:gemma-3-27b-it-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Gemma 3 27B IT (GGUF)",
      repo_id: "ggml-org/gemma-3-27b-it-GGUF",
      path: "gemma-3-27b-it-Q4_K_M.gguf",
      description:
        "Google's largest Gemma 3 with strong reasoning and tool use.",
      size_on_disk: 16965120819,
      pipeline_tag: "image-text-to-text",
      tags: [
        "gguf",
        "image-text-to-text",
        "arxiv:1905.07830",
        "arxiv:1905.10044",
        "arxiv:1911.11641",
        "arxiv:1904.09728",
        "arxiv:1705.03551",
        "arxiv:1911.01547",
        "arxiv:1907.10641",
        "arxiv:1903.00161",
        "arxiv:2009.03300",
        "arxiv:2304.06364",
        "arxiv:2103.03874",
        "arxiv:2110.14168",
        "arxiv:2311.12022",
        "arxiv:2108.07732",
        "arxiv:2107.03374",
        "arxiv:2210.03057",
        "arxiv:2106.03193",
        "arxiv:1910.11856",
        "arxiv:2502.12404",
        "arxiv:2502.21228",
        "arxiv:2404.16816",
        "arxiv:2104.12756",
        "arxiv:2311.16502",
        "arxiv:2203.10244",
        "arxiv:2404.12390",
        "arxiv:1810.12440",
        "arxiv:1908.02660",
        "arxiv:2312.11805",
        "base_model:google/gemma-3-27b-it",
        "base_model:quantized:google/gemma-3-27b-it",
        "license:gemma",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 2604,
      likes: 23
    },
    {
      id: "Qwen/Qwen3-30B-A3B-GGUF:Qwen3-30B-A3B-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Qwen3 30B A3B (GGUF)",
      repo_id: "Qwen/Qwen3-30B-A3B-GGUF",
      path: "Qwen3-30B-A3B-Q4_K_M.gguf",
      description: "Qwen3 30B MoE model (3B active) in Q4_K_M quantization.",
      size_on_disk: 19327352832,
      pipeline_tag: "text-generation",
      tags: [
        "gguf",
        "text-generation",
        "arxiv:2309.00071",
        "arxiv:2505.09388",
        "base_model:Qwen/Qwen3-30B-A3B",
        "base_model:quantized:Qwen/Qwen3-30B-A3B",
        "license:apache-2.0",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 17644,
      likes: 65
    },
    {
      id: "Qwen/Qwen3-32B-GGUF:Qwen3-32B-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Qwen3 32B (GGUF)",
      repo_id: "Qwen/Qwen3-32B-GGUF",
      path: "Qwen3-32B-Q4_K_M.gguf",
      description: "Qwen3 32B dense model in Q4_K_M quantization.",
      size_on_disk: 20401094656,
      pipeline_tag: "text-generation",
      tags: [
        "gguf",
        "text-generation",
        "arxiv:2309.00071",
        "base_model:Qwen/Qwen3-32B",
        "base_model:quantized:Qwen/Qwen3-32B",
        "license:apache-2.0",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 27381,
      likes: 64
    },
    {
      id: "Qwen/Qwen3-14B-GGUF:Qwen3-14B-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Qwen3 14B (GGUF)",
      repo_id: "Qwen/Qwen3-14B-GGUF",
      path: "Qwen3-14B-Q4_K_M.gguf",
      description: "Qwen3 14B dense model in Q4_K_M quantization.",
      size_on_disk: 9663676416,
      pipeline_tag: "text-generation",
      tags: [
        "gguf",
        "text-generation",
        "arxiv:2309.00071",
        "base_model:Qwen/Qwen3-14B",
        "base_model:quantized:Qwen/Qwen3-14B",
        "license:apache-2.0",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 61212,
      likes: 73
    },
    {
      id: "Qwen/Qwen3-8B-GGUF:Qwen3-8B-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Qwen3 8B (GGUF)",
      repo_id: "Qwen/Qwen3-8B-GGUF",
      path: "Qwen3-8B-Q4_K_M.gguf",
      description: "Qwen3 8B dense model in Q4_K_M quantization.",
      size_on_disk: 5368709120,
      pipeline_tag: "text-generation",
      tags: [
        "gguf",
        "text-generation",
        "arxiv:2309.00071",
        "arxiv:2505.09388",
        "base_model:Qwen/Qwen3-8B",
        "base_model:quantized:Qwen/Qwen3-8B",
        "license:apache-2.0",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 94189,
      likes: 156
    },
    {
      id: "Qwen/Qwen3-4B-GGUF:Qwen3-4B-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Qwen3 4B (GGUF)",
      repo_id: "Qwen/Qwen3-4B-GGUF",
      path: "Qwen3-4B-Q4_K_M.gguf",
      description: "Qwen3 4B dense model in Q4_K_M quantization.",
      size_on_disk: 2684354560,
      pipeline_tag: "text-generation",
      tags: [
        "gguf",
        "text-generation",
        "arxiv:2309.00071",
        "arxiv:2505.09388",
        "base_model:Qwen/Qwen3-4B",
        "base_model:quantized:Qwen/Qwen3-4B",
        "license:apache-2.0",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 48252,
      likes: 84
    }
];
