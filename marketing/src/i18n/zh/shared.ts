/**
 * Lines several Simplified Chinese pages share. DeepSeek, Qwen and GLM lead,
 * as on the /zh overview (data/languagePages.ts). The mainland settings come
 * from packages/config/src/setting-catalog.ts: DASHSCOPE_REGION, ZAI_REGION,
 * MINIMAX_REGION, KIMI_REGION and KLING_REGION switch a provider to its
 * mainland host, and HF_ENDPOINT routes Hub downloads through a mirror.
 * BytePlus has no mainland host (Volcengine Ark uses other model ids), so it
 * stays marked 国际版. ChatGPT and Claude plans are not sold in mainland
 * China, so these pages do not lead with plan sign-in.
 */

export const CN_PROVIDERS = "DeepSeek、阿里云百炼（通义千问）和智谱 GLM";

export const LOCAL_RUNTIMES = "Ollama、MLX、llama.cpp、vLLM 和 LM Studio";

export const MAINLAND_KEYS =
  "使用国内平台的密钥时，在设置中把对应的区域设为 china：阿里云百炼用 DASHSCOPE_REGION，智谱开放平台（bigmodel.cn）用 ZAI_REGION，MiniMax 用 MINIMAX_REGION，月之暗面（Kimi）用 KIMI_REGION，可灵用 KLING_REGION。国内版和国际版的密钥不通用。BytePlus 目前只支持国际版。";

/** HF_ENDPOINT routes model downloads and Hub searches through a mirror. */
export const HF_NOTE =
  "模型管理器从 Hugging Face 下载模型。huggingface.co 在中国大陆通常无法直接访问，可以在设置中把 HF_ENDPOINT 设为镜像地址，例如 https://hf-mirror.com，下载和搜索就会经过该镜像。";

export const INTL_AGGREGATORS =
  "fal.ai、Replicate、Kie.ai、AtlasCloud 和 Together AI 是国际平台，需要这些平台的账号和 API 密钥。";

export const COST_LINE = "Studio 免费。你按服务商公布的价格直接向服务商付费，使用你自己的密钥时 NodeTool 不加任何费用。";

export const OPEN_SOURCE_LINE = "免费开源，AGPL-3.0 许可证。支持 macOS、Windows 和 Linux。";
