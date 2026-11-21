import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /ad-library (app/ad-library/page.tsx, components/adLibrary). */
export const adLibrary: LocalizedPageContent = {
  route: "/ad-library",
  name: "广告模板库",
  title: "视频广告模板 | 可编辑的社交媒体短广告 · NodeTool",
  description:
    "用于社交媒体短广告的可编辑视频广告模板。每个模板按节拍设定时长、构图、文案字数和素材，并在 NodeTool 中作为一个小应用，用你的图片、标志和文案生成竖版广告。",
  hero: {
    kicker: "视频广告模板",
    h1: "想法清楚，广告才值得做。",
    lead: "{adCount} 个用于社交媒体短广告的可编辑视频广告模板。每个模板按节拍设定时长、构图、文案字数限制和素材，并在 NodeTool 中作为一个小应用提供，用你的图片、标志和文案生成竖版广告。",
    note: "{adCount} 个模板 · 8 到 15 秒 · 9:16、4:5、1:1",
    secondary: { label: "浏览模板", href: "#concepts" },
  },
  sections: [
    {
      kind: "catalog",
      id: "concepts",
      title: "选一个模板。",
      intro: "每个模板都按它的节拍时长播放一条渲染好的 NodeTool 时间线。品牌、文案和数字都是虚构的。",
      source: "adLibrary",
    },
    {
      kind: "text",
      id: "more",
      title: "想看每一步都展示出来的完整项目？",
      body: ["看看分步教程，或者带每个镜头的示例 AI 故事板。"],
      links: [
        { label: "分步教程", href: "/recipes" },
        { label: "示例故事板", href: "/storyboards" },
      ],
    },
  ],
  closing: {
    title: "用你自己的素材做一支竖版广告。",
    body: "下载免费开源的 Studio，打开一个广告模板，换上你的图片、标志和文案。",
  },
};
