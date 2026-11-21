import type { LocalizedPageContent } from "@/i18n/content";
import { HF_NOTE, INTL_AGGREGATORS, LOCAL_RUNTIMES, MAINLAND_KEYS } from "../shared";

/**
 * Translates /models (app/models/page.tsx). The Chinese-provider table comes
 * from the /zh overview's provider list (data/languagePages.ts), which
 * translates docs/providers.md. Only BytePlus lacks a mainland host.
 */
export const models: LocalizedPageContent = {
  route: "/models",
  name: "支持的模型",
  title: "支持的 AI 模型 | 每个顶级模型都是一个节点 · NodeTool",
  description:
    "NodeTool 支持的图像、视频、语音和语言模型：DeepSeek、通义千问、智谱 GLM、通义万相、可灵、Seedance、海螺、FLUX、Veo 等，使用你自己的密钥按服务商价格调用，或通过 Ollama、llama.cpp 在本地运行。",
  hero: {
    kicker: "模型目录",
    h1: "每个顶级模型，都是一个节点。",
    lead: "当下最好的图像和视频模型都在这里。在可视化工作流中运行任何一个，把它们串起来，或者给两个模型同一条提示词做比较。你使用自己的密钥，按服务商价格付费。NodeTool 目前支持来自 {providerCount} 个服务商的 {modelCount} 个模型。",
    primary: { label: "查看国内服务商", href: "#cn-providers" },
    secondary: { label: "免费下载 Studio", href: "/download" },
  },
  sections: [
    {
      kind: "table",
      id: "cn-providers",
      title: "直接连接 DeepSeek、通义千问和智谱 GLM。",
      intro: "在设置中添加服务商的 API 密钥，NodeTool 就会直接调用该服务商。",
      head: ["服务商", "在 NodeTool 中可用"],
      rows: [
        ["DeepSeek", "对话（V3 和 R1 推理模型）"],
        ["阿里云百炼（通义千问 Qwen、通义万相 Wan）", "Qwen 对话，Qwen-Image 和 Wan 图像生成，Wan 视频生成，Qwen TTS 语音合成"],
        ["智谱 GLM（Z.ai / bigmodel.cn）", "GLM 对话，GLM-Image 图像生成，CogVideoX 视频生成，语音识别"],
        ["月之暗面（Kimi）", "Kimi 对话"],
        ["MiniMax", "对话、图像生成、海螺 Hailuo 视频生成、语音合成"],
        ["可灵 Kling AI", "可灵视频生成和图像生成"],
        ["BytePlus ModelArk（国际版）", "Seed 对话，Seedream 图像生成和编辑，Seedance 视频生成"],
      ],
      note: MAINLAND_KEYS,
    },
    {
      kind: "text",
      id: "local",
      title: "在自己的电脑上运行模型。",
      body: [
        `受支持的开放权重模型可以通过 ${LOCAL_RUNTIMES} 在本地运行，不需要密钥，也没有按次计费。能跑哪些模型、跑多快，取决于你的硬件。`,
        HF_NOTE,
      ],
      links: [{ label: "本地模型和云端模型", href: "https://docs.nodetool.ai/models" }],
    },
    {
      kind: "catalog",
      id: "featured",
      title: "视频和图像模型",
      intro: `下面这些模型通过 fal.ai、Replicate、Kie.ai 等聚合服务商调用，每张卡片标出提供它的服务商数量。${INTL_AGGREGATORS}`,
      source: "models",
    },
    {
      kind: "cards",
      id: "compare",
      title: "同一条提示词，两个模型，并排比较。",
      cards: [
        { title: "可灵 vs 海螺", body: "两款图生视频模型，同一条提示词。", link: { label: "查看对比", href: "/models/kling-vs-hailuo" } },
        { title: "Seedance vs 可灵", body: "字节跳动和快手的视频模型，同一条提示词。", link: { label: "查看对比", href: "/models/seedance-vs-kling" } },
        { title: "海螺 vs 通义万相", body: "MiniMax 和阿里巴巴的视频模型，同一条提示词。", link: { label: "查看对比", href: "/models/hailuo-vs-wan" } },
        { title: "FLUX vs Seedream", body: "两款文生图模型，同一条提示词。", link: { label: "查看对比", href: "/models/flux-vs-seedream" } },
      ],
    },
  ],
  faq: {
    heading: "常见问题",
    items: [
      {
        question: "支持哪些模型？",
        answer: `支持主流模型，包括 DeepSeek、通义千问 Qwen、智谱 GLM、通义万相 Wan、可灵、Seedance、海螺、Qwen Image、FLUX、Veo、Whisper 和 ElevenLabs。模型也可以通过 ${LOCAL_RUNTIMES} 在你自己的电脑上运行。`,
      },
      {
        question: "“自带密钥”对我意味着什么？",
        answer:
          "自带密钥（BYOK）是指你连接自己的服务商 API 密钥。请求直接发给这些服务商，你按它们公布的价格直接付费。NodeTool 不加价，也没有积分体系。",
      },
      {
        question: "NodeTool 会在模型价格上加价吗？",
        answer: "不会。连接你自己的 API 密钥时，你按服务商公布的价格直接付费，NodeTool 不加任何费用。",
      },
      {
        question: "可以在本地运行模型吗？",
        answer: `可以。Studio 支持通过 ${LOCAL_RUNTIMES}（MLX 用于 Apple 芯片）运行本地模型。可用的模型和速度取决于你的硬件。本地模型的请求在你的电脑上运行，在线服务商仍会收到你发给它们的请求。`,
      },
      {
        question: "需要 GPU 吗？",
        answer:
          "不需要。Studio 可以使用托管服务商，模型在服务商的硬件上运行。只有当你选择在自己的电脑上运行受支持的开放权重模型时，才需要考虑 GPU。",
      },
    ],
  },
  readMore: {
    heading: "延伸阅读",
    links: [
      { label: "服务商和它们的 API 密钥", href: "/providers" },
      { label: "价格", href: "/pricing" },
      { label: "节点工作流", href: "/node-based-workflows" },
      { label: "模型与服务商指南", href: "https://docs.nodetool.ai/models-and-providers" },
    ],
  },
  closing: {
    title: "换模型，不换工具。",
    body: "下载免费开源的 Studio，接入你已有的服务商密钥，或在本地运行模型。",
  },
};
