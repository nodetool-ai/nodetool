import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /cloud (app/cloud/page.tsx and layout.tsx). The update-list form is left out. */
export const cloud: LocalizedPageContent = {
  route: "/cloud",
  name: "Cloud（alpha）",
  title: "NodeTool Cloud（alpha）| 浏览器里的 NodeTool 工作区",
  description:
    "在浏览器中试用 NodeTool 工作区：智能体、可编辑的项目界面、托管存储和远程服务商。Cloud 是 alpha 预览版，正式工作请使用 Studio。",
  hero: {
    kicker: "NodeTool Cloud · Alpha 预览",
    h1: "NodeTool 工作区，在你的浏览器里。",
    lead: "无需安装即可试用 NodeTool。Cloud 在网页浏览器中提供同一套 AI 智能体和编辑器，并把项目存储在线上。连接你自己的 AI 服务商账号来生成媒体。Cloud 处于 alpha 阶段，也就是早期测试版，请用它来试用 NodeTool，不要用于重要工作。",
    note: "Alpha 预览 · 需要联网 · 仅支持在线 AI 服务商。正式的付费工作请使用 Studio。",
    primary: { label: "试用 Cloud（alpha）", href: "https://app.nodetool.ai" },
    secondary: { label: "下载 Studio", href: "/studio" },
    media: {
      kind: "image",
      src: "/surface-storyboard-poster.webp",
      width: 1920,
      height: 1080,
      alt: "NodeTool 故事板编辑器，显示生成的镜头和智能体的工具记录",
      caption: "故事板编辑器。其中每个生成的镜头都可以继续编辑。",
    },
  },
  sections: [
    {
      kind: "text",
      id: "editable-project",
      kicker: "天生可编辑",
      title: "看看哪些内容始终可编辑。",
      body: [
        "智能体修改的是你也能自己打开的同一份故事板、工作流和时间线。下面的录像展示了用这种方式做出的项目。在 alpha 期间，Cloud 中部分模型和操作可能暂时不可用。",
      ],
      media: {
        kind: "reel",
        base: "/hero-flow",
        alt: "NodeTool：一句话变成节拍表、角色和场景、由静帧和片段组成的故事板，以及一个完成的剪辑",
        caption: "NodeTool 项目演示：智能体梳理故事，设计角色，画出故事板，并把片段剪成一个仍可继续修改的成片。",
      },
    },
    {
      kind: "cards",
      id: "hosted-boundaries",
      kicker: "托管版的边界",
      title: "弄清楚什么在哪里运行。",
      intro: "Cloud 省去安装步骤，但不能运行你自己电脑上的 AI 模型，生成内容的费用由 AI 服务商另行向你收取。",
      cards: [
        { title: "工作区", body: "托管的 alpha 版在浏览器中打开，把智能体、画布和各个编辑器放在一起，无需安装桌面应用。" },
        { title: "项目存储", body: "Cloud 使用托管存储。处理敏感或受监管的材料前，请先查看当前的 alpha 条款。" },
        { title: "AI 服务商", body: "远程的图像、视频、音频和语言模型通过你连接的服务商账号运行。服务商的费用与 NodeTool 分开计算。" },
        { title: "本地模型", body: "Cloud 无法使用在你电脑上通过 Ollama、MLX、llama.cpp 或其他运行时运行的模型。需要本地推理请使用 Studio。" },
        { title: "网络连接", body: "Cloud 需要联网。当每一步都使用本地文件和受支持的本地模型时，Studio 可以在没有网络的情况下继续本地工作。" },
      ],
    },
  ],
  faq: {
    heading: "试用 alpha 之前",
    items: [
      {
        question: "我应该选 Studio 还是 Cloud？",
        answer:
          "长期工作请选择 Studio：它把项目保存在你的电脑上，支持在线服务商和本地模型，适用于 macOS、Windows 和 Linux。想不安装就在浏览器里试用 NodeTool，可以选择 Cloud。Cloud 处于 alpha 阶段，两个版本之间的项目迁移尚未完成。请确认你需要的文件和功能能正确迁移。",
      },
      {
        question: "我应该对 Cloud alpha 有什么预期？",
        answer:
          "Cloud 是用于在浏览器中试用 NodeTool 的早期版本。功能、存储和可用性都可能变化，项目迁移也尚未完成。客户项目请使用 Studio。依赖某项功能之前，请查看 Cloud 页面和使用条款。",
      },
      {
        question: "Cloud 把我的项目存在哪里？",
        answer:
          "Cloud 使用托管的项目存储。保留期限和访问规则以当前的隐私政策和使用条款为准。如果材料必须留在你的设备上，请使用 Studio，并且在相关步骤中避免使用远程服务商。",
      },
      {
        question: "NodeTool 是本地优先并保护隐私的吗？",
        answer:
          "NodeTool Studio 把工作区、工作流、文件和已配置的凭据保存在你的电脑上。受支持的开放权重模型可以通过 MLX、Ollama、llama.cpp、vLLM 和 LM Studio 在本地运行。调用托管模型时，请求会离开你的电脑发往该服务商。Cloud 使用托管的项目存储，处理敏感材料前请先查看当前的隐私政策和使用条款。",
      },
    ],
  },
  readMore: {
    heading: "延伸阅读",
    links: [
      { label: "Studio 桌面版", href: "/studio" },
      { label: "价格", href: "/pricing" },
    ],
  },
  closing: {
    title: "不用安装，先试试这个工作区。",
    body: "Cloud 处于 alpha 阶段，适合用来试用 NodeTool。真正的项目请下载 Studio。",
    primary: { label: "试用 Cloud（alpha）", href: "https://app.nodetool.ai" },
    secondary: { label: "下载 Studio", href: "/studio" },
  },
};
