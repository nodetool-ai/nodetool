import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /recipes (app/recipes/page.tsx). */
export const recipes: LocalizedPageContent = {
  route: "/recipes",
  name: "分步教程",
  title: "分步教程 | 从一个想法开始，一步步做出来 · NodeTool",
  description:
    "选择你想做的东西，跟着故事板或剧本指南一步步完成，检查每个部分，并在编辑器中继续修改。营销套件、UGC 视频、产品广告片、多语言视频、产品目录和预告片。",
  hero: {
    kicker: "分步教程",
    h1: "从一个想法开始。一步一步做出来。",
    lead: "选择你想做的东西。跟着故事板或剧本指南走，检查每个部分，然后在编辑器里继续打磨。",
    secondary: { label: "浏览教程", href: "#recipes" },
  },
  sections: [
    {
      kind: "catalog",
      id: "recipes",
      title: "每个教程都是一个真实跑过的项目。",
      intro: "点开任何一个，查看每一步和它跑出来的结果。",
      source: "recipes",
    },
    {
      kind: "text",
      id: "editable",
      title: "每个部分都保持可编辑。",
      body: [
        "用实体保持角色和产品一致。在故事板中检查画面，逐句调整剧本，最后在时间线上把一切合在一起。",
      ],
      links: [
        { label: "浏览带每个镜头的示例故事板", href: "/storyboards" },
        { label: "从可编辑的视频广告模板开始", href: "/ad-library" },
      ],
    },
  ],
  readMore: {
    heading: "延伸阅读",
    links: [
      { label: "工作流模板", href: "/templates" },
      { label: "广告模板库", href: "/ad-library" },
    ],
  },
  closing: {
    title: "导入一个教程，读一遍，再运行。",
    body: "下载免费开源的 Studio。每个教程都可以作为一个文件导入，想运行时再添加你的服务商密钥。",
  },
};
