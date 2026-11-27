import type { LocalizedPageContent } from "@/i18n/content";
import { CN_PROVIDERS } from "../shared";

/**
 * Translates /alternatives/flora (competitorEntries.ts, the comparison
 * template with the creative canvas visuals). Left out: the three product
 * screenshots of the stages (the steps carry their text, and the hero reel
 * stays) and the list of other alternatives, which names tools a mainland
 * reader does not use. The page states no prices, so no price tokens appear.
 */
export const flora: LocalizedPageContent = {
  route: "/alternatives/flora",
  name: "对比 Flora",
  title: "Flora 替代方案：开源 AI 画布，用你自己的密钥 | NodeTool",
  description:
    "在找 Flora 替代？Flora 是闭源、按积分计费的托管画布。NodeTool 是开源画布，覆盖图像、视频、音频和文本，可以自行托管，使用你自己的密钥。",
  hero: {
    kicker: "Flora 替代方案",
    h1: "保留提示词、图层和工作流。",
    lead: "使用你所连接的服务商的模型来生成，只重绘一个图层而不动其他图层，并重新运行每张图背后的工作流。",
    note: "开源 · 本地和托管模型 · 使用你自己的服务商账号",
    secondary: { label: "与 Flora 逐项对比", href: "#compare" },
    media: {
      kind: "reel",
      base: "/hero-nodes",
      alt: "连接一个 NodeTool 工作流，一条类型不匹配的连线被拒绝，五个镜头经过 For Each、Text To Image、Image To Video、Collect 和 Concatenate Video 合成一个剪辑，然后更换图像模型",
      caption: "手动连线，或让智能体搭建这张图。不匹配的连接会在运行前被拦下，任何模型都可以原地替换。",
    },
  },
  sections: [
    {
      kind: "steps",
      id: "stages",
      title: "从提示词到成品素材",
      intro: "图像不是项目的终点。它背后的工作流和图层仍然可以编辑。",
      steps: [
        {
          title: "图像背后的工作流",
          body: "提示词、参考图和模型都是相连的节点，所以结果可以追溯并重新运行。",
          meta: "1. 搭建",
        },
        {
          title: "一层一层地调整",
          body: "给一个图层一段描述，只重绘这一层。你自己画的内容保持原样。",
          meta: "2. 打磨",
        },
        {
          title: "延伸到故事板和视频",
          body: "同一个项目里有故事板，确认过的静帧可以在那里变成视频片段。",
          meta: "3. 继续",
        },
      ],
    },
    {
      kind: "table",
      id: "compare",
      title: "NodeTool 与 Flora",
      intro:
        "Flora 是托管的无限画布。NodeTool 是面向图像、视频、音频和文本工作流的开源创作工作区，带有智能体，可以在桌面运行或自行托管，使用你自己的服务商账号。",
      head: ["功能", "Flora", "NodeTool"],
      rows: [
        ["设计与上手体验", "专为创作打造的界面", "为深度使用而设计的可视化画布"],
        ["媒体类型", "图像、视频", "图像、视频、音频、文本"],
        ["模型", "精选列表", `所有主流服务商，包括 ${CN_PROVIDERS}`],
        ["计费方式", "积分", "你自己的密钥，按服务商价格"],
        ["源代码", "闭源", "AGPL-3.0"],
        ["自行托管与数据所有权", "否", "是"],
        ["桌面应用与本地模型", "否", "是"],
      ],
    },
    {
      kind: "text",
      id: "when-flora",
      title: "什么时候 Flora 更合适",
      body: [
        "Flora 用起来确实很舒服：上手引导和画布都经过设计，想快速得到一张托管生成的图像或一段视频时，它很顺手。但它是闭源的，并且按积分计费：模型列表经过精选，每次渲染都消耗积分，你的作品也存放在他们的平台上。",
        "NodeTool 用一部分开箱即用的打磨，换来了掌控权。图像、视频、音乐和文本共用一块画布，每个服务商都按公开价格用你自己的密钥调用，本地模型通过 Ollama、MLX 和 llama.cpp 运行。它同样以智能体为先：描述你想要的，智能体就会连好这张图并运行它。整个项目以 AGPL-3.0 开源，你可以自行托管，并保留自己的文件。",
      ],
    },
  ],
  faq: {
    heading: "常见问题",
    items: [
      {
        question: "NodeTool 和 Flora 有什么区别？",
        answer:
          "Flora 是托管的闭源创作画布，用于 AI 图像和视频，按积分计费。NodeTool 是开源（AGPL-3.0）的可视化画布，使用你自己的密钥，覆盖图像、视频、音频和文本，按公开价格连接所有主流服务商，可以自行托管，也可以作为桌面应用运行本地模型。",
      },
      {
        question: "NodeTool 是 Flora 的免费替代方案吗？",
        answer:
          "NodeTool Studio 免费下载并且开源。你只需要按公开价格向你调用的服务商付费，使用你自己的 API 密钥。没有积分，也没有平台加价。你还可以在自己的硬件上免费运行本地模型。",
      },
      {
        question: "我可以自行托管 NodeTool，而不用托管画布吗？",
        answer:
          "可以。NodeTool 以 AGPL-3.0 开源，可以自行托管，NodeTool Cloud 是同一份代码的托管服务。无论哪种方式，你的工作流和文件都归你所有。",
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
    title: "在属于你的画布上创作。",
    body: "下载 Studio，在图像、视频、音频和文本之间创作：你的密钥，你的文件。",
  },
};
