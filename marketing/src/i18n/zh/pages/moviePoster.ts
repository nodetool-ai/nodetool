import type { LocalizedPageContent } from "@/i18n/content";

/**
 * Translates /use-cases/movie-poster (app/use-cases/movie-poster/page.tsx and
 * layout.tsx, with the steps and FAQ from data/useCaseEntries.ts). Left out:
 * the live graph of the Movie Posters workflow (a React component, not data),
 * the "Start with the Movie Posters workflow" starter block, the row of five
 * poster images (one shows beside the concepts; a portrait poster as the
 * full-width hero filled the screen), and
 * the model cards, which the models section states in text. The page states no
 * prices, so no price tokens appear.
 */
export const moviePoster: LocalizedPageContent = {
  route: "/use-cases/movie-poster",
  name: "AI 电影海报生成器",
  title: "AI 电影海报生成器：含演职员表的海报 | NodeTool",
  description:
    "输入片名、类型和受众，生成剧情概念、主视觉、标语和演职员表（billing block）。在开源画布上用你自己的密钥制作 AI 电影海报。",
  hero: {
    kicker: "使用场景 · 设计",
    h1: "AI 电影海报生成器",
    lead: "输入片名、类型和受众，NodeTool 会写出一份创意策略，并渲染一组电影海报概念，每张都带有片名、标语和演职员表（billing block）。它是一个开源工作流，使用你自己的 Gemini 和 GPT Image-2 密钥，可以为任何影片重新运行。",
    secondary: { label: "查看工作原理", href: "#how-it-works" },
  },
  sections: [
    {
      kind: "steps",
      id: "how-it-works",
      title: "工作原理",
      intro: "几个节点完成全部工作。一份简报变成策略，策略变成概念，概念变成主视觉。",
      steps: [
        {
          title: "设定简报",
          body: "三个文本输入分别填写影片的片名、类型和你要面向的受众。这就是全部的创意输入。",
          meta: "Singularity · 科幻 · AI 爱好者",
        },
        {
          title: "撰写策略",
          body: "一个 Prompt 节点整理简报，智能体返回一份真正的创意策略：定位、受众洞察、核心视觉概念和配色。",
          meta: "定位 · 受众洞察 · 十六进制色板",
        },
        {
          title: "生成概念",
          body: "用同一份简报生成多个概念，再选一个继续深化。",
          meta: "每次运行五个剧情概念",
        },
        {
          title: "渲染主视觉",
          body: "每个概念都会套用成完整的院线海报提示词，再由图像模型渲染出来，片名、标语和演职员表都包含在内。",
          meta: "GPT Image-2 · 2K · 地道的好莱坞版式",
        },
      ],
    },
    {
      kind: "text",
      id: "concepts",
      title: "一个片名，五个概念",
      body: [
        "同一份简报，每次运行都会得到新的策略。这里是《Singularity》渲染出的五个海报概念，直接来自画布。",
      ],
      bullets: [
        "“The end of time isn't the end.”（时间的终点不是终点。）",
        "“The end of limits. The beginning of everything.”（极限的终点，万物的起点。）",
        "“The future is not ours to control.”（未来不由我们掌控。）",
        "“The end of man is only the beginning.”（人类的终结只是开始。）",
        "“The future doesn't evolve. It accelerates.”（未来不是演进，而是加速。）",
      ],
      media: {
        kind: "image",
        src: "/poster-singularity-3-800.webp",
        width: 800,
        height: 1200,
        alt: "《Singularity》的海报概念：“The future is not ours to control.”",
        caption: "“The future is not ours to control.”",
      },
    },
    {
      kind: "cards",
      id: "direct-it",
      title: "由你来指挥",
      intro: "这里没有任何东西被锁死。你可以更换模型、调整基调、重新生成一个概念，或者让整个工作流改用另一个片名。",
      cards: [
        {
          title: "更换图像模型",
          body: "GPT Image-2、Flux、Nano Banana、Ideogram。换掉一个节点，整批海报就会以新的风格重新渲染。",
        },
        {
          title: "调整基调",
          body: "改变类型或受众，策略、配色和海报都会随之变化，无需手动重新写简报。",
        },
        {
          title: "编辑海报配方",
          body: "海报 Prompt 节点负责构图、字体排印和演职员表的版式。调整一次，之后每次渲染都遵循它。",
        },
        {
          title: "批量处理任何片名",
          body: "放入一个新片名再运行一次。可复用的是工作流，海报只是这次运行的输出。",
        },
      ],
    },
    {
      kind: "text",
      id: "models",
      title: "这个工作流使用的模型",
      body: [
        "用你自己的密钥调用。账单来自服务商，而不是我们，没有 token 加价，新模型发布的当天你就可以换上它。",
        "Gemini 3.1 Pro Preview（Gemini）负责撰写策略和剧情概念。GPT Image-2（通过 Kie.ai）负责渲染主视觉。Gemini 和 Kie.ai 是国际平台，需要这些平台的账号和 API 密钥。",
      ],
    },
  ],
  faq: {
    heading: "常见问题",
    items: [
      {
        question: "怎样用 AI 生成电影海报？",
        answer:
          "在 NodeTool 里只需要四个节点：输入片名、类型和受众；智能体撰写创意策略；列表生成器把它变成各不相同的剧情概念；图像模型把每个概念渲染成完整的院线海报，片名、标语和演职员表都包含在内。",
      },
      {
        question: "有免费的 AI 电影海报生成器吗？",
        answer:
          "NodeTool 开源，可免费下载，支持 macOS、Windows 和 Linux，Movie Posters 工作流随应用一起提供。每次运行都会用你自己的服务商密钥调用一个文本模型和一个图像模型，所以渲染费用由服务商向你收取，NodeTool 不加任何费用。",
      },
      {
        question: "什么是 billing block，AI 海报里有吗？",
        answer:
          "billing block 是院线海报底部的署名区，用高而窄的字体列出演员、导演、制片人、片厂标志和上映日期。海报提示词会要求图像模型按标准版式生成一个，所以每张海报都有，但里面的名字是模型写出的占位文字。如果要用真实的署名，请把准确的名字写进提示词，并用蒙版编辑修正写错的字母。",
      },
      {
        question: "这个工作流用了哪些模型？",
        answer:
          "Gemini 3.1 Pro Preview 负责撰写策略和剧情概念，GPT Image-2 负责渲染主视觉。两者都用你自己的服务商密钥，按服务商的价格调用。",
      },
      {
        question: "可以换成别的图像模型吗？",
        answer:
          "可以。GPT Image-2、Flux、Nano Banana 和 Ideogram 只差一个节点：换掉模型，整批海报就会以新的风格重新渲染，工作流的其余部分不动。",
      },
      {
        question: "需要设计师或 Photoshop 吗？",
        answer:
          "不需要。海报 Prompt 节点负责构图、字体排印和演职员表的版式，所以每次运行都会得到成品的海报概念。放入一个新片名再运行一次即可，可复用的是工作流。",
      },
    ],
  },
  readMore: {
    heading: "更多使用场景",
    links: [
      { label: "制作电影预告片", href: "/use-cases/movie-trailer" },
      { label: "全部使用场景", href: "/#use-cases" },
    ],
  },
  closing: {
    title: "设计你的海报系列",
    body: "下载适用于 macOS、Windows 和 Linux 的开源 Studio，打开这个工作流，几分钟内渲染出一整组宣传海报。",
    secondary: { label: "制作电影预告片", href: "/use-cases/movie-trailer" },
  },
};
