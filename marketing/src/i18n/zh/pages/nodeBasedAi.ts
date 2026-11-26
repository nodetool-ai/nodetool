import type { LocalizedPageContent } from "@/i18n/content";
import { OPEN_SOURCE_LINE } from "../shared";

/** Translates /node-based-ai (app/node-based-ai/page.tsx). */
export const nodeBasedAi: LocalizedPageContent = {
  route: "/node-based-ai",
  name: "节点式 AI",
  title: "节点式 AI：用节点搭建 AI 工作流 · NodeTool",
  description:
    "什么是节点式 AI，节点做什么，以及如何在可视化画布上搭建图像、视频、音频和文本工作流。NodeTool 是开源的节点式 AI 编辑器，使用你自己的密钥。",
  hero: {
    kicker: "节点式 AI",
    h1: "节点式 AI：用节点搭建工作流，而不是写提示词。",
    lead: "节点式 AI 是把 AI 工作搭成一张图：每个节点做一件事，连线在节点之间传递数据。你得到的不是一条提示词加一个答案，而是一个能看见、能改其中一步、能在新输入上重跑的工作流。NodeTool 是面向图像、视频、音频和文本的开源节点式 AI 编辑器，使用你自己的密钥，也可以完全离线运行本地模型。",
    note: OPEN_SOURCE_LINE,
    secondary: { label: "浏览工作流模板", href: "/templates" },
    media: {
      kind: "reel",
      base: "/hero-nodes",
      alt: "连接一个 NodeTool 工作流，一条类型不匹配的连线被拒绝，五个镜头经过 For Each、Text To Image、Image To Video、Collect 和 Concatenate Video 合成一个剪辑，然后更换图像模型",
      caption: "一个工作流，从连线到完成的剪辑。镜头来自 NodeTool 自带的 Under the Bed 示例。",
    },
  },
  sections: [
    {
      kind: "text",
      id: "what-is-a-node",
      title: "什么是节点？编辑器怎样才算节点式？",
      body: [
        "节点是一个带类型输入和输出的操作。文生图节点接收提示词，返回一张图像。放大节点接收一张图像，返回更大的图像。因为类型是声明好的，编辑器在运行之前就知道哪些节点可以连接，不用等到一次失败的运行才告诉你哪里错了。",
        "当图本身就是文档时，编辑器才算节点式。工作流不是你提过什么要求的记录，而是一个你可以保存、重跑、交给别人或当作 API 调用的文件。实际的区别在这里：提示词给你一个结果，图给你一个过程。想看一个搭好、检查并端到端运行的例子，见节点工作流页面。",
        "同样的词会被用来搜三件不同的事，所以先说明：本页讲的是可视化的图。如果你想找的是 Node.js 中的 AI，NodeTool 的后端运行在 Node 上，并提供 TypeScript SDK，开发者页面有相关内容。如果你从 ComfyUI 过来，ComfyUI 对比页是最直接的回答。如果你在比较托管的创意画布，请看 Figma Weave 替代方案，或原始的 Weavy 对比。",
      ],
      links: [
        { label: "NodeTool 中的节点工作流", href: "/node-based-workflows" },
        { label: "开发者页面", href: "/developers" },
        { label: "ComfyUI 对比", href: "/alternatives/comfyui" },
        { label: "Figma Weave 替代方案", href: "/alternatives/figma-weave" },
        { label: "Weavy 对比", href: "/alternatives/weavy" },
      ],
    },
    {
      kind: "cards",
      id: "build",
      title: "用 AI 节点能搭什么",
      cards: [
        {
          title: "图像生成",
          body: "把提示词接到模型，再接到放大、抠背景和合成节点。换模型节点，不用重搭周围的图。",
          link: { label: "查看做法", href: "/tasks/text-to-image" },
        },
        {
          title: "视频生成",
          body: "把一张静帧送进图生视频模型，在时间线上剪辑结果，加上配音轨并渲染。这是一张图，而不是四个工具。",
          link: { label: "查看做法", href: "/tasks/image-to-video" },
        },
        {
          title: "音频和语音",
          body: "文字转语音、转写、配乐和滤镜。音频节点在步骤之间传递真实的音频缓冲，不用经过文件选择器来回倒腾。",
          link: { label: "查看做法", href: "/tasks/text-to-speech" },
        },
        {
          title: "智能体和数据",
          body: "节点不只是模型。可以抓取网页、查询数据库、运行沙箱代码，或把一步交给会自己写操作的规划智能体。",
          link: { label: "查看做法", href: "/agents" },
        },
      ],
    },
  ],
  faq: {
    heading: "常见问题",
    items: [
      {
        question: "什么是节点式 AI？",
        answer:
          "节点式 AI 是把 AI 工作搭成一张图，而不是一条提示词。每个节点做一件事，比如加载图像、调用模型、剪一段片段、运行代码，连线把数据从一个节点送到下一个。你能看到每一步，修改其中一步，再重新运行，不必重做其余部分。",
      },
      {
        question: "AI 里的节点是什么？",
        answer:
          "节点是一个带类型输入和输出的操作。文生图节点接收提示词，返回图像，放大节点接收这张图像，返回更大的图像。因为类型是声明好的，编辑器能在运行之前告诉你哪些节点可以连在一起。",
      },
      {
        question: "节点式 AI 编辑器和聊天助手有什么不同？",
        answer:
          "聊天助手每一轮给出一个答案，产生它的步骤随后就没有了。节点图会保留这些步骤：同一个工作流可以在新输入上重跑，可以批量运行，也可以定时运行，你可以修改第三步而不碰第一步和第二步。",
      },
      {
        question: "有免费开源的节点式 AI 工具吗？",
        answer:
          "有。NodeTool 是开源的（AGPL-3.0），NodeTool Studio 可以在你自己的电脑上免费运行。你使用自己的服务商密钥，直接向服务商付费，本地模型不需要密钥，也没有按图计费。",
      },
      {
        question: "使用节点式 AI 需要写代码吗？",
        answer:
          "不需要。搭图就是选节点并把它们连起来。需要代码的地方可以用：沙箱中的 JavaScript 节点，以及把工作流写成文件的 TypeScript SDK，但都不是必须的。",
      },
      {
        question: "节点式 AI 是指 Node.js 吗？",
        answer:
          "不是，不过这两个词常被混着搜。节点式指的是图，也就是画布上的方框和连线。NodeTool 的后端恰好运行在 Node.js 上，并提供 TypeScript SDK，所以如果你是来找 Node.js 中的 AI，开发者文档也有相关内容。",
      },
    ],
  },
  readMore: {
    heading: "延伸阅读",
    links: [
      { label: "节点工作流", href: "/node-based-workflows" },
      { label: "工作流模板", href: "/templates" },
      { label: "支持的全部模型", href: "/models" },
      { label: "替你搭图的智能体", href: "/agents" },
      { label: "核心概念指南", href: "https://docs.nodetool.ai/key-concepts" },
      { label: "节点参考", href: "https://docs.nodetool.ai/nodes/" },
    ],
  },
  closing: {
    title: "打开画布，连上一个节点。",
    body: "NodeTool Studio 免费开源，在你自己的电脑上运行。托管模型用你自己的密钥，也可以运行本地模型，不按图付费。",
  },
};
