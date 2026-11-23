import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /storyboards (app/storyboards/page.tsx, data/storyboards.ts). */
export const storyboards: LocalizedPageContent = {
  route: "/storyboards",
  name: "故事板",
  title: "AI 故事板生成器 | 先看成片，再看每个镜头 · NodeTool",
  description:
    "NodeTool 是开源的 AI 故事板生成器。它把简报拆成场景和镜头，为每个镜头渲染静帧和片段，并组装成可编辑的时间线。这里的每部短片都附带它背后的故事板。",
  hero: {
    kicker: "AI 故事板生成器",
    h1: "先看成片，再看每一个镜头。",
    lead: "NodeTool 是开源的 AI 故事板生成器。它把一份简报拆成场景和镜头，为每个镜头渲染一张静帧和一段片段，再组装成你可以编辑的时间线。这里有 {storyboardCount} 部短片，每一部都附带它背后的故事板，列出每个镜头的机位、时长和导演说明。在 NodeTool 中打开任何一部，就能修改其中的镜头。",
    note: "{storyboardCount} 部影片 · 10 到 15 秒 · 16:9、9:16、21:9",
    secondary: { label: "浏览影片", href: "#films" },
  },
  sections: [
    {
      kind: "steps",
      id: "editor",
      title: "故事板编辑器能做什么。",
      intro: "内置智能体可以替你跑完每一步，也可以在板上和你一起工作。渲染使用你自己的服务商密钥。",
      steps: [
        { title: "写简报", body: "用一两句话写下这部片子，加上风格和实体，然后点击“导演”。剧本模型会写出场景和镜头。" },
        { title: "渲染每个镜头", body: "为整个故事板或单个镜头渲染静帧和片段，模型由你选择，确认前会显示预估价格。" },
        { title: "保留每一条素材", body: "每次渲染都会新增一条素材。选择当前使用的一条，用提示词修改静帧，涂抹需要修改的区域，放大或重新构图。" },
        { title: "剪辑时间线", body: "“创建时间线”把当前的静帧和片段放进时间线，你可以修剪、分割并导出。" },
      ],
      links: [
        { label: "AI 视频编辑器", href: "/ai-video-editor" },
        { label: "故事板编辑器指南", href: "https://docs.nodetool.ai/storyboard-editor" },
      ],
    },
    {
      kind: "text",
      id: "cost",
      title: "先审批静帧，再为片段付费。",
      body: [
        "先用静帧试角色和机位，再在视频上花钱。在 Kie.ai 上，一张 {stillModel} 静帧要 {stillPrice}，五秒 {clipModel} 视频要 {clipPrice}。只有你审批通过的镜头才会变成片段。",
      ],
    },
    {
      kind: "catalog",
      id: "films",
      title: "{storyboardCount} 部影片和它们的故事板",
      intro: "点开任何一部，先看成片，再看每个镜头的机位和导演说明。",
      source: "storyboards",
    },
  ],
  faq: {
    heading: "AI 故事板生成器：常见问题",
    items: [
      {
        question: "NodeTool 的故事板生成器免费吗？",
        answer:
          "NodeTool 开源（AGPL-3.0），可以免费下载，支持 macOS、Windows 和 Linux。渲染使用你自己的服务商密钥，每张静帧和每段片段由你向模型服务商付费。确认前，渲染对话框会显示预估价格。",
      },
      {
        question: "怎样让同一个角色在多个镜头中保持一致？",
        answer:
          "把角色保存为实体，并把它挂到它出现的每个镜头上。实体可以是角色、场景、风格或道具，支持参考图的静帧模型会使用它们。如果你选的静帧模型不接受参考图，编辑器会在模型选择器下方显示警告。",
      },
      {
        question: "AI 故事板能变成视频吗？",
        answer:
          "能。每个镜头包含一张静帧和一段片段。“创建时间线”用当前的静帧和片段生成时间线，你可以在上面修剪、分割并导出影片。没有静帧或片段的镜头会被跳过。",
      },
      {
        question: "故事板支持哪些画面比例？",
        answer:
          "故事板可以是 16:9、9:16、1:1、4:3 或 21:9。每个镜头有自己的提示词、机位、运动和时长，所以改一个镜头不用重新渲染其他镜头。",
      },
      {
        question: "能导出故事板吗？",
        answer:
          "故事板菜单中的“下载 ZIP”会把故事板保存为 Markdown，并附带静帧和片段。“发送到工作流”会把同样的静帧和片段交给一个节点工作流。",
      },
    ],
  },
  closing: {
    title: "用一句话开始你的故事板。",
    body: "下载免费开源的 Studio，打开任何一部示例影片，修改其中的镜头。",
  },
};
