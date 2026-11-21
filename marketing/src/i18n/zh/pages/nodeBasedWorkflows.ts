import type { LocalizedPageContent } from "@/i18n/content";
import { LOCAL_RUNTIMES, OPEN_SOURCE_LINE } from "../shared";

/** Translates /node-based-workflows (app/node-based-workflows/page.tsx). */
export const nodeBasedWorkflows: LocalizedPageContent = {
  route: "/node-based-workflows",
  name: "节点工作流",
  title: "节点工作流 | 可检查、可运行、可重跑的 AI 工作流 · NodeTool",
  description:
    "NodeTool 是开源的节点式 AI 工作流画布。把图像、视频、音频和文本模型连成一张图，看每一步运行，并在新的输入上再次运行同一张图。",
  hero: {
    kicker: "节点工作流",
    h1: "可检查、可运行、可重跑的节点工作流。",
    lead: "NodeTool 是开源的节点式 AI 工作流画布。把图像、视频、音频和文本模型连成一张图，看每一步运行，并在新的输入上再次运行同一张图。",
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
      kind: "cards",
      id: "fail-early",
      title: "在付费运行之前发现断掉的连线。",
      intro: "在 Kie.ai 上，五段 5 秒的 {clipModel} 片段要 {fiveClipPrice}。花这笔钱的工作流应该在第一次调用之前失败，而不是在第九步。下面这些设计让 NodeTool 尽早、明明白白地报错。",
      cards: [
        { title: "有类型的端口", body: "每个输入和输出都声明类型：文本、图像、视频、音频、列表等。编辑器在接受连线之前检查类型，所以视频不会连进文本提示词。" },
        { title: "付费前的检查", body: "nodetool validate 不运行节点图，只读取它，报告未知节点、缺失的必填字段、类型错误的连线和不存在的模型 ID。智能体通过 validate_workflow 工具获得同样的检查。" },
        { title: "每一步都在屏幕上", body: "每个节点显示它在等待、运行还是完成，并保存自己的输出。运行出错时，你能看到是哪一步、产出了什么。" },
        { title: "换模型，不换图", body: "Text To Image、Image To Video 和 Text To Speech 会路由到提供所选模型的服务商。在一个字段里把 Seedream 换成 FLUX 或 Imagen，连线保持不动。" },
        { title: "批处理和控制流", body: "For Each 对每一项运行后续步骤，Collect 汇总结果。If、Switch 和 Fallback 用于分支。Subgraph 把一组节点折叠成一个。" },
        { title: "在画布之外运行", body: "你搭的图就是你调用的图。用 nodetool run 运行，POST 到它的运行接口拿回 JSON，或者通过 MCP 服务器交给 Cursor 或 Claude Code。" },
      ],
      note: "Kie.ai 官方价格，数据来自 genspend.io。",
    },
    {
      kind: "steps",
      id: "walkthrough",
      title: "视频里的工作流，逐个节点。",
      intro: "七个节点把五条镜头提示词变成一段剪辑好的视频。加第六条提示词，同一张图就生成六个镜头。电影预告片生成器模板也基于同样的结构。",
      steps: [
        { title: "String List Input", meta: "nodetool.input.StringListInput", body: "存放五条镜头提示词。" },
        { title: "For Each", meta: "nodetool.control.ForEach", body: "把提示词逐条发出，并附带序号。" },
        { title: "Text To Image", meta: "nodetool.image.TextToImage", body: "用你选的图像模型，把每条提示词变成一张静帧。" },
        { title: "Image To Video", meta: "nodetool.video.ImageToVideo", body: "用你选的视频模型，让每张静帧动起来。" },
        { title: "Collect", meta: "nodetool.control.Collect", body: "等待五段片段全部完成，作为一个列表传下去。" },
        { title: "Concatenate Video", meta: "nodetool.video.Concat", body: "把列表拼接成一段视频。" },
        { title: "Output", meta: "nodetool.output.Output", body: "把剪辑返回给画布、CLI 或 API 调用方。" },
      ],
    },
    {
      kind: "cards",
      id: "nodes",
      title: "几百个节点，一张画布。",
      intro: "现成的节点覆盖模型、媒体、数据和文件，另有为 Replicate、FAL 和 Kie.ai 上数千个模型生成的节点。部分示例：",
      cards: [
        { title: "图像", body: "Text To Image、Image To Image、Upscale Image、Remove Background、Segment Image、Apply Mask、Compare Images、Image To 3D" },
        { title: "视频", body: "Text To Video、Image To Video、Concatenate Video、Extract Video Frame、Extract Audio、Trim、Overlay" },
        { title: "音频", body: "Text To Speech、Speech to Text、Text To Music、Overlay Audio、Concatenate Audio、Transcribe" },
        { title: "文本和智能体", body: "Agent、Summarizer、Extractor、Classifier、Structured Output Generator、Enhance Prompt、Web Search" },
        { title: "逻辑、数据和代码", body: "For Each、Collect、If、Switch、Fallback、Subgraph、Code、Hybrid Search、Webhook Trigger" },
        {
          title: "让智能体来连线",
          body: "用一句话描述工作流。内置智能体选择节点，在同一张画布上连接并运行。它放下的每个节点都可以编辑。",
          link: { label: "智能体如何工作", href: "/agents" },
        },
      ],
    },
  ],
  faq: {
    heading: "常见问题",
    items: [
      {
        question: "什么是节点工作流？",
        answer:
          "节点工作流是画成一张图的流程。每个节点做一件事，比如生成一张图或拼接片段，连线把一个节点的输出送进下一个节点的输入。图会被保存，所以同一个流程可以在新的输入上再次运行。",
      },
      {
        question: "节点工作流和一串自动化步骤有什么不同？",
        answer:
          "步骤列表从上到下执行。节点图可以把一个输出分成几个分支，对列表中的每一项运行一个步骤，再把结果合并回来，而且这些都能在一张画布上看到。NodeTool 还会检查每条连线两端的类型是否匹配。",
      },
      {
        question: "在 NodeTool 里搭节点工作流需要写代码吗？",
        answer:
          "不需要。从菜单添加节点、拖动连线，或者让内置智能体帮你搭。需要代码时，Code 节点运行沙箱中的 JavaScript，工作流也可以写成 TypeScript 文件。",
      },
      {
        question: "节点可以使用哪些 AI 模型？",
        answer: `托管模型来自 DeepSeek、阿里云百炼、智谱 GLM、fal、Replicate、Kie.ai、Together AI、OpenAI、Google 和 ElevenLabs 等服务商，使用你自己的密钥，按官方价格付费。本地模型通过 ${LOCAL_RUNTIMES} 运行，不需要密钥。`,
      },
    ],
  },
  readMore: {
    heading: "延伸阅读",
    links: [
      { label: "支持的全部模型", href: "/models" },
      { label: "面向编程智能体的 MCP 服务器", href: "/mcp" },
      { label: "对比 ComfyUI", href: "/alternatives/comfyui" },
      { label: "工作流模板", href: "/templates" },
      { label: "节点参考", href: "https://docs.nodetool.ai/nodes/" },
      { label: "第一个工作流", href: "https://docs.nodetool.ai/first-workflow" },
    ],
  },
  closing: {
    title: "连好你的第一个工作流。",
    body: "NodeTool Studio 免费开源。从模板或空白画布开始，使用你自己的密钥或本地模型。",
  },
};
