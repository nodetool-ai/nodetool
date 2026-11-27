import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /gamedev/ai-game-engines (app/gamedev/ai-game-engines/page.tsx, data/gameEngineComparison.ts). */
export const aiGameEngines: LocalizedPageContent = {
  route: "/gamedev/ai-game-engines",
  name: "AI 游戏引擎对比",
  title: "AI 游戏引擎对比：NodeTool、Unity、Godot、Roblox Studio · NodeTool",
  description:
    "AI 智能体如何在 NodeTool、Unity、Godot、Roblox Studio、Summer Engine 和 Rosebud 中做游戏，做完之后你能编辑什么，以及各自能导出到哪里。",
  hero: {
    kicker: "游戏开发",
    h1: "AI 游戏引擎对比",
    lead: "现在有好几个引擎可以让 AI 智能体做出可玩的游戏。它们在三点上不同，这三点决定哪个更合适：智能体如何连接，能否自己运行并检查游戏，以及智能体停下之后留给你的是什么。本页按这几点比较六个选项，包括 NodeTool 较弱的地方。",
    note: "其他产品的信息来自它们自己的页面，核对日期为 {gameSourcesChecked}。来源列在页面末尾。",
    secondary: { label: "游戏开发", href: "/gamedev" },
  },
  sections: [
    {
      kind: "table",
      id: "table",
      title: "并排对比",
      head: ["问题", "NodeTool", "Unity with Unity AI", "Godot with godot-mcp", "Roblox Studio", "Summer Engine", "Rosebud AI"],
      rows: [
        ["许可证", "开源，AGPL-3.0", "专有", "Godot 和 godot-mcp 都是 MIT", "专有", "免费的专有桌面应用，智能体工具是 MIT", "托管服务"],
        ["智能体如何连接", "内置智能体，或面向 Claude Code、Codex、OpenCode 和 Cursor 的 MCP 服务器", "Unity MCP Server，2026 年 5 月起公开测试，支持 Claude Code、Cursor、Windsurf、Claude Desktop、VS Code Copilot 等", "社区 MCP 服务器，可以启动编辑器、运行项目、创建场景和节点", "Studio 内置 MCP 服务器。Roblox 在 2026 年 4 月归档了更早的开源参考服务器", "内置 Summer Agent，或面向 Claude Code、Codex 和 Cursor 的 MCP 和 CLI", "根据文字描述直接生成"],
        ["智能体自己检查游戏", "以无界面方式试玩，带录制的输入和断言、画面截取，以及 2D 路线搜索", "读取场景层级、组件和控制台，并触发编辑器操作", "以调试模式运行项目并读取输出", "参考服务器可以启动播放模式并在其中运行脚本", "运行播放模式，帮助智能体检查错误", "你在浏览器中测试"],
        ["之后你编辑什么", "同一份游戏文档，在游戏编辑器中：场景树、检查器、脚本", "Unity 编辑器中的 Unity 项目", "Godot 编辑器中的 Godot 项目", "Studio 中的 Roblox 体验", "兼容 Godot 4 的场景和脚本", "在浏览器中编辑玩法、资源和 NPC 行为"],
        ["导出到", "网页播放器，以及适用于 Windows、macOS 和 Linux 的桌面应用工程", "桌面、移动、主机和网页", "桌面、移动和网页", "Roblox 平台", "Windows 和 macOS，然后发布到 Steam、itch.io 或你自己的网站", "可分享的浏览器链接"],
        ["需要什么", "免费。生成美术和音效使用你自己的服务商账号", "Unity 6、连接到 Unity Cloud 的项目，以及 Unity AI 试用或付费方案", "安装 Godot，MCP 服务器还需要 Node.js", "Roblox Studio", "桌面应用对本地项目免费。托管的 Summer AI 需要付费积分", "可免费试用。付费档包含商业使用权"],
      ],
    },
    {
      kind: "cards",
      id: "pick",
      title: "该选哪一个",
      cards: [
        { title: "NodeTool", body: "你希望智能体为网页或桌面构建并测试一个小型 2D 或 3D 游戏，在同一个地方生成美术和音效，并留给你一个可以继续编辑的开源项目。游戏只是包含视频、图像或故事板的更大项目的一部分时，它也适合。" },
        { title: "Unity", body: "你需要移动端或主机版本、庞大的资源生态，或者团队已经在用 Unity，并且接受专有引擎和 Unity AI 测试版的条款。" },
        { title: "Godot", body: "你想要功能完整的开源引擎，带移动端和网页导出，并且习惯通过社区 MCP 服务器来驱动它。" },
        { title: "Roblox Studio", body: "游戏要放在 Roblox 上，使用它的玩家、多人联机和经济系统。" },
        { title: "Summer Engine", body: "你想要一个 AI 优先的编辑器，项目保持与 Godot 4 兼容，并打算发布到 Steam 或 itch.io。" },
        { title: "Rosebud AI", body: "你想根据一段描述快速得到一个浏览器原型和一个可分享的链接，不用安装任何东西。" },
      ],
    },
    {
      kind: "text",
      id: "differs",
      title: "NodeTool 的不同之处",
      body: [],
      bullets: [
        "引擎是为智能体创作而写的。智能体通过类型化的操作修改经过验证的游戏文档，而不是编辑源文件然后指望它们能编译。",
        "运行是确定的，所以智能体的试玩和你的游玩表现一致，回放可以证明一个修复有效。",
        "资源生成是引擎工具的一部分：精灵、图块集、音乐、音效、语音和 3D 模型在一步之内生成、处理并绑定。",
        "同一个工作区里还有故事板、视频时间线、草图和工作流，所以游戏的预告片或商店图就在它旁边制作。",
      ],
    },
    {
      kind: "text",
      id: "gaps",
      title: "NodeTool 较弱的地方",
      body: [],
      bullets: [
        "不支持移动端、主机或多人联机。",
        "2D 物理没有动态刚体，3D 没有自定义着色器、导航网格或地形。",
        "生态小得多：没有资源商店、插件，也没有 Unity、Godot 或 Roblox 那样规模的社区教程。",
      ],
      links: [{ label: "试玩用 NodeTool 做的游戏", href: "/gamedev" }],
    },
    {
      kind: "text",
      id: "sources",
      title: "来源",
      body: [],
      links: [
        { label: "Unity: Unity's AI tools in beta, how to get started with MCP", href: "https://unity.com/en/blog/unity-ai-mcp-how-to-get-started" },
        { label: "godot-mcp in the Archestra MCP catalog", href: "https://archestra.ai/mcp-catalog/coding-solo__godot-mcp" },
        { label: "Roblox: studio-rust-mcp-server (archived)", href: "https://github.com/Roblox/studio-rust-mcp-server" },
        { label: "Summer Engine: best AI for game development", href: "https://www.summerengine.com/best-ai-for-game-development.md" },
        { label: "Summer Engine: how to make games in Claude Code", href: "https://www.summerengine.com/mcp/how-to-make-games-in-claude-code" },
        { label: "Rosebud AI vs Base44", href: "https://lab.rosebud.ai/blog/rosebud-ai-vs-base44-whats-the-best-way-to-build-a-video-game-with-ai" },
        { label: "NodeTool: Native Game Engine coverage", href: "https://docs.nodetool.ai/game-engine/" },
      ],
    },
  ],
  faq: {
    heading: "常见问题",
    items: [
      {
        question: "最好的开源 AI 游戏引擎是哪个？",
        answer: "取决于你要发布什么。Godot 是最完整的开源引擎，通过社区 MCP 服务器与智能体配合。NodeTool 是开源的，从一开始就为智能体而做，带无界面试玩和资源生成，但只能导出到网页和桌面。",
      },
      {
        question: "哪些游戏引擎支持 MCP？",
        answer: "在本页的引擎中：NodeTool 自带 MCP 服务器，Unity 有公开测试中的 MCP 服务器，Roblox Studio 内置一个，Godot 有社区 MCP 服务器，Summer Engine 提供面向 Claude Code、Codex 和 Cursor 的 MCP 设置文档。",
      },
      {
        question: "哪些游戏引擎有官方的 AI 智能体工具？",
        answer: "Unity 和 Roblox Studio 由厂商提供：Unity AI 搭配 2026 年 5 月起公开测试的 MCP 服务器，以及 Roblox Studio 内置的 MCP 服务器。NodeTool 和 Summer Engine 自带智能体，以及面向 Claude Code、Codex 和 Cursor 的 MCP 服务器。Godot 的智能体工具来自 godot-mcp 这类社区 MCP 服务器。",
      },
      {
        question: "AI 智能体能做出我可以继续编辑的游戏吗？",
        answer: "能。除纯浏览器生成器之外，这里的每个引擎都可以，前提是智能体在引擎自己的项目格式内工作。在 NodeTool 中，智能体和游戏编辑器修改同一份游戏文档，所以不需要导入或转换。",
      },
    ],
  },
  closing: {
    title: "做一个你可以继续编辑的游戏。",
    body: "Studio 免费开源。你的游戏始终可以编辑。想生成新的资源时，接入你自己的模型服务商即可。",
    primary: { label: "下载 Studio", href: "/download" },
    secondary: { label: "试玩用 NodeTool 做的游戏", href: "/gamedev" },
  },
};
