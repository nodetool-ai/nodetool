import type { LocalizedPageContent } from "@/i18n/content";
import { CN_PROVIDERS, LOCAL_RUNTIMES, MAINLAND_KEYS } from "../shared";

/**
 * Translates /pricing (app/pricing/page.tsx, faqEntries.ts). The plan table
 * (SubscriptionSection) and the credit-plan calculator are left out: ChatGPT,
 * Claude and Gemini plans are not sold in mainland China, so the page leads
 * with keys a mainland reader can get and states plan sign-in once, last.
 */
export const pricing: LocalizedPageContent = {
  route: "/pricing",
  name: "价格",
  title: "价格 | 免费下载，按服务商价格付费，不加价 · NodeTool",
  description:
    "NodeTool Studio 免费开源。添加 DeepSeek、通义千问、智谱 GLM 等服务商的 API 密钥，按官方价格直接付费，或在本地免费运行模型。Cloud alpha 目前免费。",
  hero: {
    kicker: "价格",
    h1: "免费下载。服务商的价格，不加一分。",
    lead: `NodeTool Studio 免费开源。添加你自己的服务商密钥，例如 ${CN_PROVIDERS}，按各家的官方价格直接付费；或者在自己的电脑上运行本地模型，不按次计费。Cloud alpha 目前免费，未来的 Cloud 价格尚未公布。`,
  },
  sections: [
    {
      kind: "cards",
      id: "editions",
      title: "两个版本。",
      cards: [
        {
          title: "NodeTool Studio · 永久免费",
          meta: "桌面应用 · 在你的电脑上运行",
          body: `支持 macOS、Windows 和 Linux。本地模型通过 ${LOCAL_RUNTIMES} 运行。使用你自己的云端服务商账号。工作流和文件留在你的电脑上。AGPL-3.0。`,
          link: { label: "下载 Studio", href: "/download" },
        },
        {
          title: "NodeTool Cloud · alpha 期间免费",
          meta: "托管 · 无需安装",
          body: "在浏览器中运行，无需安装。使用你自己的云端服务商账号，按服务商价格直接付费。和你可以自行托管的是同一套 AGPL-3.0 代码。未来的 Cloud 价格尚未公布，使用前请查看 Cloud 页面上当前的 alpha 条款。",
          link: { label: "试用 Cloud（alpha）", href: "https://app.nodetool.ai" },
        },
      ],
    },
    {
      kind: "table",
      id: "compare",
      title: "Studio 和 Cloud 有什么区别？",
      intro: "Studio 是免费的桌面应用，在你的电脑上运行，包括本地模型。Cloud 是浏览器标签页里的同一套开源工作区，alpha 期间免费。两者都用你自己的密钥调用服务商。正式工作请使用 Studio，它是完整版本。",
      head: ["功能", "Studio", "Cloud（alpha）"],
      rows: [
        ["目前价格", "免费", "免费（alpha）"],
        ["未来价格", "免费", "尚未公布"],
        ["运行位置", "你的电脑（macOS、Windows、Linux）", "你的浏览器，由我们托管"],
        ["自带 API 密钥", "支持", "支持"],
        ["直接向服务商付费（不加价）", "是", "是"],
        ["本地模型（Ollama、MLX、llama.cpp）", "支持", "不支持"],
        ["需要显卡", "仅本地模型需要", "不需要"],
        ["安装", "安装桌面应用", "无需安装，登录即可"],
        ["开源（AGPL-3.0）", "是", "是"],
        ["随时自行托管", "是", "是"],
      ],
    },
    {
      kind: "text",
      id: "byok",
      title: "自带密钥怎么用？",
      body: [
        "你为自己使用的服务商添加 API 密钥，例如 DeepSeek、阿里云百炼、智谱 GLM、fal、Kie.ai 或 Replicate。每个请求直接发给这些服务商，你按它们公布的价格付费。NodeTool 不发行自己的积分，也不在服务商价格上加价。",
        MAINLAND_KEYS,
        "本地模型通过 Ollama、MLX 和 llama.cpp 运行，每次调用不产生费用。",
      ],
    },
  ],
  faq: {
    heading: "常见问题",
    items: [
      {
        question: "“自带密钥”对我意味着什么？",
        answer:
          "自带密钥（BYOK）是指你连接自己的服务商 API 密钥。请求直接发给这些服务商，你按它们公布的价格直接付费。NodeTool 不加价，也没有积分体系。",
      },
      {
        question: "NodeTool 收费吗？",
        answer:
          "Studio 免费且开源。Cloud 在 alpha 阶段免费，未来的 Cloud 定价尚未公布。服务商的 API 费用另计。本地模型使用你自己的硬件和电力，不产生按次计费的服务商费用。",
      },
      {
        question: "NodeTool 会在模型价格上加价吗？",
        answer: "不会。连接你自己的 API 密钥时，你按服务商公布的价格直接付费，NodeTool 不加任何费用。",
      },
      {
        question: "Studio 和 Cloud 应该选哪个？",
        answer:
          "长期工作请选择 Studio：它把项目保存在你的电脑上，支持在线服务商和本地模型。想不安装就在浏览器里试用，可以选择 Cloud。Cloud 处于 alpha 阶段，两个版本之间的项目迁移尚未完成。",
      },
      {
        question: "可以在本地运行模型吗？",
        answer: `可以。Studio 支持通过 ${LOCAL_RUNTIMES} 运行本地模型。可用的模型和速度取决于你的硬件。`,
      },
      {
        question: "可以使用 ChatGPT 或 Claude 订阅吗？",
        answer:
          "可以，在 Studio 中使用。用 ChatGPT 或 Claude 登录后，智能体使用该订阅而不是 API 密钥运行，这些运行计入你订阅方案的额度。没有这些订阅时，智能体也可以使用 DeepSeek、通义千问、智谱 GLM 等服务商的 API 密钥或本地模型运行。",
      },
    ],
  },
  closing: {
    title: "免费开始，在你自己的电脑上。",
    body: "下载 Studio，几分钟内搭好你的第一个工作流。",
  },
};
