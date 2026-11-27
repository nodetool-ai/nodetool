import type { LocalizedPageContent } from "@/i18n/content";
import { CN_PROVIDERS, HF_NOTE } from "../shared";

/**
 * Translates /alternatives/lm-studio (competitorEntries.ts, the comparison
 * template with the local language model runtime visuals). Left out: the
 * three product screenshots of the stages (the steps carry their text, and the
 * hero reel stays), and the list "What are the best LM Studio alternatives?",
 * which names other English-market tools. The model download note is the
 * shared mainland HF_ENDPOINT line.
 */
export const lmStudio: LocalizedPageContent = {
  route: "/alternatives/lm-studio",
  name: "对比 LM Studio",
  title: "LM Studio 替代方案：开源，本地模型工作流 | NodeTool",
  description:
    "在找 LM Studio 替代？对比本地和开源方案。NodeTool 开源，用 Ollama、MLX、llama.cpp 运行本地模型，并接入智能体、文档检索和图像、视频、音频生成工作流。",
  hero: {
    kicker: "LM Studio 替代方案",
    h1: "本地模型，不止于聊天。",
    lead: "通过 Ollama、MLX 或 llama.cpp 运行模型，再把它们用在智能体、文档检索，以及图像、视频和音乐工作流里。",
    note: "开源 · 本地和托管模型 · 使用你自己的服务商账号",
    secondary: { label: "与 LM Studio 逐项对比", href: "#compare" },
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
      title: "从本地模型到工作流",
      intro: "聊天只是入口之一。同样的模型也能在智能体和多步骤工作流中运行。",
      steps: [
        {
          title: "与任何已连接的模型聊天",
          body: "选择本地或托管模型开始聊天，生成的媒体会留在对话里。",
          meta: "1. 聊天",
        },
        {
          title: "本地模型集中管理",
          body: "浏览、下载和管理本地模型，并查看每个模型适用于哪些节点。",
          meta: "2. 模型",
        },
        {
          title: "模型进入工作流",
          body: "把模型接入一张图，与智能体、文档检索和生成节点配合使用。",
          meta: "3. 工作流",
        },
      ],
      note: HF_NOTE,
    },
    {
      kind: "table",
      id: "compare",
      title: "NodeTool 与 LM Studio",
      intro:
        "LM Studio 是桌面端的本地语言模型运行环境。NodeTool 是面向图像、视频、音频和文本工作流的开源创作工作区，带有智能体，可以在桌面运行或自行托管，使用你自己的服务商账号。",
      head: ["功能", "LM Studio", "NodeTool"],
      rows: [
        ["本地语言模型聊天与模型浏览器", "专为此打造，体验精良", "通过 Ollama、MLX、llama.cpp 支持"],
        ["兼容 OpenAI 的本地服务器", "是", "通过服务商集成"],
        ["原生媒体生成（图像、视频、音乐）", "否", "是"],
        ["智能体与文档检索", "文档对话和 MCP 工具", "可编辑的智能体与检索工作流"],
        ["云端服务商（使用你自己的密钥）", "否", `是，包括 ${CN_PROVIDERS}`],
        ["源代码", "专有（免费）", "AGPL-3.0（开源）"],
        ["可视化画布", "否", "是"],
      ],
    },
    {
      kind: "text",
      id: "when-lm-studio",
      title: "什么时候 LM Studio 更合适",
      body: [
        "如果你想下载本地模型、与文档对话、连接 MCP 工具，并提供兼容 OpenAI 的接口，LM Studio 是更专注的选择。",
        "NodeTool 可以在可视化工作流里使用本地模型，与检索、图像、视频和音频步骤放在一起。它的智能体能搭建并修改这个工作流，编辑器会把生成的媒体保存在可编辑的项目里。",
        "LM Studio 也支持文档检索和 MCP 工具，但它的桌面界面以本地模型聊天和对外提供服务为中心。NodeTool 以可编辑的创作工作流和媒体制作为中心。",
      ],
      links: [
        { label: "LM Studio 文档对话", href: "https://lmstudio.ai/docs/app/basics/rag" },
        { label: "LM Studio MCP 工具", href: "https://lmstudio.ai/docs/developer/core/mcp" },
      ],
    },
  ],
  faq: {
    heading: "常见问题",
    items: [
      {
        question: "NodeTool 和 LM Studio 有什么区别？",
        answer:
          "LM Studio 是专门运行本地 GGUF 语言模型的桌面应用，包含模型浏览器、聊天界面和兼容 OpenAI 的本地服务器。NodeTool 是开源的可视化画布，同样能运行本地模型（通过 Ollama、MLX 和 llama.cpp），此外还能生成图像、视频和音乐，并围绕这些模型搭建智能体和文档检索工作流。",
      },
      {
        question: "本地模型应该用 LM Studio 还是 NodeTool？",
        answer:
          "如果你主要是想下载一个本地语言模型来聊天，或通过兼容 OpenAI 的接口对外提供服务，LM Studio 是更专门的工具。如果你想围绕本地（和云端）模型搭建工作流，例如检索、智能体和媒体生成，NodeTool 是做这件事的画布。",
      },
      {
        question: "NodeTool 是开源的吗？",
        answer:
          "是。NodeTool 以 AGPL-3.0 开源，作为桌面应用运行在 macOS、Windows 和 Linux 上。LM Studio 免费，但不开源。",
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
    title: "从本地聊天到完整工作流。",
    body: "下载 Studio，把你的本地模型放到画布上，与生成、智能体和文档检索一起使用。",
  },
};
