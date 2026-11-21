import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /ai-video-editor (app/ai-video-editor/page.tsx, data/videoEditorPage.ts). */
export const aiVideoEditor: LocalizedPageContent = {
  route: "/ai-video-editor",
  name: "AI 视频编辑器",
  title: "开源 AI 视频编辑器 | 智能体剪辑，你继续编辑 · NodeTool",
  description:
    "智能体搭建故事板，用你选的视频模型生成镜头，并组装多轨时间线。你打开同一条时间线换一条素材、修剪剪辑点，或只重新生成一个镜头。",
  hero: {
    kicker: "开源 AI 视频编辑器",
    h1: "智能体完成剪辑。你继续编辑。",
    lead: "智能体搭建故事板，用你选择的视频模型生成镜头，并组装成多轨时间线。你打开同一条时间线，换一条素材、修剪剪辑点，或者只重新生成一个镜头，不用重新渲染其余部分。",
    secondary: { label: "观看用 NodeTool 制作的影片", href: "/storyboards" },
    media: {
      kind: "reel",
      base: "/hero-flow",
      alt: "NodeTool：一句话变成节拍表、角色、由静帧和片段组成的故事板，以及完成的剪辑",
    },
  },
  sections: [
    {
      kind: "steps",
      id: "brief-to-cut",
      title: "从简报到成片。",
      intro: "每一步都会留下一个你可以打开的文档。智能体可以跑完全程，你也可以在任何一步接手。",
      steps: [
        { title: "规划镜头", body: "故事板包含场景和镜头，每个镜头都有机位、提示词和时长。智能体可以根据简报或剧本写出故事板，你可以在板上编辑任何镜头。" },
        { title: "保持角色一致", body: "把角色、场景、风格和产品保存为实体，每个实体带一张参考图和一段描述，在多个镜头中复用。" },
        { title: "先渲染静帧，再渲染片段", body: "先用便宜的静帧确定构图和角色，再为视频付费，只把通过的镜头用图生视频模型动起来。可以比较多条素材，随时回到更早的版本。" },
        { title: "为剧本配音", body: "为剧本生成对白。修改一句台词时，只重新生成这一句的配音。" },
        { title: "剪辑时间线", body: "“创建时间线”把故事板和配好音的剧本变成多轨序列。之后就是正常的剪辑：修剪、转场、标题、字幕、音乐和关键帧。" },
        { title: "改尺寸并导出", body: "生成 9:16、1:1 和 4:5 版本，然后导出成片，或保存一个以后可以重新打开的 NodeTool 项目。" },
      ],
    },
    {
      kind: "text",
      id: "timeline",
      title: "真正的多轨时间线。",
      body: ["生成的片段始终绑定在生成它的工作流上。修改一个设置，只有这个片段会被标记为需要重新生成，并保留它之前的版本。"],
      bullets: [
        "视频、音频、叠加、字幕和 MIDI 轨道。",
        "图像、视频、音频、文字、形状、3D 模型、编组和调整片段。",
        "修剪、分割、波纹和滚动编辑，三种放置模式，吸附、标记和 J/K/L 穿梭。支持 NodeTool、Premiere Pro 和 Final Cut Pro 的键盘布局。",
        "12 种转场，包括交叉淡化、擦除、推移、缩放、甩镜、故障、光圈和漏光。",
        "文字和字幕样式、字幕轨、运动预设、关键帧、变速和时间重映射。",
        "片段效果，如调色、模糊、发光、抠像、曲线、LUT 和颗粒，以及音频增益、均衡和压缩。",
      ],
      links: [{ label: "阅读视频编辑器指南", href: "https://docs.nodetool.ai/video-editor" }],
    },
    {
      kind: "cards",
      id: "mcp-tools",
      title: "让 Claude Code 或 Codex 剪辑视频。",
      intro: "内置智能体和外部智能体使用同一套工具。通过 NodeTool MCP 服务器连接你的智能体。",
      cards: [
        { title: "编写故事板", meta: "create_storyboard, edit_storyboard", body: "编写和修改故事板：场景、镜头、机位、风格和角色。" },
        { title: "渲染镜头", meta: "render_storyboard_stills, render_storyboard_clips", body: "用你指定的模型渲染还需要渲染的镜头，或只渲染过期的镜头。" },
        { title: "配音", meta: "voice_script_lines", body: "为每句草稿或过期的台词配音，每句可用不同的声音。" },
        { title: "组装时间线", meta: "assemble_storyboard_timeline", body: "把渲染好的片段变成一条保存的时间线。" },
        { title: "编辑时间线", meta: "edit_timeline", body: "一次经过检查的编辑，修改片段、轨道、文字、效果和时间。" },
        { title: "查看并渲染", meta: "preview_timeline_frame, render_timeline", body: "渲染合成后的画面让智能体查看结果，再把成片渲染为 MP4、WebM、ProRes MOV 或 PNG 序列。" },
      ],
    },
    {
      kind: "table",
      id: "export",
      title: "导出",
      head: ["方式", "说明"],
      rows: [
        ["画面比例", "把序列改成 9:16、1:1 或 4:5。导出前检查每个版本的构图。"],
        ["浏览器导出", "MP4（H.264）、WebM（VP9，可带透明通道）或 PNG 序列，用 WebCodecs 在浏览器中编码。MP4 需要浏览器支持 H.264 编码。"],
        ["服务器渲染", "MP4、WebM、MOV（ProRes）或 PNG 序列，可以在编辑器中或用 render_timeline 渲染。"],
        ["Premiere Pro 项目交接（开发中）", "导出 FCP7 XML 和媒体，在 Premiere Pro 中继续编辑。支持不完整，不是原生 .prproj 导出。标题、效果和转场可能需要重建。"],
        ["NodeTool 项目文件", "把时间线导出为项目 zip，或把整个项目导出为一个 .nodetool-project 文件。"],
      ],
      note: "还做不到的：导出界面暂不支持 Final Cut Pro 和 DaVinci Resolve 交接。引导式视频和故事板流程不生成出镜说话。口型同步对白需要智能体、角色实体、源人脸视频和支持口型同步的模型。没有 WebGPU 时，预览会跳过抠像、暗角和锐化。NodeTool 适合用生成镜头制作的短片、广告、预告片和解说视频。长片剪辑和精修请使用专业剪辑软件。",
    },
    {
      kind: "catalog",
      id: "films",
      kicker: "示例故事板",
      title: "用 NodeTool 制作的影片",
      intro: "每个页面先展示成片，再列出每个镜头的机位和导演说明。",
      source: "storyboards",
      slugs: ["duel-in-the-wheat", "the-long-hallway", "mars-greenhouse"],
      link: { label: "全部故事板", href: "/storyboards" },
    },
  ],
  faq: {
    heading: "关于 AI 视频剪辑的问题",
    items: [
      {
        question: "有能保留可编辑项目的 AI 视频编辑器吗？",
        answer:
          "有。在 NodeTool 中，智能体写的故事板、剧本和时间线就是你打开编辑的文档。换一条素材、修剪片段、改一句台词或重新生成一个镜头，剪辑的其余部分保持原样。",
      },
      {
        question: "AI 智能体能从故事板一路做到成片吗？",
        answer:
          "能。在 NodeTool 中，智能体根据简报写故事板，渲染每个镜头，把片段组装到时间线上并渲染成片。每一步都会留下一个你可以打开和修改的文档，你可以随时接手。",
      },
      {
        question: "Claude Code 能编辑视频时间线吗？",
        answer:
          "能。运行 npx -y --package=@nodetool-ai/cli-mcp nodetool-mcp install 把 NodeTool 添加为 MCP 服务器。之后 Claude Code 就能创建故事板、渲染镜头、为剧本配音，用 edit_timeline 编辑时间线，用 preview_timeline_frame 查看画面，用 render_timeline 渲染成片。这条时间线和其他时间线一样可以在 Studio 中打开。",
      },
      {
        question: "支持哪些视频模型？",
        answer:
          "Veo、可灵、Seedance、Sora、海螺、通义万相 Wan 等，通过 fal.ai、Replicate、Kie.ai 等服务商调用，使用你自己的密钥。Wan 也可以通过阿里云百炼调用。你可以按故事板或按镜头选择模型，换模型不用换工具。",
      },
      {
        question: "怎样让同一个角色出现在多个镜头里？",
        answer:
          "创建一个带参考图和描述的角色实体，然后在故事板上指定它。用到这个角色的每个镜头都会得到同样的描述，支持参考图的模型还会收到这张图。",
      },
      {
        question: "能只改一个镜头，而不重新生成整段视频吗？",
        answer:
          "能。每个镜头单独渲染并保留自己的多条素材。重新生成或修改一个镜头，选择你要的那一条，时间线就会使用它。修改工作流设置时，只有受影响的片段会被标记。",
      },
      {
        question: "它能取代 Premiere Pro 或 DaVinci Resolve 吗？",
        answer:
          "不能。NodeTool 覆盖生成、组装和适合短片的多轨剪辑。长片剪辑、调色和精修请使用专业剪辑软件。Premiere Pro XML 交接不完整，可能需要重建不支持的元素。",
      },
    ],
  },
  closing: {
    title: "接入你已经在用的视频模型。",
    body: "Studio 免费开源。接入你已经付费的视频模型，每个项目都保持可编辑。",
  },
};
