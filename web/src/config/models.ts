import { UnifiedModel } from "../stores/ApiTypes";

export const llama_models: UnifiedModel[] = [
  {
    id: "gpt-oss:20b",
    name: "GPT - OSS",
    description: "OpenAI's open-weight models designed for powerful reasoning, agentic tasks, and versatile developer use cases.",
    type: "llama_model"
  },
  
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
      "DeepSeek-R1 is a family of open reasoning models with performance approaching that of leading models, such as O3 and Gemini 2.5 Pro.\nNote: The distilled versions exhibit lower performance.",
    type: "llama_model"
  },
  {
    id: "deepseek-r1:7b",
    name: "Deepseek R1 - 7B",
    description:
      "DeepSeek-R1 is a family of open reasoning models with performance approaching that of leading models, such as O3 and Gemini 2.5 Pro.\nNote: The distilled versions exhibit lower performance.",
    type: "llama_model"
  },
  {
    id: "deepseek-r1:8b",
    name: "Deepseek R1 - 8B",
    description:
      "DeepSeek-R1 is a family of open reasoning models with performance approaching that of leading models, such as O3 and Gemini 2.5 Pro.\nNote: The distilled versions exhibit lower performance.",
    type: "llama_model"
  },
  {
    id: "deepseek-r1:14b",
    name: "Deepseek R1 - 14B",
    description:
      "DeepSeek-R1 is a family of open reasoning models with performance approaching that of leading models, such as O3 and Gemini 2.5 Pro.\nNote: The distilled versions exhibit lower performance.",
    type: "llama_model"
  },
  {
    id: "deepseek-r1:32b",
    name: "Deepseek R1 - 32B",
    description:
      "DeepSeek-R1 is a family of open reasoning models with performance approaching that of leading models, such as O3 and Gemini 2.5 Pro.\nNote: The distilled versions exhibit lower performance.",
    type: "llama_model"
  },
  {
    id: "deepseek-r1:70b",
    name: "Deepseek R1 - 70B",
    description:
      "DeepSeek-R1 is a family of open reasoning models with performance approaching that of leading models, such as O3 and Gemini 2.5 Pro.\nNote: The distilled versions exhibit lower performance.",
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
    name: "Codegemma",
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
    name: "Nemotron Mini",
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
    id: "gemma3:latest",
    name: "Gemma3 - Latest",
    description: "Google Gemma 3 is a lightweight, multimodal model built on Gemini technology. Features a 128K context window with support for over 140 languages and can process both text and images.",
    type: "llama_model"
  },
  {
    id: "gemma3:1b",
    name: "Gemma3 - 1B",
    description: "Compact 1B parameter Gemma 3 model with 32K context window. Text-only model designed for resource-limited devices while maintaining strong performance in reasoning and language tasks.",
    type: "llama_model"
  },
  {
    id: "gemma3:4b",
    name: "Gemma3 - 4B",
    description: "Multimodal 4B parameter Gemma 3 model with 128K context window. Can process both text and images, excelling in tasks like question answering, summarization, and visual reasoning.",
    type: "llama_model"
  },
  {
    id: "gemma3:12b",
    name: "Gemma3 - 12B",
    description: "Advanced 12B parameter multimodal Gemma 3 model with 128K context window. Processes text and images with superior performance in complex reasoning, coding, and multilingual tasks.",
    type: "llama_model"
  },
  {
    id: "gemma3:27b",
    name: "Gemma3 - 27B",
    description: "Flagship 27B parameter multimodal Gemma 3 model with 128K context window. The most capable model in the series, offering top-tier performance in text and image processing tasks.",
    type: "llama_model"
  },
  {
    id: "gemma3:1b-it-qat",
    name: "Gemma3 - 1B QAT",
    description: "Quantization-aware trained 1B parameter Gemma 3 model. Preserves similar quality as half precision models while maintaining 3x lower memory footprint compared to non-quantized versions.",
    type: "llama_model"
  },
  {
    id: "gemma3:4b-it-qat",
    name: "Gemma3 - 4B QAT",
    description: "Quantization-aware trained 4B parameter Gemma 3 model. Preserves similar quality as half precision models while maintaining 3x lower memory footprint compared to non-quantized versions.",
    type: "llama_model"
  },
  {
    id: "gemma3:12b-it-qat",
    name: "Gemma3 - 12B QAT",
    description: "Quantization-aware trained 12B parameter Gemma 3 model. Preserves similar quality as half precision models while maintaining 3x lower memory footprint compared to non-quantized versions.",
    type: "llama_model"
  },
  {
    id: "gemma3:27b-it-qat",
    name: "Gemma3 - 27B QAT",
    description: "Quantization-aware trained 27B parameter Gemma 3 model. Preserves similar quality as half precision models while maintaining 3x lower memory footprint compared to non-quantized versions.",
    type: "llama_model"
  },
  {
    id: "gemma3n:latest",
    name: "Gemma 3n",
    description:
      "Gemma 3n models are designed for efficient execution on everyday devices such as laptops, tablets or phones. These models were trained with data in over 140 spoken languages and use selective parameter activation technology to reduce resource requirements.",
    type: "llama_model"
  },
  {
    id: "gemma3n:e2b",
    name: "Gemma 3n - E2B",
    description:
      "Gemma 3n models are designed for efficient execution on everyday devices such as laptops, tablets or phones. This variant operates at an effective size of 2B parameters using selective parameter activation technology.",
    type: "llama_model"
  },
  {
    id: "gemma3n:e4b",
    name: "Gemma 3n - E4B",
    description:
      "Gemma 3n models are designed for efficient execution on everyday devices such as laptops, tablets or phones. This variant operates at an effective size of 4B parameters using selective parameter activation technology.",
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
  },
  {
    id: "qwen2.5vl:latest",
    name: "Qwen2.5-VL - Latest",
    description:
      "Flagship vision-language model of Qwen and a significant leap from Qwen2-VL. Capable of visual understanding, agentic behavior, visual localization with bounding boxes, and generating structured outputs from documents.",
    type: "llama_model"
  },
  {
    id: "qwen2.5vl:3b",
    name: "Qwen2.5-VL - 3B",
    description:
      "Compact 3B parameter vision-language model designed for edge AI. Processes text and images with 125K context window, capable of visual understanding and document analysis while maintaining efficiency.",
    type: "llama_model"
  },
  {
    id: "qwen2.5vl:7b",
    name: "Qwen2.5-VL - 7B",
    description:
      "Powerful 7B parameter vision-language model that outperforms GPT-4o-mini in many tasks. Excels at visual understanding, document analysis, and can act as a visual agent for computer and phone use.",
    type: "llama_model"
  },
  {
    id: "qwen2.5vl:32b",
    name: "Qwen2.5-VL - 32B",
    description:
      "Advanced 32B parameter vision-language model with superior performance in complex visual reasoning, document understanding, and agentic capabilities. Supports visual localization and structured output generation.",
    type: "llama_model"
  },
  {
    id: "qwen2.5vl:72b",
    name: "Qwen2.5-VL - 72B",
    description:
      "Flagship 72B parameter vision-language model achieving competitive performance with SOTA models. Excels in college-level problems, math, document understanding, and visual agent tasks without task-specific fine-tuning.",
    type: "llama_model"
  },
  {
    id: "qwen2.5-coder:latest",
    name: "Qwen2.5-Coder - Latest",
    description:
      "Latest series of code-specific Qwen models with significant improvements in code generation, code reasoning, and code fixing. Supports 40+ programming languages with state-of-the-art performance for open-source models.",
    type: "llama_model"
  },
  {
    id: "qwen2.5-coder:0.5b",
    name: "Qwen2.5-Coder - 0.5B",
    description:
      "Ultra-compact 0.5B parameter coding model designed for resource-constrained environments. Maintains strong code generation capabilities while requiring minimal memory and computational resources.",
    type: "llama_model"
  },
  {
    id: "qwen2.5-coder:1.5b",
    name: "Qwen2.5-Coder - 1.5B",
    description:
      "Efficient 1.5B parameter coding model offering excellent balance between performance and resource usage. Capable of code generation, reasoning, and fixing across multiple programming languages.",
    type: "llama_model"
  },
  {
    id: "qwen2.5-coder:3b",
    name: "Qwen2.5-Coder - 3B",
    description:
      "Compact 3B parameter coding model with enhanced capabilities in code generation and reasoning. Ideal for local development environments while maintaining strong multi-language programming support.",
    type: "llama_model"
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen2.5-Coder - 7B",
    description:
      "Powerful 7B parameter coding model with impressive code reasoning performance. Excels at code generation, debugging, and multi-language programming tasks with efficient resource utilization.",
    type: "llama_model"
  },
  {
    id: "qwen2.5-coder:14b",
    name: "Qwen2.5-Coder - 14B",
    description:
      "Advanced 14B parameter coding model offering superior performance in complex programming tasks. Excellent for code generation, reasoning, and repair across 40+ programming languages.",
    type: "llama_model"
  },
  {
    id: "qwen2.5-coder:32b",
    name: "Qwen2.5-Coder - 32B",
    description:
      "Flagship 32B parameter coding model with competitive performance against GPT-4o. Achieves state-of-the-art results in code generation, repair, and reasoning with exceptional multi-language support including Haskell and Racket.",
    type: "llama_model"
  }
];
