import type { LocalizedPageContent } from "@/i18n/content";
import { LOCAL_RUNTIMES } from "../shared";

/**
 * Translates /alternatives/comfyui (competitorEntries.ts, the comparison
 * template). The list of other alternatives is left out: it names hosted
 * canvases a mainland reader does not use, and the English page keeps it.
 */
export const comfyui: LocalizedPageContent = {
  route: "/alternatives/comfyui",
  name: "对比 ComfyUI",
  title: "ComfyUI 替代方案 | 保留 ComfyUI 节点图，加上周边编辑器 · NodeTool",
  description:
    "NodeTool 用一个开源桌面应用取代 Python 环境和容易出错的自定义节点，支持云端和本地模型，内置智能体、故事板和时间线。已有的 ComfyUI 节点图可以用 API 格式导入，作为一个节点运行。",
  hero: {
    kicker: "ComfyUI 替代方案",
    h1: "保留 ComfyUI 节点图。加上它周围的编辑器。",
    lead: "NodeTool 用一个开源桌面应用取代 Python 环境和容易出错的自定义节点。它支持云端和本地模型，内置智能体、故事板和时间线。已有的 ComfyUI 节点图？以 API 格式导入，作为一个节点运行。",
    note: "一个桌面安装包 · 内置智能体 · 运行 ComfyUI API 节点图",
    secondary: { label: "与 ComfyUI 逐项对比", href: "#compare" },
    media: {
      kind: "reel",
      base: "/hero-nodes",
      alt: "手动连接节点或让智能体搭建节点图。不匹配的连线在运行前被拦下，任何模型都可以原地替换。",
    },
  },
  sections: [
    {
      kind: "steps",
      id: "project",
      title: "从节点图到完成的项目。",
      intro: "工作流画布只是几个编辑器中的一个。故事板和时间线处理的是同一个项目。",
      steps: [
        { title: "搭建：智能体和节点图", body: "描述这部片子。智能体写出工作流，每一步都在节点编辑器中可见。" },
        { title: "生成：镜头和素材", body: "在故事板上用静帧确定画面风格。只有你通过的镜头才会变成视频。" },
        { title: "完成：可编辑的剪辑", body: "在时间线上排列、修剪和叠加片段，或者让智能体收紧开头。" },
      ],
    },
    {
      kind: "table",
      id: "compare",
      title: "NodeTool 与 ComfyUI",
      intro: "ComfyUI 是用于图像和视频生成节点图的节点编辑器，可以精细控制每个采样器和模型设置。NodeTool 是一个创作工作区，生成节点图是其中一个编辑器，旁边还有故事板、分层草图、剧本和视频时间线。它可以把 ComfyUI 服务器、NodeTool GPU worker 或 Comfy Cloud 作为节点图中的一个节点来调用。",
      head: ["功能", "ComfyUI", "NodeTool"],
      rows: [
        ["安装", "Python 环境和自定义节点管理器", "一个桌面安装包或 Docker"],
        ["内置智能体", "社区节点", "搭建、检查并修复节点图"],
        ["媒体类型", "通过受支持的工作流处理图像、视频、音频", "图像、视频、音频、文本"],
        ["模型", "本地模型和合作方的图像、视频模型", "覆盖各类媒体的本地和托管模型"],
        ["编辑工具（蒙版、局部重绘、重新打光、图层）", "通过工作流和节点提供", "集成的编辑器和节点"],
        ["本地模型", "广泛支持本地扩散模型、LoRA 和 ControlNet", "Ollama、MLX、llama.cpp、Flux、SD.cpp、Wan，以及托管 API"],
        ["桌面和浏览器", "本地网页界面和 Comfy Cloud", "Studio 和 Cloud（alpha）"],
        ["开源", "是", "是"],
        ["自定义节点稳定性", "第三方节点，版本可能冲突", "内置节点，一套维护中的代码"],
        ["跨机器迁移工作流", "可能需要安装自定义节点", "需要相同的模型和服务商访问权限"],
        ["运行 ComfyUI 工作流", "是", "作为一个节点，在你的 ComfyUI 服务器、NodeTool GPU worker 或 Comfy Cloud 上运行"],
      ],
    },
    {
      kind: "text",
      id: "when-comfyui",
      title: "什么时候 ComfyUI 更合适。",
      body: [
        "当节点图本身就是工作内容，你要手动调采样器、调度器和自定义节点时，选择 ComfyUI。它既能跑扩散图像，也能跑文生视频和图生视频。使用自定义节点的共享节点图，在另一台机器上需要同样的扩展和模型，调用它们的 NodeTool 工作流也一样。",
      ],
    },
  ],
  faq: {
    heading: "常见问题",
    items: [
      {
        question: "为什么 ComfyUI 工作流在分享或更新后会出错？",
        answer:
          "共享的 ComfyUI 节点图可能引用了另一台机器上没有的自定义节点或模型。ComfyUI Manager 可以帮忙安装缺失的节点。分享前请检查扩展和模型要求。NodeTool 工作流同样需要相同的模型和服务商访问权限，不过它的核心编辑功能随应用一起提供。",
      },
      {
        question: "NodeTool 能运行我现有的 ComfyUI 工作流吗？",
        answer:
          "能，前提是工作流以 API（prompt）格式导出。Run ComfyUI Workflow 节点会把它发送到你运行的 ComfyUI 服务器、前置 ComfyUI 的 NodeTool GPU worker，或使用 COMFY_API_KEY 发送到 Comfy Cloud。服务器上需要有该工作流用到的自定义节点和模型。",
      },
      {
        question: "Mac 或 Linux 上有 ComfyUI 的替代方案吗？",
        answer:
          "有。NodeTool Studio 提供适用于 Apple 芯片和 Intel Mac 的 .dmg、Windows 安装程序和 Linux AppImage。在 macOS 14 或更新版本的 Apple 芯片上，本地模型可以通过 Apple 的 MLX 框架运行。",
      },
      {
        question: "有比 ComfyUI 更容易上手的替代方案吗？",
        answer:
          "取决于哪一部分难。在 NodeTool 中，你描述想要的结果，智能体搭建并检查工作流，或者你从模板开始。托管模型不需要显卡，也不需要下载模型。",
      },
      {
        question: "有免费开源的 ComfyUI 替代方案吗？",
        answer: `有。NodeTool 以 AGPL-3.0 许可证免费开源，可以通过 ${LOCAL_RUNTIMES} 在你自己的电脑上运行本地模型，也可以用你自己的服务商密钥调用托管模型，例如 DeepSeek、通义千问和智谱 GLM，按服务商官方价格计费。`,
      },
    ],
  },
  readMore: {
    heading: "延伸阅读",
    links: [
      { label: "节点工作流", href: "/node-based-workflows" },
      { label: "全部替代方案", href: "/alternatives" },
      { label: "支持的模型", href: "/models" },
    ],
  },
  closing: {
    title: "省掉安装折腾，保留控制权。",
    body: "下载适用于 macOS、Windows 或 Linux 的 Studio。用智能体搭建新的节点图，或者把现有的 ComfyUI API 工作流作为一个节点导入。",
  },
};
