import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /gamedev (app/gamedev/page.tsx, data/gamedevPage.ts). The example game player is left out, the hero shows a game poster. */
export const gamedev: LocalizedPageContent = {
  route: "/gamedev",
  name: "游戏开发",
  title: "开源 AI 游戏引擎 | 智能体做游戏，你继续编辑 · NodeTool",
  description:
    "面向 AI 智能体的开源 2D 和 3D 游戏引擎。Claude Code 或内置智能体搭建并试玩游戏，你来编辑，并导出为网页版。",
  hero: {
    kicker: "开源 AI 游戏引擎",
    h1: "让智能体做游戏。你继续编辑。",
    lead: "智能体通过经过检查的编辑搭建 2D 和 3D 关卡、脚本、美术和音效，然后以无界面方式试玩。你在游戏编辑器中打开同一个游戏，修改任何内容，并导出独立的网页版或桌面版。",
    primary: { label: "下载 Studio", href: "/download" },
    media: {
      kind: "image",
      src: "/games/kindle/poster.jpg",
      width: 1280,
      height: 720,
      alt: "Kindle，一款用 NodeTool 制作的平台冒险游戏",
    },
  },
  sections: [
    {
      kind: "steps",
      id: "agent",
      title: "智能体能做什么",
      intro: "内置智能体和外部智能体使用同一套游戏工具。每个工具修改或检查的，都是你在编辑器中打开的同一个游戏。",
      steps: [
        { title: "开始做游戏", meta: "create_native_game", body: "在你的项目中创建一个 2D 俯视角房间，或一个 3D 探索白模。智能体也可以安装一个示例游戏，在它的基础上继续做。" },
        { title: "编辑场景、实体和脚本", meta: "edit_native_game", body: "一次应用一组编辑：场景、实体、组件、脚本、输入绑定、HUD、混音和动画图。引擎会检查每一项编辑，无效的编辑会被拒绝，不会保存。" },
        { title: "制作美术和音效", meta: "generate_game_asset", body: "生成或导入精灵、精灵表、图块集、音乐、音效、语音、字体和 3D 模型，为引擎做好处理，并绑定到游戏中。生成使用你自己的服务商账号。" },
        { title: "先于你试玩", meta: "playtest_native_game", body: "用录制的输入和断言以无界面方式运行游戏，最多 18,000 个 tick。在 2D 游戏中，autoplay_native_game 会搜索通往终点的路线。" },
        { title: "查看结果", meta: "capture_native_game_frame", body: "渲染画面或联系表供智能体查看，这样它既检查关卡的玩法，也检查关卡的样子。" },
        { title: "构建", meta: "build_native_game", body: "生成独立的网页播放器或桌面应用工程。publish_native_game 保存一个修订版本，只有你提出要求时智能体才会发布。" },
      ],
    },
    {
      kind: "cards",
      id: "assets",
      title: "游戏资源，直接装进游戏",
      intro: "智能体制作游戏的美术和音效，并把每一项装到游戏使用它的位置。生成使用你自己的服务商账号，你也可以导入已有的文件。",
      cards: [
        { title: "精灵和精灵表", body: "生成或导入的图像会被切成对齐的精灵表，帧会绑定到游戏中。" },
        { title: "图块集", body: "图像会被处理成边缘图块集。" },
        { title: "调色", body: "图像会被处理成调色 LUT，这是一种渲染效果，用来设定游戏的色调。" },
        { title: "语音、音乐和音效", body: "对白来自语音模型，音乐来自音乐模型，音效来自你选择的音效节点。" },
        { title: "字体", body: "导入 TTF 或 OTF 文件，用于 HUD 和文字。" },
        { title: "3D 模型和碰撞体", body: "用服务商节点生成模型，或导入你自己的 glTF 或 GLB。每个 3D 结果都是一个候选项，由你或智能体有意识地安装。" },
      ],
      note: "每个资源都绑定到一个命名的槽位，所以智能体可以只重新生成一个槽位而不影响其余部分。它也可以先暂存一个 2D 候选项，比较之后再安装。独立的游戏资源生成器专注于制作资源，而 NodeTool 也制作资源，并把每一项放进你可以试玩、测试和编辑的游戏里。制作预告片时，智能体最多从游戏中截取八张静帧，并可以和生成的片段一起放到时间线上剪辑。它不录制游戏玩法视频。",
    },
    {
      kind: "text",
      id: "game-editor",
      title: "在玩的地方编辑关卡",
      body: ["游戏编辑器把每个游戏打开在自己的标签页中。同一个编辑器可以制作 2D 和 3D 游戏。"],
      bullets: [
        "场景树、视口和检查器。选中关卡中的任何对象，在侧边栏修改它的组件和行为。",
        "移动、旋转和缩放控制柄、吸附，以及 3D 中的飞行相机。",
        "带引擎脚本 API 类型提示的脚本编辑器。游戏运行时，脚本修改会重新加载。",
        "资源、控制台、性能分析和动画面板。",
        "“更改”面板列出智能体编辑了什么，每条聊天消息都可以撤销。",
        "不离开标签页就能播放、暂停、单步和保存游玩状态。",
      ],
      links: [{ label: "阅读游戏编辑器指南", href: "https://docs.nodetool.ai/game-editor" }],
      media: {
        kind: "image",
        src: "/surface-game-poster.webp",
        width: 1920,
        height: 1080,
        alt: "打开了 Kindle 的 NodeTool 游戏编辑器：场景树、关卡和检查器",
      },
    },
    {
      kind: "text",
      id: "mcp",
      title: "用 Claude Code 或 Codex 来做",
      body: [
        "一条命令就能把 NodeTool 注册为 Claude Code、Codex 和 OpenCode 中的 MCP 服务器。使用 Cursor 或其他 MCP 客户端时，nodetool-mcp config 会打印要粘贴的配置块。桌面应用不是必需的。",
        "你的智能体在 execute_code 中调用游戏工具，execute_code 是 NodeTool 的沙盒动作工具，并用 view_image 查看截取的画面。引擎的技能，例如 native-game 和 game-direction，会在 Claude Code 中显示为斜杠命令，智能体因此可以在第一次编辑之前加载引擎的规则。它做出的游戏和其他游戏一样，在游戏编辑器中打开。",
        "同一连接下的图像、视频和工作流见开发者页面，所有选项见 MCP 服务器指南。",
      ],
      code: "npx -y --package=@nodetool-ai/cli-mcp nodetool-mcp install",
      links: [
        { label: "开发者页面", href: "/developers" },
        { label: "MCP 服务器指南", href: "https://docs.nodetool.ai/mcp-server" },
      ],
    },
    {
      kind: "table",
      id: "engine",
      title: "引擎里有什么",
      intro: "一个游戏就是一份 JSON 文档，有可编辑的草稿和已发布的修订版本。游戏从头到尾要么是 2D，要么是 3D。模拟以固定步长运行，随机数带种子，所以试玩或回放每次结果都相同。",
      head: ["功能", "2D 游戏", "3D 游戏"],
      rows: [
        ["渲染", "Canvas 2D 或 WebGPU", "WebGL2 上的 Three.js"],
        ["物理", "静态和运动学刚体、传感器、单向图块、移动平台、平台跳跃用的重力", "Rapier：静态、运动学和动态刚体，角色控制器，16 个碰撞层，物理材质"],
        ["脚本", "QuickJS 沙盒中的 JavaScript，带生命周期钩子、计时器和事件", "相同"],
        ["输入", "键盘、鼠标、手柄和屏幕触控", "相同，另有轴输入和相机视角"],
        ["音频", "音乐、音效、混音总线、闪避、空间音频", "相同"],
        ["动画", "精灵片段和可视化动画轨道", "glTF 片段和带混合空间的动画图"],
        ["画面", "2D 灯光、视差、粒子、泛光、调色", "灯光、阴影、天空、雾、贴花、粒子、后期处理"],
        ["导出", "网页播放器、桌面应用工程", "网页播放器（需要 WebGL2）、桌面应用工程"],
      ],
    },
    {
      kind: "text",
      id: "limits",
      title: "目前还做不到的",
      body: [
        "如果你要做商业主机或移动端发行、大型开放世界或联网游戏，请使用 Unity、Unreal、Godot 或 Roblox Studio。NodeTool 适合这样的场景：你希望智能体搭建并测试一个小型网页或桌面游戏，而你继续编辑它。",
      ],
      bullets: [
        "不支持 iOS、Android 或主机导出。游戏可导出为网页版，以及适用于 Windows、macOS 和 Linux 的桌面应用。",
        "不支持多人联机或网络。游戏脚本没有网络或文件访问权限。",
        "2D 物理没有动态刚体、摩擦或弹性。需要物理驱动的玩法请使用 3D。",
        "没有导航网格、地形流式加载、载具、布娃娃、重定向或根运动。",
        "3D 暂时还不能渲染自定义着色器、HDRI 光照或独立的贴图槽位。GLB 模型内嵌的贴图可以渲染。",
        "单个脚本上限 16,384 个字符，每个 tick 最多 64 条命令和 50 毫秒。",
        "3D 编辑器缺少一些 2D 工具，例如复制粘贴、场景树搜索和拖动嵌套。自动试玩只支持 2D。",
      ],
      links: [{ label: "对比 AI 游戏引擎", href: "/gamedev/ai-game-engines" }],
    },
  ],
  faq: {
    heading: "关于用 AI 做游戏的问题",
    items: [
      {
        question: "AI 智能体能在 NodeTool 中做出可玩的游戏吗？",
        answer: "能。智能体创建游戏，通过经过检查的操作编辑，生成并安装美术和音效，并在你试玩之前以无界面方式试玩。",
      },
      {
        question: "Claude Code 能在 NodeTool 中做游戏吗？",
        answer: "能。用上面的命令把 NodeTool 注册为 MCP 服务器。Claude Code、Codex 和 OpenCode 会得到与内置智能体相同的经过验证的游戏工具、画面截取和引擎技能，做出的游戏在游戏编辑器中打开。",
      },
      {
        question: "智能体做完之后，我还能编辑游戏吗？",
        answer: "能。智能体和游戏编辑器修改的是同一份游戏文档。打开它，选中任何对象，修改设置、编辑脚本，然后点击播放。“更改”面板列出智能体的编辑，每条消息都可以撤销。",
      },
      {
        question: "NodeTool 能取代 Unity、Godot 或 Unreal 吗？",
        answer: "不能。那些引擎可以导出到移动端和主机，支持多人联机，工具集和社区也大得多。NodeTool 是一个为智能体创作而做的小型引擎：智能体编辑经过验证的游戏文档，以无界面方式测试，并留给你一个可编辑的网页或桌面项目。",
      },
      {
        question: "可以导出到哪些平台？",
        answer: "一个通过 HTTPS 或 localhost 提供的独立网页播放器，以及一个 Tauri 桌面应用工程，你可以在 Windows、macOS 或 Linux 上用 Rust 编译。编辑器导出最近一次发布的修订版本。不支持 iOS、Android 或主机导出。",
      },
      {
        question: "NodeTool 能做 3D 游戏吗？",
        answer: "能。3D 游戏使用 WebGL2 上的 Three.js 和 Rapier 物理，带角色控制器、动画图、灯光、阴影和雾。它们面向桌面浏览器和桌面应用。一个游戏要么是 2D，要么是 3D，不能两者兼有。",
      },
      {
        question: "要花多少钱？",
        answer: "NodeTool Studio 免费开源。玩游戏和编辑游戏不需要 API 密钥。生成新的美术、音乐或音效会调用你接入的服务商，由服务商按自己的价格向你收费。",
      },
      {
        question: "游戏脚本用什么语言写？",
        answer: "JavaScript。脚本在 QuickJS 沙盒中运行，带有 onStart、onUpdate 等生命周期钩子、计时器、类型化事件和玩家存档。脚本返回状态和命令，这让每次运行都是确定的，可以回放。",
      },
    ],
  },
  readMore: {
    heading: "延伸阅读",
    links: [
      { label: "对比 AI 游戏引擎", href: "/gamedev/ai-game-engines" },
      { label: "游戏编辑器指南", href: "https://docs.nodetool.ai/game-editor" },
      { label: "原生游戏引擎参考", href: "https://docs.nodetool.ai/game-engine/" },
      { label: "智能体如何制作游戏", href: "https://docs.nodetool.ai/developer/creative-agent-tools#games" },
      { label: "MCP 服务器设置", href: "https://docs.nodetool.ai/mcp-server" },
      { label: "GitHub 上的引擎源码", href: "https://github.com/nodetool-ai/nodetool/tree/main/packages/game-runtime" },
    ],
  },
  closing: {
    title: "游戏始终可编辑。",
    body: "Studio 免费开源。你的游戏始终可以编辑。想生成新的资源时，接入你自己的模型服务商即可。",
    primary: { label: "下载 Studio", href: "/download" },
  },
};
