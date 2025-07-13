---
layout: default
title: Supported Models
---

# Supported Models

NodeTool provides extensive support for AI models across multiple providers, from cutting-edge proprietary models to open-source alternatives. This comprehensive guide covers all supported models and their capabilities.

## Provider Overview

NodeTool supports six major categories of AI model providers:

- **OpenAI**: Industry-leading language models with multimodal capabilities
- **Anthropic**: Advanced reasoning models with strong safety features
- **Google**: Multimodal models with excellent vision and reasoning capabilities
- **Hugging Face**: Open-source models with standard inference
- **Hugging Face Groq**: High-performance models optimized for speed
- **Hugging Face Cerebras**: Models optimized for specialized hardware
- **Local**: Self-hosted models via Ollama or custom endpoints

## OpenAI Models

### GPT-4o Series
- **GPT-4o** (`gpt-4o`): Advanced multimodal model with vision capabilities
- **GPT-4o Mini** (`gpt-4o-mini`): Efficient version of GPT-4o for cost-effective tasks
- **ChatGPT-4o** (`chatgpt-4o-latest`): Conversational variant optimized for chat

### GPT-4o Audio Series
- **GPT-4o Audio** (`gpt-4o-audio-preview-2024-12-17`): Enhanced with audio processing
- **GPT-4o Mini Audio** (`gpt-4o-mini-audio-preview-2024-12-17`): Compact audio model

### GPT-4.1 Series
- **GPT-4.1** (`gpt-4.1`): Latest reasoning model with enhanced capabilities
- **GPT-4.1 Mini** (`gpt-4.1-mini`): Efficient version of GPT-4.1

### Specialized Models
- **O4 Mini** (`o4-mini`): Specialized reasoning model
- **Codex Mini** (`codex-mini-latest`): Code-focused model for programming tasks

**Best for**: General-purpose tasks, coding, multimodal applications, audio processing

## Anthropic Models

### Claude 3.5 Series
- **Claude 3.5 Haiku** (`claude-3-5-haiku-latest`): Fast, efficient model for everyday tasks
- **Claude 3.5 Sonnet** (`claude-3-5-sonnet-latest`): Balanced model for complex reasoning

### Claude 3.7 Series
- **Claude 3.7 Sonnet** (`claude-3-7-sonnet-latest`): Advanced reasoning capabilities

### Claude 4 Series
- **Claude Sonnet 4** (`claude-sonnet-4-20250514`): Next-generation reasoning model
- **Claude Opus 4** (`claude-opus-4-20250514`): Premium model for the most complex tasks

**Best for**: Complex reasoning, analysis, safety-critical applications, long-form content

## Google Gemini Models

### Gemini 2.5 Series
- **Gemini 2.5 Pro Experimental** (`gemini-2.5-pro-exp-03-25`): Cutting-edge experimental model
- **Gemini 2.5 Flash** (`gemini-2.5-flash-preview-04-17`): Fast, efficient multimodal model

### Gemini 2.0 Series
- **Gemini 2.0 Flash** (`gemini-2.0-flash`): Optimized for speed and efficiency
- **Gemini 2.0 Flash Lite** (`gemini-2.0-flash-lite`): Lightweight version for basic tasks
- **Gemini 2.0 Flash Exp Image Generation** (`gemini-2.0-flash-exp-image-generation`): Specialized for image generation

**Best for**: Multimodal tasks, vision processing, image generation, speed-critical applications

## Hugging Face Models

### Advanced Reasoning Models
- **DeepSeek V3 0324** (`deepseek-ai/DeepSeek-V3-0324`): Advanced reasoning and code generation
- **DeepSeek TNG R1T2 Chimera** (`tngtech/DeepSeek-TNG-R1T2-Chimera`): Hybrid reasoning model
- **DeepSeek R1** (`deepseek-ai/DeepSeek-R1`): Latest DeepSeek reasoning model
- **DeepSeek R1 Distill Qwen 1.5B** (`deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B`): Distilled efficient version

### Instruction-Tuned Models
- **Hunyuan A13B Instruct** (`tencent/Hunyuan-A13B-Instruct`): Tencent's instruction-tuned model
- **Meta Llama 3.1 8B Instruct** (`meta-llama/Meta-Llama-3.1-8B-Instruct`): Meta's powerful instruction model
- **Qwen 2.5 7B Instruct 1M** (`Qwen/Qwen2.5-7B-Instruct-1M`): Extended context length model

### Specialized Models
- **DeepSWE Preview** (`agentica-org/DeepSWE-Preview`): Specialized for software engineering tasks
- **Qwen 2.5 Coder 32B Instruct** (`Qwen/Qwen2.5-Coder-32B-Instruct`): Code-specialized model
- **Qwen 2.5 VL 7B Instruct** (`Qwen/Qwen2.5-VL-7B-Instruct`): Vision-language model

### Compact Models
- **SmolLM3 3B** (`HuggingFaceTB/SmolLM3-3B`): Compact, efficient language model
- **Gemma 2 2B IT** (`google/gemma-2-2b-it`): Google's efficient instruction-tuned model
- **Phi 4** (`microsoft/phi-4`): Microsoft's latest compact model

**Best for**: Open-source applications, specialized tasks, cost-effective deployment, research

## Hugging Face Groq Models

High-performance models optimized for speed through Groq's inference infrastructure:

### Meta Llama Series
- **Meta Llama 3 70B Instruct** (`meta-llama/Meta-Llama-3-70B-Instruct`): Large-scale instruction model
- **Llama 3.3 70B Instruct** (`meta-llama/Llama-3.3-70B-Instruct`): Enhanced version with improved capabilities
- **Llama Guard 4 12B** (`meta-llama/Llama-Guard-4-12B`): Safety and content moderation model

### Llama 4 Preview Series
- **Llama 4 Scout 17B 16E Instruct** (`meta-llama/Llama-4-Scout-17B-16E-Instruct`): Preview of next-generation Llama
- **Llama 4 Maverick 17B 128E Instruct** (`meta-llama/Llama-4-Maverick-17B-128E-Instruct`): Extended context Llama 4 variant

**Best for**: High-throughput applications, real-time inference, production deployments

## Hugging Face Cerebras Models

Models optimized for Cerebras' specialized hardware:

- **Cerebras GPT 2.5 12B Instruct** (`cerebras/Cerebras-GPT-2.5-12B-Instruct`): Cerebras' proprietary model
- **Llama 3.3 70B Instruct** (`meta-llama/Llama-3.3-70B-Instruct`): Optimized for Cerebras hardware
- **Llama 4 Scout 17B 16E Instruct** (`meta-llama/Llama-4-Scout-17B-16E-Instruct`): Next-gen Llama on Cerebras

**Best for**: Ultra-fast inference, specialized hardware optimization, high-performance computing

## Local Models

### Ollama Support
- **Any Ollama Model**: Run any model supported by Ollama locally
- **Popular Models**: Llama 3.1, Mistral, CodeLlama, Phi-3, and many more
- **Custom Models**: Import and run your own GGML/GGUF models

### Hugging Face Transformers
- **Local Inference**: Run Hugging Face models locally
- **Custom Endpoints**: Connect to your own model servers
- **Fine-tuned Models**: Use your own fine-tuned models

**Best for**: Privacy-sensitive applications, offline usage, custom models, cost control

## Model Capabilities

### Multimodal Support
- **Vision Models**: GPT-4o, Gemini 2.0/2.5, Qwen 2.5 VL
- **Audio Models**: GPT-4o Audio, GPT-4o Mini Audio
- **Text-to-Image**: Gemini 2.0 Flash Exp Image Generation

### Specialized Capabilities
- **Code Generation**: Codex Mini, Qwen 2.5 Coder, DeepSWE Preview
- **Reasoning**: Claude 4 series, DeepSeek R1, GPT-4.1
- **Long Context**: Qwen 2.5 7B Instruct 1M, Llama 4 Maverick 128E
- **Safety**: Llama Guard 4, Claude models with constitutional AI

### Performance Characteristics
- **Speed Optimized**: Groq models, Cerebras models, Flash variants
- **Efficiency**: Mini/Lite variants, compact models under 3B parameters
- **Quality**: Flagship models like GPT-4o, Claude Opus 4, Gemini 2.5 Pro

## Choosing the Right Model

### For General Tasks
- **OpenAI GPT-4o**: Best overall performance and multimodal capabilities
- **Claude 3.5 Sonnet**: Excellent reasoning and safety features
- **Gemini 2.0 Flash**: Fast, efficient multimodal processing

### For Specialized Applications
- **Coding**: Codex Mini, Qwen 2.5 Coder, DeepSWE Preview
- **Reasoning**: Claude 4 series, DeepSeek R1, GPT-4.1
- **Vision**: GPT-4o, Gemini 2.0/2.5, Qwen 2.5 VL
- **Audio**: GPT-4o Audio variants

### For Cost-Effective Solutions
- **Hugging Face Models**: Open-source alternatives
- **Mini Variants**: GPT-4o Mini, GPT-4.1 Mini
- **Local Models**: Ollama for complete cost control

### For High Performance
- **Groq Models**: Ultra-fast inference
- **Cerebras Models**: Specialized hardware optimization
- **Flash Variants**: Speed-optimized models

## Configuration and Setup

### API Requirements
- **OpenAI**: OpenAI API key
- **Anthropic**: Anthropic API key
- **Google**: Google AI API key
- **Hugging Face**: Hugging Face API token

### Local Setup
- **Ollama**: Download and install Ollama
- **Hardware**: Sufficient RAM and optional GPU for local models
- **Storage**: Adequate disk space for model files

### Usage Considerations
- **Rate Limits**: Different providers have different rate limits
- **Costs**: Pricing varies significantly between providers and models
- **Availability**: Some models may have limited availability or regions
- **Context Length**: Models have different maximum context windows

This comprehensive model support makes NodeTool one of the most flexible AI platforms available, allowing you to choose the perfect model for your specific needs while maintaining the ability to experiment with cutting-edge options as they become available.