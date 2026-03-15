import type { ModuleConfig } from "../types.js";

export const textGenerateConfig: ModuleConfig = {
  configs: {
    "meta/meta-llama-3-8b": {
      className: "Llama3_8B",
      returnType: "str",
    },
    "meta/meta-llama-3-8b-instruct": {
      className: "Llama3_8B_Instruct",
      returnType: "str",
    },
    "meta/meta-llama-3-70b": {
      className: "Llama3_70B",
      returnType: "str",
    },
    "meta/meta-llama-3-70b-instruct": {
      className: "Llama3_70B_Instruct",
      returnType: "str",
    },
    "meta/meta-llama-3.1-405b-instruct": {
      className: "Llama3_1_405B_Instruct",
      returnType: "str",
    },
    "meta/llama-guard-3-11b-vision": {
      className: "LlamaGuard_3_11B_Vision",
      returnType: "str",
    },
    "meta/llama-guard-3-8b": {
      className: "LlamaGuard_3_8B",
      returnType: "str",
    },
    "snowflake/snowflake-arctic-instruct": {
      className: "Snowflake_Arctic_Instruct",
      returnType: "str",
    },
    "anthropic/claude-3.7-sonnet": {
      className: "Claude_3_7_Sonnet",
      returnType: "str",
    },
    "deepseek-ai/deepseek-r1": {
      className: "Deepseek_R1",
      returnType: "str",
    },
    "openai/gpt-5-structured": {
      className: "GPT_5_Structured",
      returnType: "str",
    },
    "openai/gpt-5": {
      className: "GPT_5",
      returnType: "str",
    },
    "openai/gpt-5-mini": {
      className: "GPT_5_Mini",
      returnType: "str",
    },
    "openai/gpt-5-nano": {
      className: "GPT_5_Nano",
      returnType: "str",
    },
    "openai/gpt-4.1": {
      className: "GPT_4_1",
      returnType: "str",
    },
    "openai/gpt-4.1-mini": {
      className: "GPT_4_1_Mini",
      returnType: "str",
    },
    "openai/gpt-4.1-nano": {
      className: "GPT_4_1_Nano",
      returnType: "str",
    },
    "deepseek-ai/deepseek-v3.1": {
      className: "Deepseek_V3_1",
      returnType: "str",
    },
  },
};
