import type { ModuleConfig } from "../types.js";

export const textGenerateConfig: ModuleConfig = {
  configs: {
    "meta/meta-llama-3-8b": {
      className: "Llama3_8B",
      returnType: "str"
    },
    "meta/meta-llama-3-8b-instruct": {
      className: "Llama3_8B_Instruct",
      returnType: "str"
    },
    "meta/meta-llama-3-70b": {
      className: "Llama3_70B",
      returnType: "str"
    },
    "meta/meta-llama-3-70b-instruct": {
      className: "Llama3_70B_Instruct",
      returnType: "str"
    },
    "meta/meta-llama-3.1-405b-instruct": {
      className: "Llama3_1_405B_Instruct",
      returnType: "str"
    },
    "meta/llama-guard-3-11b-vision": {
      className: "LlamaGuard_3_11B_Vision",
      returnType: "str"
    },
    "meta/llama-guard-3-8b": {
      className: "LlamaGuard_3_8B",
      returnType: "str"
    },
    "snowflake/snowflake-arctic-instruct": {
      className: "Snowflake_Arctic_Instruct",
      returnType: "str"
    },
    "anthropic/claude-3.7-sonnet": {
      className: "Claude_3_7_Sonnet",
      returnType: "str"
    },
    "deepseek-ai/deepseek-r1": {
      className: "Deepseek_R1",
      returnType: "str"
    },
    "openai/gpt-5-structured": {
      className: "GPT_5_Structured",
      returnType: "str"
    },
    "openai/gpt-5": {
      className: "GPT_5",
      returnType: "str"
    },
    "openai/gpt-5-mini": {
      className: "GPT_5_Mini",
      returnType: "str"
    },
    "openai/gpt-5-nano": {
      className: "GPT_5_Nano",
      returnType: "str"
    },
    "openai/gpt-4.1": {
      className: "GPT_4_1",
      returnType: "str"
    },
    "openai/gpt-4.1-mini": {
      className: "GPT_4_1_Mini",
      returnType: "str"
    },
    "openai/gpt-4.1-nano": {
      className: "GPT_4_1_Nano",
      returnType: "str"
    },
    "deepseek-ai/deepseek-v3.1": {
      className: "Deepseek_V3_1",
      returnType: "str"
    },
    "google/gemini-3.1-pro": {
      className: "Gemini_3_1_Pro",
      returnType: "str"
    },
    "google/gemini-2.5-flash": {
      className: "Gemini_2_5_Flash",
      returnType: "str"
    },
    "google/gemini-3-pro": {
      className: "Gemini_3_Pro",
      returnType: "str"
    },
    "anthropic/claude-opus-4.6": {
      className: "Claude_Opus_4_6",
      returnType: "str"
    },
    "anthropic/claude-4.5-sonnet": {
      className: "Claude_4_5_Sonnet",
      returnType: "str"
    },
    "anthropic/claude-4.5-haiku": {
      className: "Claude_4_5_Haiku",
      returnType: "str"
    },
    "anthropic/claude-4-sonnet": {
      className: "Claude_4_Sonnet",
      returnType: "str"
    },
    "openai/gpt-5.2": {
      className: "GPT_5_2",
      returnType: "str"
    },
    "openai/o4-mini": {
      className: "O4_Mini",
      returnType: "str"
    },
    "openai/o1": {
      className: "O1",
      returnType: "str"
    },
    "openai/gpt-4o": {
      className: "GPT_4o",
      returnType: "str"
    },
    "openai/gpt-4o-mini": {
      className: "GPT_4o_Mini",
      returnType: "str"
    },
    "xai/grok-4": {
      className: "Grok_4",
      returnType: "str"
    },
    "deepseek-ai/deepseek-v3": {
      className: "Deepseek_V3",
      returnType: "str"
    },
    "qwen/qwen3-235b-a22b-instruct-2507": {
      className: "Qwen3_235B",
      returnType: "str"
    },
    "moonshotai/kimi-k2.5": {
      className: "Kimi_K2_5",
      returnType: "str"
    },
    "anthropic/claude-opus-4.7": {
      className: "Claude_Opus_4_7",
      returnType: "str"
    },
    "moonshotai/kimi-k2.6": {
      className: "Kimi_K2_6",
      returnType: "str"
    },
    "ibm-granite/granite-4.1-8b": {
      className: "Granite_4_1_8B",
      returnType: "str"
    },
    "ibm-granite/granite-4.2-8b": {
      className: "Granite_4_2_8B",
      returnType: "str"
    },
    "ibm-granite/granite-speech-4.1-2b": {
      className: "Granite_Speech_4_1_2B",
      returnType: "str",
      fieldOverrides: { audio: { propType: "audio" } }
    },
    "anthropic/claude-fable-5": {
      className: "Claude_Fable_5",
      returnType: "str",
      fieldOverrides: { image: { propType: "image" } }
    },
    "anthropic/claude-sonnet-4.6": {
      className: "Claude_Sonnet_4_6",
      returnType: "str",
      fieldOverrides: { image: { propType: "image" } }
    },
    "anthropic/claude-sonnet-5": {
      className: "Claude_Sonnet_5",
      returnType: "str",
      fieldOverrides: { image: { propType: "image" } }
    },
    "google/gemini-3.5-flash": {
      className: "Gemini_3_5_Flash",
      returnType: "str",
      fieldOverrides: {
        audio: { propType: "audio" },
        images: { propType: "list[image]" },
        videos: { propType: "list[video]" }
      }
    },
    "ibm-granite/granite-vision-4.1-4b": {
      className: "Granite_Vision_4_1_4b",
      returnType: "str",
      fieldOverrides: { images: { propType: "list[image]" } }
    },
    "openai/gpt-5.4": {
      className: "Gpt_5_4",
      returnType: "str",
      fieldOverrides: { image_input: { propType: "list[image]" } }
    },
    "openai/gpt-5.6-luna": {
      className: "Gpt_5_6_Luna",
      returnType: "str",
      fieldOverrides: { image_input: { propType: "list[image]" } }
    },
    "openai/gpt-5.6-sol": {
      className: "Gpt_5_6_Sol",
      returnType: "str",
      fieldOverrides: { image_input: { propType: "list[image]" } }
    },
    "openai/gpt-5.6-terra": {
      className: "Gpt_5_6_Terra",
      returnType: "str",
      fieldOverrides: { image_input: { propType: "list[image]" } }
    },
    "qwen/qwen3-7-plus": {
      className: "Qwen3_7_Plus",
      returnType: "str",
      fieldOverrides: { image: { propType: "list[image]" } }
    },
    "anthropic/claude-3.5-haiku": {
      className: "Claude_3_5_Haiku",
      returnType: "str"
    },
    "ibm-granite/granite-3.2-8b-instruct": {
      className: "Granite_3_2_8b_Instruct",
      returnType: "str"
    },
    "ibm-granite/granite-3.3-8b-instruct": {
      className: "Granite_3_3_8b_Instruct",
      returnType: "str"
    },
    "ibm-granite/granite-speech-3.3-8b": {
      className: "Granite_Speech_3_3_8b",
      returnType: "str",
      fieldOverrides: { audio: { propType: "list[audio]" } }
    },
    "ibm-granite/granite-vision-3.3-2b": {
      className: "Granite_Vision_3_3_2b",
      returnType: "str",
      fieldOverrides: {
        image: { propType: "image" },
        images: { propType: "list[image]" }
      }
    },
    "lucataco/qwen2.5-omni-7b": {
      className: "Qwen2_5_Omni_7b",
      returnType: "str",
      fieldOverrides: {
        audio: { propType: "audio" },
        image: { propType: "image" },
        video: { propType: "video" }
      }
    },
    "meta/llama-4-maverick-instruct": {
      className: "Llama_4_Maverick_Instruct",
      returnType: "str"
    },
    "meta/llama-4-scout-instruct": {
      className: "Llama_4_Scout_Instruct",
      returnType: "str"
    },
    "openai/gpt-5.1": {
      className: "Gpt_5_1",
      returnType: "str",
      fieldOverrides: { image_input: { propType: "list[image]" } }
    },
    "openai/gpt-5-pro": {
      className: "Gpt_5_Pro",
      returnType: "str",
      fieldOverrides: { image_input: { propType: "list[image]" } }
    },
    "openai/gpt-oss-120b": {
      className: "Gpt_Oss_120b",
      returnType: "str"
    },
    "openai/gpt-oss-20b": {
      className: "Gpt_Oss_20b",
      returnType: "str"
    },
    "openai/o1-mini": {
      className: "O1_Mini",
      returnType: "str"
    },
    "rafaelgalle/whisper-diarization-advanced": {
      className: "Whisper_Diarization_Advanced",
      returnType: "str",
      fieldOverrides: {
        file_url: { propType: "audio" },
        file_path: { propType: "audio" }
      }
    }
  }
};
