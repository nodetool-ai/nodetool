/**
 * Simplified Chinese strings of the shared frame: header, footer, buttons and
 * the installer picker. Nav labels are keyed by the English href, so the
 * header keeps one link list and only swaps the words.
 */
import type { LocaleChrome } from "@/i18n/content";
import type { DownloadPanelCopy } from "@/components/DownloadPanel";

export const ZH_CHROME: LocaleChrome = {
  download: "免费下载 Studio",
  tryBrowser: "在浏览器中试用（alpha）",
  englishVersion: "阅读英文版",
  englishSuffix: "（英文）",
  updated: "更新于",
};

/** Header and footer group titles, keyed by the English title. */
export const ZH_NAV_GROUPS: Record<string, string> = {
  Product: "产品",
  Solutions: "解决方案",
  Resources: "资源",
  Compare: "对比",
  Legal: "法律信息",
};

/** Header and footer link labels, keyed by href. */
export const ZH_NAV_LABELS: Record<string, string> = {
  "/studio": "Studio 桌面版",
  "/cloud": "Cloud（alpha）",
  "/agents": "智能体",
  "/node-based-workflows": "节点工作流",
  "/node-based-ai": "节点式 AI",
  "/ai-video-editor": "AI 视频编辑器",
  "/ai-image-editor": "AI 图像编辑器",
  "/storyboards": "故事板",
  "/mcp": "MCP 服务器",
  "/models": "支持的模型",
  "/download": "下载",
  "/developers": "开发者",
  "/marketing": "广告营销",
  "/gamedev": "游戏开发",
  "/gamedev/ai-game-engines": "AI 游戏引擎对比",
  "/solutions/local-first": "本地优先",
  "/solutions/researchers": "研究人员",
  "/solutions": "全部解决方案",
  "/templates": "模板",
  "/recipes": "分步教程",
  "/presets": "预设",
  "/ad-library": "广告模板库",
  "/alternatives": "替代方案对比",
  "/alternatives/comfyui": "对比 ComfyUI",
  "/faq": "常见问题",
  "/demo": "在线演示",
  "/pricing": "价格",
  "/blog": "博客",
  "/tasks": "任务",
  "/providers": "服务商",
  "/showcase": "作品展示",
  "/ideas": "工作流灵感",
  "/imprint": "版权信息",
  "/privacy": "隐私政策",
  "/terms": "服务条款",
  "https://docs.nodetool.ai": "文档",
};

/** AnnouncementBar. The English bar links /cloud, which has no translation. */
export const ZH_ANNOUNCEMENT = {
  text: "NodeTool Cloud 处于 alpha 阶段。在浏览器中导演影片、运行工作流，使用你自己的密钥。",
  short: "NodeTool Cloud 处于 alpha 阶段。",
  href: "https://app.nodetool.ai",
  cta: "试用",
  dismiss: "关闭公告",
};

/** HeroDemoPlayer controls. */
export const ZH_PLAYER = {
  soundOn: "打开声音",
  soundOff: "关闭声音",
  pause: "暂停演示",
  play: "播放演示",
  fullscreenLabel: "全屏播放演示",
  fullscreen: "全屏",
};

export const ZH_HEADER = {
  skip: "跳到正文",
  star: "在 GitHub 上加星",
  starLabel: "在 GitHub 上为 NodeTool 加星",
  openMenu: "打开菜单",
  closeMenu: "关闭菜单",
  menu: "网站菜单",
  home: "NodeTool 首页",
};

export const ZH_FOOTER = {
  blurb: "免费开源软件，与一线艺术家、设计师和视频剪辑师一起打造。描述你想创作的内容，看智能体把它做出来，并保存项目文件。",
  builtInOpen: "开放开发。",
  languages: "语言",
};

export const ZH_DOWNLOAD_PANEL: DownloadPanelCopy = {
  downloadFor: "下载 {platform} 版",
  notes: {
    "mac-arm": "M1 及更新的芯片，macOS 12 或更高版本",
    "mac-intel": "Intel 芯片的 Mac，macOS 12 或更高版本",
    windows: "64 位 Windows 10 或 11",
    linux: "64 位 AppImage，每个版本也附带 Flatpak",
  },
  onMobile: "请在电脑上打开本页安装 NodeTool Studio。在下方选择 macOS、Windows 或 Linux 版本。",
  pickBuild: "选择适合你电脑的版本。",
  releasesBefore: "所有版本、更新说明和校验值都在",
  releasesLink: " GitHub Releases 页面",
  releasesAfter: "。",
};
