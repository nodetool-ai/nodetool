import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /ai-image-editor (app/ai-image-editor/page.tsx, data/imageEditorPage.ts). */
export const aiImageEditor: LocalizedPageContent = {
  route: "/ai-image-editor",
  name: "AI 图像编辑器",
  title: "支持图层的开源 AI 图像编辑器 | NodeTool",
  description:
    "带图层的 AI 图像编辑器：用 Flux、GPT Image 或你自己的工作流生成一个图层，对选区局部重绘，保留版本，并让智能体编辑图层堆栈。",
  hero: {
    kicker: "开源 AI 图像编辑器",
    h1: "只重新生成一个图层，其余保持不变。",
    lead: "NodeTool 的 sketch 编辑器是带图层的开源 AI 图像编辑器。每个图层可以手绘，也可以由提示词或工作流生成，所以你只重新生成一个图层，图像的其余部分不动。选中一个区域做局部重绘，用分割工具把物体抠出来，并把每次生成都作为版本保存在它的图层上。内置智能体和通过 MCP 连接的编程智能体编辑的是同一份文档。",
    secondary: { label: "阅读 Sketch 编辑器指南", href: "https://docs.nodetool.ai/sketch-editor" },
    media: {
      kind: "image",
      src: "/surface-sketch-poster.webp",
      width: 1920,
      height: 1080,
      alt: "sketch 编辑器：一张带图层的图像和图层堆栈",
    },
  },
  sections: [
    {
      kind: "cards",
      id: "layers",
      title: "知道自己来历的图层",
      intro: "生成的图层会记住它的模型、提示词和输入，所以可以重新生成，而不用碰周围的图层。",
      cards: [
        { title: "生成图层", body: "根据提示词、参考图或带图像输出的工作流生成一个图层。生成之前可以看到预估费用。" },
        { title: "重新生成一个图层", body: "每次生成都是该图层上的一个版本。修改提示词或来源图层后，NodeTool 会把受影响的图层标记为需要重新生成。用“Re-generate Stale”按顺序更新它们。锁定的图层会被跳过。" },
        { title: "对选区局部重绘", body: "选中一个区域，只根据提示词重新生成这个区域，选区就是蒙版。" },
        { title: "分割和抠图", body: "分割工具根据一个点或一个框找出物体，并把它们变成蒙版图层或抠图图层。" },
        { title: "图层、蒙版和绘图工具", body: "混合模式、不透明度、锁定、可见性、编组、蒙版图层，以及从 SVG 导入的矢量图层。可以用画笔、铅笔、橡皮擦、填充、渐变、模糊和仿制图章绘制。" },
        { title: "整张图像的版本", body: "在大改之前保存一个版本。之后可以恢复它，而不会丢掉你当前的工作。" },
      ],
    },
    {
      kind: "text",
      id: "consistency",
      title: "每张图里都是同一个产品",
      body: [],
      bullets: [
        "道具实体用参考图和固定的描述保存你的产品。智能体把这张参考图交给图像模型，帮助各张图中的产品外观保持一致。",
        "描述你想要的改动，并加入参考图来引导编辑，比如之前的结果，或你品牌风格的示例。",
      ],
    },
    {
      kind: "cards",
      id: "agent",
      title: "让智能体编辑图层堆栈",
      intro: "内置智能体和编程智能体使用同一套工具。通过 NodeTool MCP 服务器连接你的智能体。",
      cards: [
        { title: "创建和编辑 sketch", meta: "create_sketch, edit_sketch", body: "创建 sketch 并修改它的堆栈：添加、删除、重排和重命名图层，设置混合模式和不透明度，并把图像放到图层上。", link: { label: "NodeTool MCP 服务器", href: "/mcp" } },
        { title: "完善图像简报", meta: "refine_image_brief", body: "把一句话简报展开为主体、构图、光线、风格和要避开的内容，渲染之前先交给你审阅。" },
        { title: "生成和编辑图像", meta: "generate_image, edit_image", body: "在你指定的服务商和模型上渲染或编辑图像，然后把结果放到一个图层上。" },
        { title: "读取和恢复版本", meta: "list_sketch_versions, restore_sketch_version", body: "读取文档的快照，并回滚到其中一个。" },
        { title: "评审图像", meta: "critique_image", body: "查看一个结果，并在下一轮之前指出要修正的地方。" },
      ],
    },
    {
      kind: "text",
      id: "limits",
      title: "需要了解",
      body: [],
      bullets: [
        "生成会调用你自己的服务商账号，例如 fal、OpenAI、Replicate 或 Gemini，按它们的公布价格计费。本地模型需要一台能运行它的机器。",
        "无界面的智能体工具只修改图层堆栈和放置图像。在像素上绘制需要打开编辑器。",
        "编辑器保留最近 30 步撤销。更早的内容请用文档版本。",
      ],
    },
  ],
  faq: {
    heading: "关于 AI 图像编辑的问题",
    items: [
      {
        question: "有支持图层的开源 AI 图像编辑器吗？",
        answer:
          "有。NodeTool 的 sketch 编辑器以 AGPL-3.0 开源。它有带混合模式和蒙版的图层堆栈，任何图层都可以由提示词或工作流生成，并且可以单独重新生成。",
      },
      {
        question: "能重新生成图像的一部分，而不改变其余部分吗？",
        answer:
          "能，有两种方式。把这一部分放在单独的生成图层上，只重新生成这个图层，或者选中一个区域，以选区为蒙版做局部重绘。",
      },
      {
        question: "它使用哪些图像模型？",
        answer:
          "你的服务商提供的模型，例如 fal 或 Replicate 上的 Flux、OpenAI 上的 GPT Image 和 Gemini 图像模型，以及你自己运行的本地模型。你也可以把图层绑定到你自己的工作流。",
      },
      {
        question: "AI 智能体能编辑分层图像吗？",
        answer:
          "能。内置智能体，或通过 NodeTool MCP 服务器连接的 Claude Code 或 Codex，可以创建 sketch、添加图层并排序、把图像生成到图层上，并恢复版本。你在编辑器中打开同一份文档，继续工作。",
      },
      {
        question: "怎样让产品在多张图中保持一致？",
        answer:
          "把产品保存为带参考图的道具实体。智能体每次都会把这张参考图交给图像模型，edit_image 还可以接收更多参考图来对齐。",
      },
    ],
  },
  readMore: {
    heading: "延伸阅读",
    links: [
      { label: "Sketch 编辑器指南", href: "https://docs.nodetool.ai/sketch-editor" },
      { label: "AI 视频编辑器", href: "/ai-video-editor" },
      { label: "用 NodeTool 制作的故事板", href: "/storyboards" },
      { label: "面向广告的 AI", href: "/marketing" },
      { label: "面向编程智能体的 MCP 服务器", href: "/mcp" },
      { label: "支持的全部模型", href: "/models" },
    ],
  },
  closing: {
    title: "打开一个图层，只重新生成它。",
    body: "NodeTool Studio 免费开源。使用你自己的服务商账号或本地模型，每次生成都作为版本保存在它的图层上。",
  },
};
