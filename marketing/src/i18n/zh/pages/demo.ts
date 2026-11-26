import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /demo (app/demo/page.tsx, components/TimelineEditorDemo.tsx, components/NodeEditorDemo.tsx). */
export const demo: LocalizedPageContent = {
  route: "/demo",
  name: "在线演示",
  title: "在浏览器中试用 NodeTool：时间线编辑器和节点编辑器演示",
  description:
    "在浏览器中打开 NodeTool 真实的时间线编辑器和节点编辑器。无需下载，无需登录。节点编辑器用示例结果运行，不保存任何内容。",
  hero: {
    kicker: "在线演示",
    h1: "在浏览器中试用 NodeTool。",
    lead: "下面两个编辑器就是应用里的编辑器，改造成可以在这个页面中运行。无需下载，无需登录。你做的修改都不会保存。",
    note: "编辑器界面是英文的。",
    secondary: { label: "打开浏览器版本", href: "https://app.nodetool.ai" },
  },
  sections: [
    {
      kind: "cards",
      id: "demos",
      title: "两个演示",
      cards: [
        {
          title: "时间线编辑器",
          body: "在 Studio 的时间线上打开一部完成的影片。播放、拖动播放头、缩放轨道，并选中一个图层。",
          link: { label: "打开时间线演示", href: "#try-the-timeline" },
        },
        {
          title: "节点编辑器",
          body: "修改提示词，重新连接图生视频节点图，从菜单添加节点，然后点击 Run。",
          link: { label: "打开节点编辑器演示", href: "#try-the-node-editor" },
        },
      ],
    },
    {
      kind: "demo",
      id: "try-the-timeline",
      editor: "timeline",
      copy: {
        title: "试用时间线编辑器。",
        intro:
          "这是 Studio 中的编辑器，在你的浏览器中打开 NodeTool 的一部示例影片。你可以播放、拖动播放头、缩放轨道并选中图层。修改不会保留。",
        open: "在编辑器中打开 {film}",
        frameTitle: "{film} 在 NodeTool 时间线编辑器中打开（只读演示）",
        note: "打开时编辑器会加载约 3 MB。在支持 WebGPU 的浏览器中播放最流畅。",
        filmPicker: "要打开的时间线",
      },
    },
    {
      kind: "demo",
      id: "try-the-node-editor",
      editor: "nodeEditor",
      copy: {
        title: "试用节点编辑器。",
        intro:
          "这是 NodeTool 中的编辑器，在你的浏览器中运行，包含一个提示词、一个 Text To Image 节点和一个 Image To Video 节点。修改提示词、拖动节点、重新连线，从节点菜单添加 Enhance Prompt 或 Text To Video，然后点击 Run。",
        open: "打开节点编辑器",
        frameTitle: "NodeTool 节点编辑器（使用示例结果的演示）",
        note: "Run 会根据提示词中的词语，返回之前用 NodeTool 制作的示例静帧和片段。这里不运行任何模型，也不保存任何内容。打开时编辑器会加载约 3 MB。",
      },
    },
  ],
  closing: {
    title: "做你自己的项目。",
    body: "演示不能调用模型，也不能保存你的编辑。Studio 在你的电脑上运行，使用本地模型或你自己的服务商密钥。浏览器版本处于 alpha 阶段。",
    secondary: { label: "打开浏览器版本", href: "https://app.nodetool.ai" },
  },
};
