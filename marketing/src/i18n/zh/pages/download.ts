import type { LocalizedPageContent } from "@/i18n/content";
import { CN_PROVIDERS, HF_NOTE } from "../shared";

/** Translates /download (app/download/page.tsx, components/DownloadPanel.tsx). */
export const download: LocalizedPageContent = {
  route: "/download",
  name: "下载",
  title: "下载 NodeTool Studio | macOS、Windows、Linux 免费开源",
  description:
    "下载 NodeTool Studio 桌面应用，免费开源（AGPL-3.0），支持 macOS、Windows 和 Linux。项目、密钥和文件都留在你的电脑上。",
  hero: {
    kicker: "下载",
    h1: "下载 NodeTool Studio。",
    lead: "桌面工作室，免费开源，AGPL-3.0 许可证。你的项目、密钥和文件都留在你的电脑上。",
    primary: { label: "选择安装包", href: "#installers" },
  },
  sections: [
    {
      kind: "installers",
      id: "installers",
      title: "选择适合你电脑的版本。",
      intro: "不想安装？NodeTool Cloud 在浏览器标签页中运行同样的工作区。它处于 alpha 阶段，所以正式工作请使用 Studio。",
    },
    {
      kind: "cards",
      id: "needs",
      title: "需要准备什么。",
      cards: [
        {
          title: "一个 API 密钥，或者不需要",
          body: `打开应用，导入一个工作流，在连接任何服务之前先读一遍里面的每个节点。运行调用托管模型的工作流时，需要该服务商的密钥，例如 ${CN_PROVIDERS}，你直接向服务商付费。`,
        },
        {
          title: "只需放下应用本身的空间",
          body: `安装包大小显示在上面的每个按钮上。开放权重模型是可选的：只有想在自己的电脑上运行推理时才下载，入门的一组大约需要 20 GB。不会自动下载任何东西。${HF_NOTE}`,
        },
        {
          title: "不需要显卡",
          body: "GPU 只对本地模型有意义。如果你使用托管服务商，一台普通笔记本就够了，渲染在你选择的服务商那里进行。",
        },
      ],
    },
    {
      kind: "table",
      id: "first-launch",
      title: "第一次打开。",
      head: ["系统", "步骤"],
      rows: [
        ["macOS", "打开 .dmg，把 NodeTool 拖到“应用程序”。从“应用程序”打开 NodeTool，确认首次启动提示。"],
        ["Windows", "运行 .exe 安装程序并选择安装位置。新版本可能触发 SmartScreen 警告，选择“更多信息”，然后选择“仍要运行”。"],
        ["Linux", "给 AppImage 加上可执行权限：chmod +x Nodetool-*.AppImage。直接运行它，或者从同一个版本安装 Flatpak。"],
      ],
    },
    {
      kind: "text",
      id: "next",
      title: "装好了，接下来呢？",
      body: [
        "每个教程都是一串可以作为一个文件导入的工作流，页面上展示了它跑出来的结果。导入一个，读一遍，想运行时再添加密钥。",
      ],
      links: [
        { label: "浏览分步教程", href: "/recipes" },
        { label: "安装指南", href: "https://docs.nodetool.ai/installation" },
        { label: "快速开始", href: "https://docs.nodetool.ai/getting-started" },
        { label: "故障排除", href: "https://docs.nodetool.ai/troubleshooting" },
      ],
    },
  ],
  closing: {
    title: "免费开源，装上就能用。",
    body: "Studio 是 NodeTool 的完整版本。Cloud 是免安装的预览版，处于 alpha 阶段。",
    primary: { label: "选择安装包", href: "#installers" },
    secondary: { label: "在浏览器中试用（alpha）", href: "https://app.nodetool.ai" },
  },
};
