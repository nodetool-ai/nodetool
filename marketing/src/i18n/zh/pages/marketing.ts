import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /marketing (app/marketing/page.tsx, data/marketingPage.ts). */
export const marketing: LocalizedPageContent = {
  route: "/marketing",
  name: "广告营销",
  title: "AI 广告制作 | 开源 AI 广告软件 · NodeTool",
  description:
    "NodeTool 是开源的 AI 广告软件。给智能体一张产品图和一份简报，它会为广告画故事板，用你的服务商密钥渲染静帧和片段，并剪成一条你可以编辑的时间线。",
  hero: {
    kicker: "广告与营销",
    h1: "用 AI 做广告。",
    lead: "NodeTool 是开源的 AI 广告软件。给智能体一张产品图和一份简报，它会为广告画故事板，用你的服务商密钥渲染静帧和片段，并剪成一条你可以编辑的时间线。",
    note: "{adCount} 个可以打开和编辑的示例广告 · 在你的密钥上运行 Flux、Veo、可灵和 Seedance",
    secondary: { label: "浏览广告模板库", href: "/ad-library" },
  },
  sections: [
    {
      kind: "catalog",
      id: "ads",
      title: "{adCount} 个广告模板中的 4 个，每一个都从可编辑的 NodeTool 时间线渲染。",
      intro: "品牌、文案和数字都是虚构的。",
      source: "adLibrary",
      slugs: ["kinetic-offer-wall", "benefit-led-dashboard-punch-in", "binary-choice-participation-card", "result-seen-through-the-product"],
      link: { label: "查看全部模板", href: "/ad-library" },
    },
    {
      kind: "steps",
      id: "campaign",
      title: "一份简报，一套营销素材，一次修改。",
      intro: "导演式营销套件教程中的一次真实运行。杯子是虚构的演示产品，发布前请把生成的产品造型和材质与真实品牌参考图核对。",
      steps: [
        { title: "主视觉，16:9", body: "GPT Image 2.5 根据简报渲染主视觉：水面上方的钴蓝色平台、琥珀色日出，左侧留出放文案的干净空间。" },
        { title: "社交 1:1 和快拍 9:16", body: "配套的编辑模型为每种尺寸重新构图，并被要求保留杯子、场景和调色。方图保留左上角的文案空间，快拍保留上方三分之一的空白。" },
        { title: "修改", body: "“把水花减少大约一半，把左侧干净的深蓝色文案空间加宽。”编辑模型被要求保留产品、场景、配色和机位，所以只有水花和文案空间变了。" },
      ],
      links: [{ label: "按步骤跟着做", href: "/recipes/directed-campaign-kit" }],
    },
    {
      kind: "cards",
      id: "more",
      title: "给广告团队的更多内容",
      cards: [
        { title: "广告模板库", body: "竖版短广告模板，每个都有节拍、时长、文案字数限制和一个渲染好的示例。", link: { label: "打开", href: "/ad-library" } },
        { title: "示例故事板", body: "完成的广告片，以及构成它们的每一个镜头。", link: { label: "打开", href: "/storyboards" } },
        { title: "分步教程", body: "营销套件、UGC 视频、产品广告片和产品目录图，一步一步来。", link: { label: "打开", href: "/recipes" } },
      ],
    },
  ],
  faq: {
    heading: "AI 广告创意：常见问题",
    items: [
      {
        question: "AI 能把产品照片变成视频广告吗？",
        answer:
          "能。在 NodeTool 中，你用产品照片把产品保存为实体，写一份简报，智能体会为广告画故事板。每个镜头先用你选的图像模型渲染静帧，再用视频模型渲染片段，“创建时间线”把它们组装成可以修剪和导出的剪辑。发布前请把生成的产品和真实产品对比。",
      },
      {
        question: "怎样为一支广告做 9:16、4:5 和 1:1 版本？",
        answer:
          "时间线菜单中的“改编尺寸”会用同样的素材为每种目标尺寸（9:16、1:1、4:5）生成新的序列，原剪辑保持不变。你可以选择居中裁切，或跟随被追踪主体重新构图，并设置安全边距。",
      },
      {
        question: "能把一支广告复用到产品目录中的其他产品吗？",
        answer:
          "能。Per-SKU Ad Factory 模板用 Recast Storyboard 节点把一个已通过的故事板复制到另一件产品上。提示词没有变化的画面都会保留，只有出现产品的镜头会重新渲染。",
      },
      {
        question: "在 NodeTool 中做 AI 广告创意要花多少钱？",
        answer: "NodeTool 免费开源。渲染使用你自己的服务商密钥，按服务商价格付费，确认前渲染对话框会显示预估价格。",
      },
      {
        question: "NodeTool 不能为广告主做什么？",
        answer:
          "它没有 AI 虚拟主播素材库，不预测广告效果，也不发布到广告平台。它制作创意：静帧、片段和一条可编辑的时间线，由你导出并自行上传。",
      },
    ],
  },
  closing: {
    title: "用你的下一个产品跑一遍这套流程。",
    body: "下载免费开源的工作室，支持 macOS、Windows 和 Linux，然后打开导演式营销套件。",
  },
};
