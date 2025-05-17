import { UnifiedModel } from "../stores/ApiTypes";

export const llama_models: UnifiedModel[] = [
  {
    id: "llama3.2:1b",
    name: "Llama 3.2 - 1B",
    description: "Meta's Llama 3.2 goes small with 1B and 3B models.",
    type: "llama_model"
  },
  {
    id: "llama3.2:3b",
    name: "Llama 3.2 - 3B",
    description: "Meta's Llama 3.2 goes small with 1B and 3B models.",
    type: "llama_model"
  },
  {
    id: "llama3.2-vision:11b",
    name: "Llama 3.2 Vision - 11B",
    description:
      "Llama 3.2 Vision is a collection of instruction-tuned image reasoning generative models in 11B and 90B sizes.",
    type: "llama_model"
  },
  {
    id: "llama3.1:8b",
    name: "Llama 3.1 - 8B",
    description:
      "Llama 3.1 is a new state-of-the-art model from Meta available in 8B, 70B and 405B parameter sizes.",
    type: "llama_model"
  },
  {
    id: "llava:7b",
    name: "Llava - 7B",
    description:
      "🌋 LLaVA is a novel end-to-end trained large multimodal model that combines a vision encoder and Vicuna for general-purpose visual and language understanding. Updated to version 1.6.",
    type: "llama_model"
  },
  {
    id: "llava:13b",
    name: "Llava - 13B",
    description:
      "🌋 LLaVA is a novel end-to-end trained large multimodal model that combines a vision encoder and Vicuna for general-purpose visual and language understanding. Updated to version 1.6.",
    type: "llama_model"
  },
  {
    id: "llava:34b",
    name: "Llava - 34B",
    description:
      "🌋 LLaVA is a novel end-to-end trained large multimodal model that combines a vision encoder and Vicuna for general-purpose visual and language understanding. Updated to version 1.6.",
    type: "llama_model"
  },
  {
    id: "deepseek-r1:1.5b",
    name: "Deepseek R1 - 1.5B",
    description:
      "DeepSeek's first-generation of reasoning models with comparable performance to OpenAI-o1, including six dense models distilled from DeepSeek-R1 based on Llama and Qwen.",
    type: "llama_model"
  },
  {
    id: "deepseek-r1:7b",
    name: "Deepseek R1 - 7B",
    description:
      "DeepSeek's first-generation of reasoning models with comparable performance to OpenAI-o1, including six dense models distilled from DeepSeek-R1 based on Llama and Qwen.",
    type: "llama_model"
  },
  {
    id: "deepseek-r1:8b",
    name: "Deepseek R1 - 8B",
    description:
      "DeepSeek's first-generation of reasoning models with comparable performance to OpenAI-o1, including six dense models distilled from DeepSeek-R1 based on Llama and Qwen.",
    type: "llama_model"
  },
  {
    id: "deepseek-r1:14b",
    name: "Deepseek R1 - 14B",
    description:
      "DeepSeek's first-generation of reasoning models with comparable performance to OpenAI-o1, including six dense models distilled from DeepSeek-R1 based on Llama and Qwen.",
    type: "llama_model"
  },
  {
    id: "deepseek-r1:32b",
    name: "Deepseek R1 - 32B",
    description:
      "DeepSeek's first-generation of reasoning models with comparable performance to OpenAI-o1, including six dense models distilled from DeepSeek-R1 based on Llama and Qwen.",
    type: "llama_model"
  },
  {
    id: "deepseek-r1:70b",
    name: "Deepseek R1 - 70B",
    description:
      "DeepSeek's first-generation of reasoning models with comparable performance to OpenAI-o1, including six dense models distilled from DeepSeek-R1 based on Llama and Qwen.",
    type: "llama_model"
  },
  {
    id: "granite3.1-moe:1b",
    name: "Granite 3.1 MOE - 1B",
    description:
      "The IBM Granite 1B and 3B models are long-context mixture of experts (MoE) Granite models from IBM designed for low latency usage.",
    type: "llama_model"
  },
  {
    id: "granite3.1-moe:3b",
    name: "Granite 3.1 MOE - 3B",
    description:
      "The IBM Granite 1B and 3B models are long-context mixture of experts (MoE) Granite models from IBM designed for low latency usage.",
    type: "llama_model"
  },
  {
    id: "minicpm-v:8b",
    name: "MiniCPM-V - 8B",
    description:
      "A series of multimodal LLMs (MLLMs) designed for vision-language understanding.",
    type: "llama_model"
  },
  {
    id: "gemma2:2b",
    name: "Gemma2 - 2B",
    description:
      "Google Gemma 2 is a high-performing and efficient model available in three sizes: 2B, 9B, and 27B.",
    type: "llama_model"
  },
  {
    id: "codegemma:latest",
    name: "Coddegemma",
    description:
      "CodeGemma is a collection of powerful, lightweight models that can perform a variety of coding tasks like fill-in-the-middle code completion, code generation, natural language understanding, mathematical reasoning, and instruction following.",
    type: "llama_model"
  },
  {
    id: "codegemma:2b",
    name: "Codegemma - 2B",
    description:
      "CodeGemma is a collection of powerful, lightweight models that can perform a variety of coding tasks like fill-in-the-middle code completion, code generation, natural language understanding, mathematical reasoning, and instruction following.",
    type: "llama_model"
  },
  {
    id: "qwq:latest",
    name: "QwQ",
    description: "QwQ is the reasoning model of the Qwen series.",
    type: "llama_model"
  },
  {
    id: "phi3.5:latest",
    name: "Phi3.5",
    description:
      "A lightweight AI model with 3.8 billion parameters with performance overtaking similarly and larger sized models.",
    type: "llama_model"
  },
  {
    id: "mistral:latest",
    name: "Mistral",
    description: "The 7B model released by Mistral AI, updated to version 0.3.",
    type: "llama_model"
  },
  {
    id: "all-minilm:22m",
    name: "all-minilm - 22M",
    description: "Embedding models on very large sentence level datasets.",
    type: "llama_model"
  },
  {
    id: "nemotron-mini:latest",
    name: "Memotron Mini",
    description:
      "A commercial-friendly small language model by NVIDIA optimized for roleplay, RAG QA, and function calling.",
    type: "llama_model"
  },
  {
    id: "nomic-embed-text:latest",
    name: "Nomic Embed Text",
    description:
      "A high-performing open embedding model with a large token context window.",
    type: "llama_model"
  },
  {
    id: "mistral-nemo:8b",
    name: "Mistral Nemo - 8B",
    description:
      "A state-of-the-art 12B model with 128k context length, built by Mistral AI in collaboration with NVIDIA.",
    type: "llama_model"
  },
  {
    id: "mistral-small:latest",
    name: "Mistral Small",
    description:
      'Mistral Small 3 sets a new benchmark in the "small" Large Language Models category below 70B.',
    type: "llama_model"
  },
  {
    id: "gemma3:1b",
    name: "Gemma3 - 1B",
    description: "The current, most capable model that runs on a single GPU.",
    type: "llama_model"
  },
  {
    id: "gemma3:4b",
    name: "Gemma3 - 4B",
    description: "The current, most capable model that runs on a single GPU.",
    type: "llama_model"
  },
  {
    id: "gemma3:12b",
    name: "Gemma3 - 12B",
    description: "The current, most capable model that runs on a single GPU.",
    type: "llama_model"
  },
  {
    id: "gemma3:27b",
    name: "Gemma3 - 27B",
    description: "The current, most capable model that runs on a single GPU.",
    type: "llama_model"
  },
  {
    id: "qwen3:0.6b",
    name: "Qwen3 - 0.6B",
    description:
      "Qwen3 is the latest generation of large language models in Qwen series, offering a comprehensive suite of dense and mixture-of-experts (MoE) models.",
    type: "llama_model"
  },
  {
    id: "qwen3:1.7b",
    name: "Qwen3 - 1.7B",
    description:
      "Qwen3 is the latest generation of large language models in Qwen series, offering a comprehensive suite of dense and mixture-of-experts (MoE) models.",
    type: "llama_model"
  },
  {
    id: "qwen3:4b",
    name: "Qwen3 - 4B",
    description:
      "Qwen3 is the latest generation of large language models in Qwen series, offering a comprehensive suite of dense and mixture-of-experts (MoE) models.",
    type: "llama_model"
  },
  {
    id: "qwen3:8b",
    name: "Qwen3 - 8B",
    description:
      "Qwen3 is the latest generation of large language models in Qwen series, offering a comprehensive suite of dense and mixture-of-experts (MoE) models.",
    type: "llama_model"
  },
  {
    id: "qwen3:14b",
    name: "Qwen3 - 14B",
    description:
      "Qwen3 is the latest generation of large language models in Qwen series, offering a comprehensive suite of dense and mixture-of-experts (MoE) models.",
    type: "llama_model"
  },
  {
    id: "qwen3:30b",
    name: "Qwen3 - 30B",
    description:
      "Qwen3 is the latest generation of large language models in Qwen series, offering a comprehensive suite of dense and mixture-of-experts (MoE) models.",
    type: "llama_model"
  },
  {
    id: "qwen3:32b",
    name: "Qwen3 - 32B",
    description:
      "Qwen3 is the latest generation of large language models in Qwen series, offering a comprehensive suite of dense and mixture-of-experts (MoE) models.",
    type: "llama_model"
  }
];
