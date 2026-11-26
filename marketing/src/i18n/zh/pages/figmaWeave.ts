import type { LocalizedPageContent } from "@/i18n/content";
import { CN_PROVIDERS } from "../shared";

/**
 * Translates /alternatives/figma-weave (competitorEntries.ts, the comparison
 * template). The credit-cost table and the list of related alternatives are
 * left out: the first carries prices, the second names canvases a mainland
 * reader does not use.
 */
export const figmaWeave: LocalizedPageContent = {
  route: "/alternatives/figma-weave",
  name: "对比 Figma Weave",
  title: "Figma Weave 替代方案：开源、可自行托管 | NodeTool",
  description:
    "对比开源、可自行托管的 Figma Weave 替代方案。NodeTool 使用你自己的 API 密钥，支持本地模型，工作流由你运行并拥有。",
  hero: {
    kicker: "Figma Weave 替代方案",
    h1: "开源版的 Figma Weave 替代方案：用你自己的密钥。",
    lead: "Figma Weave 是 Figma 产品体系内的托管 AI 画布。NodeTool 是开源的，使用你自己的密钥，可以自行托管，也能在你的电脑上运行本地模型。",
    note: "浏览器、托管版、闭源 · 对比 NodeTool：开源，自带密钥",
    secondary: { label: "与 Figma Weave 逐项对比", href: "#compare" },
  },
  sections: [
    {
      kind: "table",
      id: "compare",
      title: "NodeTool 与 Figma Weave",
      intro: "Figma Weave 是闭源的托管画布，按自己的 AI 积分计费，无法自行托管。NodeTool 开源，用你自己的密钥调用服务商。",
      head: ["功能", "Figma Weave", "NodeTool"],
      rows: [
        ["计费方式", "AI 积分，按月套餐", "你自己的密钥，按服务商公布的价格"],
        ["模型", "精选列表", `${CN_PROVIDERS}、OpenAI、Anthropic、Google、fal.ai、Replicate、Kie.ai，以及本地模型`],
        ["源代码", "闭源", "AGPL-3.0"],
        ["免费档", "每月有免费积分，不含视频", "Studio 免费"],
        ["自行托管", "否", "是"],
        ["桌面应用和离线", "否", "桌面应用，使用本地模型时可离线"],
        ["本地模型（Ollama、MLX、llama.cpp）", "否", "是"],
      ],
      note: "Figma Weave 的定价以 weave.figma.com/pricing 为准，NodeTool 的费用见价格页。",
    },
    {
      kind: "text",
      id: "when-weave",
      title: "什么时候 Figma Weave 更合适。",
      body: [
        "如果团队已经在 Figma 里做设计，想要一个无需安装的托管画布，Figma Weave 很合适。当按积分计费、由精选模型列表组成的方案符合你的预算习惯时，可以选它。",
        "如果你想拥有自己的画布和工作流，用自己的密钥按服务商价格付费，或者在自己的电脑上运行模型，NodeTool 更合适。",
      ],
      links: [{ label: "查看价格", href: "/pricing" }],
    },
  ],
  faq: {
    heading: "常见问题",
    items: [
      {
        question: "Figma Weave 和 Weavy 是同一个产品吗？",
        answer:
          "是。Figma 在 2025 年 10 月收购了 Weavy 并将其更名为 Figma Weave。它作为独立产品在 weave.figma.com 运行，有自己的 AI 积分和计费，与 Figma 分开，并会逐步整合进 Figma 平台。",
      },
      {
        question: "我在 NodeTool 里可以运行哪些图像和视频模型？",
        answer:
          "Flux、Seedream、GPT Image、Nano Banana、Recraft、Veo、Kling、Seedance、Sora、Hailuo 和 Wan，通过 fal.ai、Replicate、Kie.ai、AtlasCloud、OpenAI 和 Google 等服务商接入，也可以通过 Ollama、MLX 和 llama.cpp 运行本地模型。fal.ai、Replicate、Kie.ai 和 AtlasCloud 是国际平台，需要这些平台的账号和 API 密钥。",
      },
      {
        question: "NodeTool 像 Figma Weave 一样使用积分吗？",
        answer:
          "不。NodeTool 不出售积分，使用你自己的密钥时也不加任何费用。你连接自己的服务商 API 密钥，直接按各服务商公布的价格付费，或者在自己的硬件上运行受支持的本地模型。",
      },
      {
        question: "团队可以自行托管 NodeTool 并共享工作流吗？",
        answer:
          "可以。NodeTool 以 AGPL-3.0 开源，可以用 Docker 运行在你自己的服务器上，也可以作为桌面应用在 macOS、Windows 和 Linux 上运行。工作流和项目以文件形式保存，可以做版本管理、共享，并在不同机器上重新运行。",
      },
    ],
  },
  readMore: {
    heading: "延伸阅读",
    links: [
      { label: "全部替代方案", href: "/alternatives" },
      { label: "价格", href: "/pricing" },
      { label: "支持的模型", href: "/models" },
    ],
  },
  closing: {
    title: "拥有你的画布和工作流。",
    body: "下载 Studio：开源，使用你自己的密钥，按公开价格接入主要的云端或本地服务商。",
  },
};
