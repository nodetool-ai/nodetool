import type { LocalizedPageContent } from "@/i18n/content";
import { CN_PROVIDERS, HF_NOTE, LOCAL_RUNTIMES, MAINLAND_KEYS, OPEN_SOURCE_LINE } from "../shared";

/** Translates /studio (app/studio/page.tsx, data/studioPage.ts, StudioHero). */
export const studio: LocalizedPageContent = {
  route: "/studio",
  name: "Studio 桌面版",
  title: "NodeTool Studio | 用 AI 智能体创作，项目保存在本地",
  description:
    "NodeTool 免费开源的桌面应用，支持 macOS、Windows 和 Linux。智能体在 NodeTool 的编辑器中生成图像、视频、音频和文本，项目保存在你的电脑上。可使用 DeepSeek、通义千问、智谱 GLM 或本地模型。",
  hero: {
    kicker: "NodeTool Studio · 桌面版",
    h1: "和 AI 智能体一起创作。项目保存在本地。",
    lead: "Studio 是免费的 NodeTool 桌面应用。AI 智能体在 NodeTool 的编辑器里生成图像、视频、音频和文本。你可以修改任何镜头、重写一句台词，或调整工作流。项目保存在你自己的电脑上。",
    note: `${OPEN_SOURCE_LINE}推荐用于正式项目。`,
    secondary: { label: "看看各个编辑器", href: "#editors" },
    media: {
      kind: "reel",
      base: "/hero-sizzle",
      alt: "NodeTool Studio：一份简报在智能体对话、故事板、节点画布、草图、剧本和时间线中变成一个项目",
      caption: "在桌面应用中录制：智能体规划故事板，生成并比较镜头，绘画，录制配音，剪辑视频。",
    },
  },
  sections: [
    {
      kind: "cards",
      id: "editors",
      title: "细节由你导演。",
      intro: "用适合这次修改的编辑器打开同一个项目。修改一个镜头、一句台词的读法、一个图层或剪辑的节奏，不用从头再来。",
      cards: [
        { title: "故事板", body: "修改一个镜头的描述、机位或角色，然后生成新版本。渲染前可以预览提示词，并选择要用的那一条。其他镜头保持不变。" },
        { title: "剧本与配音", body: "编写场景和台词，为每句台词配音。修改一句台词时，只重新生成这一句的配音。" },
        { title: "时间线", body: "多轨时间线：修剪、分割、转场、字幕、音乐和关键帧。生成的片段在时间线上按镜头顺序排列。" },
        { title: "草图", body: "分层图像编辑器。一次只重新生成一个图层，其余图层不受影响。" },
        { title: "3D 与游戏", body: "摆放物体、灯光和材质并渲染场景。也可以在内置引擎里搭建并试玩 2D 和 3D 游戏。" },
        { title: "节点", body: "每个项目的底层都是一张节点图。保存有效的流程，下次在新的输入上再次运行。" },
      ],
    },
    {
      kind: "text",
      id: "timelines",
      title: "每部影片都是一条可以打开的时间线。",
      body: [
        "这些短片都是用 NodeTool 制作的。每一部都是一个项目，而不是一个压平的视频文件：在 Studio 中打开它，就能修改场景、文字和动画。",
        "在 Studio 中，从标志菜单打开“示例”，选择“时间线”，找到一部影片，然后选择“打开可编辑时间线”。",
      ],
      links: [{ label: "观看用 NodeTool 制作的影片", href: "/storyboards" }],
    },
    {
      kind: "text",
      id: "ownership",
      kicker: "在你的电脑上运行",
      title: "项目留在你的电脑上。",
      body: [
        "Studio 把项目保存在你的电脑上。只有在你使用在线 AI 服务商或服务时，它才会联网。",
        `受支持的语言模型和图像模型可以通过 ${LOCAL_RUNTIMES} 在本地运行。能在本地跑哪些模型，取决于你电脑的硬件。${HF_NOTE}`,
      ],
      bullets: [
        "项目文件：工作区、工作流和媒体文件都存储在你的电脑上，由你决定放在哪里、何时移动。",
        `在线服务商：需要托管模型时，连接你自己的服务商账号，例如 ${CN_PROVIDERS}。这些请求需要联网，并受服务商条款约束。`,
        "离线工作：项目只使用本地文件和已安装的本地模型时，Studio 可以在没有网络的情况下工作。远程服务商、模型下载和在线服务仍需联网。",
      ],
      media: {
        kind: "image",
        src: "/screen_model_manager.webp",
        width: 1600,
        height: 1089,
        alt: "NodeTool 模型管理器，显示本地可用的模型",
        caption: "用模型管理器下载本地模型，或连接你的服务商账号。",
      },
    },
    {
      kind: "table",
      id: "setup",
      title: "从你现有的配置开始。",
      intro: "你不需要高性能电脑。在自己的电脑上运行 AI 模型是可选的。",
      head: ["项目", "说明"],
      rows: [
        ["桌面平台", "Studio 支持 macOS、Windows 和 Linux。"],
        ["显卡", "使用托管服务商时，独立显卡不是必需的。只有当你选择在本地运行较大的模型时，显卡才重要。"],
        ["模型下载", "可以只用服务商账号，也可以下载受支持的模型在本地运行。"],
        ["国内密钥", MAINLAND_KEYS],
      ],
    },
  ],
  faq: {
    heading: "关于 Studio 的问题",
    items: [
      {
        question: "Studio 和 Cloud 应该选哪个？",
        answer:
          "长期工作请选择 Studio：它把项目保存在你的电脑上，支持在线服务商和本地模型，可在 macOS、Windows 和 Linux 上运行。想不安装就在浏览器里试用 NodeTool，可以选择 Cloud。Cloud 处于 alpha 阶段，两个版本之间的项目迁移尚未完成。",
      },
      {
        question: "NodeTool 是本地优先、注重隐私的吗？",
        answer: `NodeTool Studio 把工作区、工作流、文件和你配置的凭据保存在你的电脑上。受支持的开放权重模型可以通过 ${LOCAL_RUNTIMES} 在本地运行。调用托管模型时，请求会离开你的电脑，发送到相应的服务商。`,
      },
      {
        question: "运行 NodeTool 需要 GPU 吗？",
        answer:
          "不需要。Studio 可以使用托管服务商，模型在服务商的硬件上运行。只有当你选择在自己的电脑上运行受支持的开放权重模型时，才需要考虑 GPU。具体要求取决于模型和运行环境，较小的模型可以在 CPU 上以较慢的速度运行。",
      },
      {
        question: "Studio 能离线使用吗？",
        answer:
          "当项目只使用本地文件和电脑上已安装的受支持本地模型时，Studio 可以在没有网络的情况下继续工作。远程服务商、模型下载、在线文档和其他托管服务仍需联网。",
      },
    ],
  },
  closing: {
    title: "在 Studio 中开始你的下一个项目。",
    body: "下载免费的桌面应用，支持 macOS、Windows 和 Linux。应用及其源代码以 AGPL-3.0 许可证开放。",
    secondary: { label: "试用 Cloud（alpha）", href: "https://app.nodetool.ai" },
  },
};
