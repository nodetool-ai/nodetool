import type { LocalizedPageContent } from "@/i18n/content";
import { CN_PROVIDERS, LOCAL_RUNTIMES } from "../shared";

/** Translates /agents (app/agents/page.tsx, data/agentsPage.ts). */
export const agents: LocalizedPageContent = {
  route: "/agents",
  name: "智能体",
  title: "NodeTool 智能体 | 开源创作框架，给智能体创作工具",
  description:
    "给 AI 智能体创建和编辑图像、视频、音频和工作流的工具。使用 NodeTool 内置智能体，或通过 MCP 连接 Claude Code、Codex 或 Cursor。检查它的每一步，随时接手。",
  hero: {
    kicker: "开源创作框架",
    h1: "给你的智能体一套创作工具。",
    lead: "让智能体获得创建和编辑图像、视频、音频和工作流的工具。使用 NodeTool 内置的智能体，或通过 MCP 连接 Claude Code、Codex 或 Cursor。检查它做了什么，需要时随时接手。",
    note: `AGPL-3.0 开源 · 你的模型和密钥 · MCP、CLI 和 API。内置智能体可以使用 ${CN_PROVIDERS} 的 API 密钥，或本地模型运行。`,
    secondary: { label: "连接你的智能体", href: "/mcp" },
    media: {
      kind: "reel",
      base: "/agent-redo",
      alt: "智能体渲染一个六镜头故事板。一句修改意见把第 3 个镜头改成夜景，只有这个镜头重新渲染，时间线剪辑换上新的一条。",
    },
  },
  sections: [
    {
      kind: "steps",
      id: "loop",
      title: "搭建、检查、运行、查看、修复。",
      intro: "下面的工具名称就是 NodeTool MCP 服务器提供给智能体的工具。",
      steps: [
        { title: "搭建", meta: "create_workflow", body: "智能体添加节点、选择模型、连接节点图。保存工作流之前，它会检查所选的服务商和模型是否存在。" },
        { title: "检查", meta: "validate_workflow", body: "在调用任何模型之前，先检查工作流中的错误。" },
        { title: "运行", meta: "run_workflow", body: "用本地模型或你的服务商账号运行工作流。缺少 API 密钥会在开始前提示。" },
        { title: "查看", meta: "get_job_logs", body: "每次工具调用、输出和错误都记录在日志里，并标明出错的节点。" },
        { title: "修复", meta: "create_workflow_version", body: "智能体把修改保存为新版本，你随时可以回到上一个版本。" },
      ],
    },
    {
      kind: "text",
      id: "validate",
      title: "validate_workflow 会报告什么。",
      body: ["在付费运行之前，检查会找出这些问题："],
      bullets: [
        "未知的节点类型",
        "留空的必填属性，以及从未选择的模型",
        "所选服务商并不提供的模型 ID",
        "类型不匹配或不通向任何地方的连线",
        "无法解析、读取未定义名称或没有设置输出的代码节点",
        "本机找不到的服务商密钥",
      ],
      links: [{ label: "连接 Claude Code、Codex 或 Cursor 只需一条命令", href: "/mcp" }],
    },
    {
      kind: "cards",
      id: "surfaces",
      title: "智能体能在这些编辑器里工作。",
      cards: [
        { title: "工作流", body: "连接节点、选择模型、检查节点图并运行。" },
        { title: "故事板", body: "把简报拆成镜头，为每个镜头渲染一帧。" },
        { title: "时间线", body: "摆放片段、修剪剪辑点并渲染成片。" },
        { title: "剧本", body: "起草场景并为台词配音。" },
        { title: "草图", body: "搭建分层图像，一次编辑一个图层。" },
        { title: "3D 场景", body: "摆放物体、灯光和材质，然后渲染场景。" },
        { title: "游戏", body: "摆放实体、编写行为、生成美术素材并试玩关卡。" },
        { title: "应用", body: "摆放控件、绑定到工作流，并检查应用能否运行。" },
      ],
    },
    {
      kind: "cards",
      id: "control",
      title: "你始终掌控。",
      cards: [
        { title: "完整记录", body: "阅读每次工具调用的参数、结果和错误，找到出错的那一步。" },
        { title: "随时接手", body: "停下智能体，自己修改一个节点，再把工作交还给它。它会读取你留下的节点图。" },
        { title: "你的密钥", body: "Studio 会提示你添加缺少的 API 密钥。不通过界面启动的运行，如果缺少必需的密钥，会报错停止。" },
      ],
    },
    {
      kind: "table",
      id: "modes",
      title: "决定智能体可以自主做多少。",
      intro: "每个对话都有一个权限模式。读取和搜索在所有模式下都会运行，模式决定其余操作如何处理。",
      head: ["模式", "行为"],
      rows: [
        ["Plan（计划）", "智能体调查并提出计划，不执行任何操作。"],
        ["Default（默认）", "读取操作自动运行。每个会修改、生成或对外调用的操作，都要你批准后才运行。"],
        ["Auto（自动）", "智能体无需询问即可工作。每次工具调用仍然写入日志。"],
      ],
    },
    {
      kind: "table",
      id: "specs",
      title: "规格",
      head: ["项目", "说明"],
      rows: [
        ["模型", `托管模型使用你自己的密钥，例如 ${CN_PROVIDERS}。本地模型通过 ${LOCAL_RUNTIMES} 运行。`],
        ["费用", "服务商官方价格。使用你的密钥时 NodeTool 不加任何费用。"],
        ["源代码", "开源，AGPL-3.0。项目是你硬盘上的文件。"],
      ],
    },
  ],
  faq: {
    heading: "动手之前的问题",
    items: [
      {
        question: "NodeTool 的“智能体优先”是什么意思？",
        answer:
          "智能体编辑的就是你在 NodeTool 中打开的项目，包括故事板、时间线和工作流。你可以查看它的工具调用、结果和错误，然后自己接手。外部编程智能体也可以通过 MCP 使用 NodeTool。",
      },
      {
        question: "什么是创作框架？",
        answer:
          "创作框架为 AI 智能体提供工具、编辑器、模型访问和操作记录。NodeTool 把这些提供给内置智能体，以及通过 MCP 连接的编程智能体。它们的工作保存为你可以编辑的项目和工作流。",
      },
      {
        question: "什么是规划型智能体？",
        answer:
          "规划型智能体接收一个目标，把它拆成步骤，为每一步选择模型或工具，按顺序完成并随时调整。在 NodeTool 中，智能体也是画布上的一个节点，它的结果会传给工作流的其余部分。",
      },
    ],
  },
  closing: {
    title: "让智能体搭建你的第一个工作流。",
    body: "下载 Studio，看智能体搭建一个你可以打开、修改并再次运行的工作流。",
    secondary: { label: "阅读智能体文档", href: "https://docs.nodetool.ai" },
  },
};
