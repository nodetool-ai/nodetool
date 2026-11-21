import type { LocalizedPageContent } from "@/i18n/content";
import { MAINLAND_KEYS } from "../shared";

const INSTALL = "npx -y --package=@nodetool-ai/cli-mcp nodetool-mcp install";

/** Translates /mcp (app/mcp/page.tsx, data/mcpPage.ts). */
export const mcp: LocalizedPageContent = {
  route: "/mcp",
  name: "MCP 服务器",
  title: "创意 MCP 服务器 | 给 Claude Code、Codex、Cursor 一个创作工作室 · NodeTool",
  description:
    "NodeTool 以开源 MCP 服务器运行。把它添加到 Claude Code、Codex、OpenCode、Cursor 或 Claude Desktop，你的智能体就能生成图像、视频、语音和音乐，并放进可编辑的故事板、时间线和工作流。",
  hero: {
    kicker: "创意 MCP 服务器",
    h1: "给你的编程智能体一个创作工作室。",
    lead: "NodeTool 以开源 MCP 服务器运行。把它添加到 Claude Code、Codex、OpenCode、Cursor 或 Claude Desktop，你的智能体就能生成图像、视频、语音和音乐，然后把它们放进你可以打开和编辑的文档：故事板、时间线、剧本、草图、游戏和工作流。它使用你自己的服务商密钥运行，桌面应用是可选的。",
    code: `$ ${INSTALL}`,
    note: "需要 Node.js 22 或更高版本。重启客户端，然后让它使用 NodeTool。",
    primary: { label: "查看配置方法", href: "#clients" },
    secondary: { label: "下载 Studio（可选）", href: "/download" },
  },
  sections: [
    {
      kind: "cards",
      id: "clients",
      title: "支持你的客户端。",
      cards: [
        { title: "Claude Code", body: "由 nodetool-mcp install 配置，作用于用户范围，所有项目可用。" },
        { title: "Codex", body: "由 nodetool-mcp install 配置，工具超时设为 900 秒，以便处理较长的视频任务。" },
        { title: "OpenCode", body: "由 nodetool-mcp install 配置。" },
        { title: "Cursor、Windsurf 等客户端", body: "运行 nodetool-mcp config，粘贴它输出的 mcpServers 配置块。" },
        { title: "Claude Desktop", body: "粘贴 nodetool-mcp config 的配置块，或在 Studio 的“设置 → MCP 服务器”中安装附带的扩展。" },
      ],
    },
    {
      kind: "cards",
      id: "capabilities",
      title: "你的智能体能做什么。",
      intro: "所有结果都进入你的 NodeTool 项目，你可以在 Studio 中打开智能体的成果继续编辑。",
      cards: [
        { title: "生成媒体", body: "图像、图像编辑、从文本、图像或参考生成视频、语音、音乐和转录，使用你指定的服务商和模型。find_model 会返回一个真实的模型 ID，智能体不用去猜。" },
        { title: "制作视频", body: "创建故事板，渲染静帧和片段，为剧本配音，组装时间线，编辑它，预览画面，渲染成片。" },
        { title: "制作游戏", body: "创建 2D 或 3D 游戏，通过经过检查的操作编辑它，生成并安装美术和音效，无界面试玩，截取画面，构建网页播放器。" },
        { title: "编辑图像", body: "创建和编辑带版本的分层草图，用 view_image 查看任何结果。" },
        { title: "运行工作流", body: "创建、检查、调试并运行节点工作流，或把它们作为后台任务启动并读取日志。" },
        { title: "保留文件", body: "把文件上传为素材并下载结果。在本地连接下，download_asset 会直接写入项目中的路径。" },
      ],
    },
    {
      kind: "table",
      id: "tools",
      title: "工具、资源和提示词。",
      intro: "服务器只注册少量直接工具。nodetool://capabilities 和 nodetool://sandbox 两个资源描述其余能力。每个技能都是一个 MCP 提示词，所以 Claude Code 会把它显示为斜杠命令。",
      head: ["工具", "作用"],
      rows: [
        ["execute_code", "运行沙箱中的 JavaScript，调用 nodetool.<namespace>.<method>()。上面所有能力都通过它调用。"],
        ["view_image", "返回一张图像，让智能体看到像素。"],
        ["upload_asset, download_asset", "把文件移入或移出素材库。"],
        ["find_model, list_models, list_provider_models", "为某项能力找到真实的服务商和模型 ID。"],
        ["search_nodes, get_node_info, list_nodes", "为工作流查找节点类型。"],
        ["browser, http_request, download_file, list_directory", "在 NodeTool 的 URL 检查之后获取网页和文件。"],
        ["run_subtask", "把任务交给一个带有 NodeTool 工具的子智能体。"],
      ],
    },
    {
      kind: "table",
      id: "modes",
      title: "有没有 Studio 都可以。",
      head: ["连接方式", "说明"],
      rows: [
        ["stdio（默认）", "nodetool-mcp serve。Studio 或经典 API 服务器在 127.0.0.1:7777 运行时，请求会发给它，打开的编辑器会实时显示智能体的修改。否则它在默认数据目录上独立运行。"],
        ["HTTP", "经典 API 服务器运行时，nodetool-mcp install --http 让客户端指向 http://127.0.0.1:7777/mcp。"],
        ["远程服务器", "在“设置 → MCP 服务器 → 远程连接智能体”中创建访问令牌，让客户端指向该服务器。"],
      ],
    },
    {
      kind: "text",
      id: "keys",
      title: "密钥只需保存一次。",
      body: [
        "生成需要服务商密钥。用 nodetool secrets store 保存，或设置同名的环境变量。节点搜索、检查、素材和文件工具不需要密钥。",
        MAINLAND_KEYS,
      ],
      code: "nodetool secrets store DEEPSEEK_API_KEY\nnodetool secrets store DASHSCOPE_API_KEY",
      bullets: [
        "大多数能力在 execute_code 中运行，而不是作为单独的 MCP 工具。你的客户端的审批设置决定是否逐次确认 execute_code 调用，服务器本身没有审批提示。",
        "服务器的文件工具作用于 NodeTool 工作区，而不是你的文件系统。把结果写入项目中的路径需要本地连接。",
        "服务器需要 Node.js 22 或更高版本。",
      ],
    },
  ],
  faq: {
    heading: "关于 MCP 服务器的问题",
    items: [
      {
        question: "什么 MCP 服务器能让 Claude Code 生成图像和视频？",
        answer: `NodeTool。运行 ${INSTALL}，重启 Claude Code，然后让它生成一张图或一段视频。它使用你自己的密钥调用各家服务商，并把结果保存为可以复用的素材。`,
      },
      {
        question: "MCP 服务器能编辑视频时间线，而不只是生成片段吗？",
        answer:
          "能。通过 NodeTool 的 MCP 服务器，智能体可以创建和编辑故事板和时间线，渲染画面检查剪辑，并渲染最终视频。时间线可以在 NodeTool Studio 中打开继续编辑。",
      },
      {
        question: "这和 ComfyUI 的 MCP 服务器有什么不同？",
        answer:
          "ComfyUI 的 MCP 服务器运行 ComfyUI 工作流。NodeTool 的服务器还给智能体提供可以工作的可编辑文档，例如故事板、时间线、草图和游戏，并且既能调用托管服务商，也能调用本地模型。",
      },
      {
        question: "需要桌面应用吗？",
        answer:
          "不需要。没有运行中的经典 API 服务器时，nodetool-mcp serve 会独立运行。打开 Studio 时，请求会发给它，你可以在编辑器里看到智能体的修改。",
      },
      {
        question: "能在脚本或 CI 中使用吗？",
        answer:
          "能。除了 MCP，nodetool CLI 可以在终端运行工作流和生成任务，服务器也提供运行工作流的 REST 接口。详见开发者页面。",
      },
    ],
  },
  readMore: {
    heading: "延伸阅读",
    links: [
      { label: "MCP 服务器指南", href: "https://docs.nodetool.ai/mcp-server" },
      { label: "智能体：开源创作框架", href: "/agents" },
      { label: "节点工作流", href: "/node-based-workflows" },
      { label: "开发者页面：CLI、REST 和自托管", href: "/developers" },
      { label: "AI 视频编辑器", href: "/ai-video-editor" },
      { label: "npm 上的软件包", href: "https://www.npmjs.com/package/@nodetool-ai/cli-mcp" },
    ],
  },
  closing: {
    title: "一条命令接入。",
    body: `运行 ${INSTALL}，重启你的客户端，然后让它使用 NodeTool。想在编辑器里看智能体的修改，就同时打开 Studio。`,
  },
};
