/**
 * Copy for the translated overview pages (/ja, /zh, /hi, /es, /pt).
 *
 * Every sentence translates copy already published on the English site (home
 * hero, home cards, landing FAQ in faqEntries.ts), so no page makes a claim
 * the English pages do not. The one added fact is the interface language:
 * web/src/i18n/locales.ts lists each of these locales in the Settings →
 * General → Appearance selector, and untranslated screens fall back to
 * English. web/src/i18n/README.md marks the Japanese, Hindi, Spanish and
 * Portuguese catalogs as machine translated, so those pages say so. The menu
 * path on each page uses the labels from that locale's catalog.
 *
 * The provider list on /ja, /zh and /hi translates docs/providers.md: each
 * entry names only the modalities that page lists for that provider. A
 * provider with a /providers/<slug> page links there, the others link to
 * their section of the providers reference in the docs.
 *
 * Add a language: add an entry here, a route that renders
 * <LanguageOverview locale="…" />, and its key in LANDING_PAGES.
 */
import type { QaPair } from "@/lib/jsonld";

export type LanguageCode = "ja" | "zh" | "hi" | "es" | "pt";

type LinkedBlock = { title: string; body: string; linkLabel: string };

/**
 * Providers from China and India that NodeTool calls directly with the
 * user's own key, and the English page each one links to.
 */
export const DIRECT_PROVIDER_HREFS = {
  sarvam: "https://docs.nodetool.ai/providers#sarvam-ai",
  deepseek: "/providers/deepseek",
  alibaba: "/providers/alibaba",
  moonshot: "/providers/moonshot-kimi",
  minimax: "/providers/minimax",
  zai: "https://docs.nodetool.ai/providers#zai",
  kling: "https://docs.nodetool.ai/providers#kling-ai",
  byteplus: "https://docs.nodetool.ai/providers#byteplus",
} as const;

export type DirectProvider = keyof typeof DIRECT_PROVIDER_HREFS;

type ProviderList = {
  title: string;
  body: string;
  items: readonly { provider: DirectProvider; name: string; does: string }[];
};

export type LanguagePage = {
  path: `/${LanguageCode}`;
  /** BCP 47 tag for hreflang and the lang attribute. */
  hreflang: string;
  ogLocale: string;
  /** The language's own name, for the footer and breadcrumb. */
  label: string;
  title: string;
  description: string;
  badge: string;
  h1: string;
  lead: string;
  setup: string;
  platforms: string;
  download: string;
  tryBrowser: string;
  videoAlt: string;
  cardsLabel: string;
  cards: readonly [LinkedBlock, LinkedBlock, LinkedBlock];
  storyboard: LinkedBlock;
  workflow: LinkedBlock;
  local: LinkedBlock;
  language: LinkedBlock;
  /** Shown on the pages whose readers look for these providers. */
  providers?: ProviderList;
  faqHeading: string;
  faq: readonly QaPair[];
  closing: string;
};

/** Routes of the cards and blocks, shared by every language. */
export const CARD_HREFS = ["/studio", "/agents", "/ai-video-editor"] as const;
export const BLOCK_HREFS = {
  storyboard: "/storyboards",
  workflow: "/node-based-workflows",
  local: "/studio",
  language: "https://docs.nodetool.ai",
} as const;

const MODELS =
  "Flux, Seedance, Wan, Veo, Kling, Hailuo, Qwen Image, Whisper, ElevenLabs, Suno";
const PROVIDERS =
  "FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, Together, Groq, Mistral, OpenRouter, HuggingFace";
const LOCAL_RUNTIMES = "MLX, Ollama, llama.cpp, vLLM, LM Studio";

export const LANGUAGE_PAGES: Record<LanguageCode, LanguagePage> = {
  ja: {
    path: "/ja",
    hreflang: "ja",
    ogLocale: "ja_JP",
    label: "日本語",
    title: "NodeTool | オープンソースのAI映画制作スタジオ、エージェント、ノードワークフロー",
    description:
      "一文からAIで短編映画を作り、ショットごとに編集できるオープンソースのツールです。macOS、Windows、Linux向けに無料。ChatGPTやClaudeのプラン、自分のAPIキー、ローカルモデルで動きます。",
    badge: "オープンソースのAI映画スタジオ",
    h1: "AI映画を、ショットごとに演出する。",
    lead: "一文から始めましょう。エージェントがストーリーを書き、ショットごとに静止画を描き、タイムライン上でクリップを編集します。クリップの料金を払う前に静止画を確認して承認でき、どのショットも個別に撮り直せます。うまくいった手順は、もう一度実行できるワークフローとして保存できます。",
    setup:
      "デスクトップアプリでは、ChatGPTまたはClaudeのプランでサインインすると、エージェントがそのプランで動きます。自分のプロバイダーAPIキーを追加して、上乗せなしの定価で支払うこともできます。",
    platforms: "macOS、Windows、Linux向けに無料のオープンソースで提供しています。ブラウザ版はアルファ版です。",
    download: "無料でダウンロード",
    tryBrowser: "ブラウザで試す",
    videoAlt: "NodeTool：一文がビートシート、登場人物、静止画とクリップの絵コンテ、完成した編集になるまで",
    cardsLabel: "NodeToolで作れるもの",
    cards: [
      {
        title: "映画",
        body: "脚本を書き、すべてのショットの絵コンテを作り、タイムラインでクリップを編集します。すべてが一つのプロジェクトに入っています。",
        linkLabel: "デスクトップアプリについて（英語）",
      },
      {
        title: "エージェント",
        body: "変えたいことを普段の言葉で伝えると、エージェントがプロジェクトを編集します。いつでも自分で作業を引き継げます。",
        linkLabel: "エージェントの仕組み（英語）",
      },
      {
        title: "ライブタイムライン",
        body: "クリップにワークフローを結び付けます。入力を一つ変えるとそのクリップが古くなったと表示されるので、そのテイクだけを再生成し、残りの編集はそのまま残ります。",
        linkLabel: "動画エディターについて（英語）",
      },
    ],
    storyboard: {
      title: "クリップの料金を払う前に、静止画を承認する。",
      body: "絵コンテにはショットごとに一枚の静止画があります。承認したショットだけが動画になります。",
      linkLabel: "NodeToolで作った映画を見る（英語）",
    },
    workflow: {
      title: "すべてのプロジェクトの下に、ノードグラフがある。",
      body: "同じグラフを次のエピソードや20種類の広告バリエーションに実行したり、手持ちのComfyUIワークフローを読み込んだり、エージェントにグラフを組ませたりできます。",
      linkLabel: "ノードワークフローについて（英語）",
    },
    local: {
      title: "プロジェクトは自分のコンピューターに。",
      body: `NodeTool Studioは、ワークスペース、ワークフロー、ファイル、設定した認証情報をあなたのコンピューターに保存します。対応するオープンウェイトモデルは、${LOCAL_RUNTIMES}でローカル実行できます。ホスト型のモデルを呼び出すと、リクエストはそのプロバイダーに送られます。`,
      linkLabel: "Studioについて（英語）",
    },
    language: {
      title: "アプリは日本語で使えます。",
      body: "設定 → 一般 → 外観 で表示言語を日本語に切り替えられます。翻訳は機械翻訳で、まだ英語のまま表示される画面もあります。このページ以外のサイトとドキュメントは英語です。",
      linkLabel: "ドキュメント（英語）",
    },
    providers: {
      title: "DeepSeek、Qwen、Klingに直接つなぐ。",
      body: "プロバイダーのAPIキーを設定に追加すると、NodeToolがそのプロバイダーを直接呼び出します。リンク先は英語のページです。",
      items: [
        { provider: "deepseek", name: "DeepSeek", does: "チャット（V3とR1推論モデル）" },
        { provider: "alibaba", name: "Alibaba Cloud（Qwen、Wan）", does: "Qwenのチャット、Qwen-ImageとWanの画像生成、Wanの動画生成、Qwen TTSの音声合成" },
        { provider: "moonshot", name: "Moonshot（Kimi）", does: "Kimiのチャット" },
        { provider: "minimax", name: "MiniMax", does: "チャット、画像生成、Hailuoの動画生成、音声合成" },
        { provider: "zai", name: "Z.ai（GLM）", does: "GLMのチャット、GLM-Imageの画像生成、CogVideoXの動画生成、音声認識" },
        { provider: "kling", name: "Kling AI", does: "Klingの動画生成と画像生成" },
        { provider: "byteplus", name: "BytePlus ModelArk", does: "Seedのチャット、Seedreamの画像生成と編集、Seedanceの動画生成" },
      ],
    },
    faqHeading: "よくある質問",
    faq: [
      {
        question: "NodeToolとは何ですか？",
        answer:
          "NodeToolは、画像、音声、テキスト、ノードワークフローのツールを備えたオープンソースのAI動画エディターです。エージェントにプロジェクトの作成や編集を頼み、そのあと自分で手を加えられます。ChatGPTやClaudeのプランでサインインするか、自分のプロバイダーキーを使うか、対応モデルをローカルで実行します。",
      },
      {
        question: "料金はかかりますか？",
        answer:
          "Studioは無料のオープンソースです。Cloudはアルファ期間中は無料で、今後の料金は発表されていません。プロバイダーのAPI料金は別にかかり、サブスクリプションでの利用はそのプランの上限にカウントされます。ローカルモデルは自分のハードウェアと電気代で動き、呼び出しごとのプロバイダー料金はかかりません。",
      },
      {
        question: "NodeToolはオープンソースですか？",
        answer:
          "はい。ソースコードはGitHubでAGPL-3.0ライセンスのもと公開されています。StudioとCloudは同じソースを使っており、NodeToolを自分でホストすることもできます。",
      },
      {
        question: "日本語で使えますか？",
        answer:
          "はい。設定 → 一般 → 外観 で表示言語を日本語に切り替えられます。翻訳は機械翻訳のため、まだ英語で表示される画面もあります。ドキュメントは英語です。",
      },
      {
        question: "ChatGPTやClaudeのサブスクリプションは使えますか？",
        answer:
          "はい、Studioで使えます。ChatGPTまたはClaudeでサインインすると、エージェントはAPIキーではなくそのサブスクリプションで動きます。その実行はプランの利用上限にカウントされます。",
      },
      {
        question: "GPUは必要ですか？",
        answer:
          "いいえ。Studioはホスト型のプロバイダーを使えるので、モデルはプロバイダー側のハードウェアで動きます。GPUが必要になるのは、対応するオープンウェイトモデルを自分のコンピューターで動かす場合だけです。必要な性能はモデルと実行環境によって異なります。",
      },
      {
        question: "どのモデルに対応していますか？",
        answer: `${MODELS}などの主要モデルに、${PROVIDERS}といったプロバイダー経由で接続できます。${LOCAL_RUNTIMES}で自分のコンピューター上でも実行できます。`,
      },
    ],
    closing: "NodeTool Studioは無料のオープンソースです。",
  },

  zh: {
    path: "/zh",
    hreflang: "zh-Hans",
    ogLocale: "zh_CN",
    label: "简体中文",
    title: "NodeTool | 开源 AI 电影工作室、智能体与节点工作流",
    description:
      "用一句话生成可逐镜头编辑的 AI 短片。开源，免费支持 macOS、Windows 和 Linux。可使用 ChatGPT 或 Claude 订阅、自己的 API 密钥或本地模型。",
    badge: "开源 AI 电影工作室",
    h1: "逐个镜头，导演你的 AI 电影。",
    lead: "从一句话开始。智能体编写故事，为每个镜头绘制一张静帧，并在时间线上剪辑片段。在为片段付费之前先审批静帧，任何镜头都可以单独重拍，把有效的做法保存为可以再次运行的工作流。",
    setup:
      "在桌面应用中，用你的 ChatGPT 或 Claude 订阅登录，智能体就在该订阅上运行。你也可以添加自己的服务商 API 密钥，按官方价格付费，不加价。",
    platforms: "免费开源，支持 macOS、Windows 和 Linux。浏览器版本处于 alpha 阶段。",
    download: "免费下载",
    tryBrowser: "在浏览器中试用",
    videoAlt: "NodeTool：一句话变成节拍表、角色、由静帧和片段组成的故事板，以及完成的剪辑",
    cardsLabel: "NodeTool 能做什么",
    cards: [
      {
        title: "电影",
        body: "编写剧本，为每个镜头制作故事板，并在时间线上剪辑片段，全部在一个项目中完成。",
        linkLabel: "关于桌面应用（英文）",
      },
      {
        title: "智能体",
        body: "用日常语言告诉智能体要改什么。它会编辑项目，你可以随时接手。",
        linkLabel: "智能体如何工作（英文）",
      },
      {
        title: "实时时间线",
        body: "把工作流绑定到片段上。更改其中一个输入，该片段会显示为已过期，你只需重新生成这一条，剪辑的其余部分保持不变。",
        linkLabel: "关于视频编辑器（英文）",
      },
    ],
    storyboard: {
      title: "先审批静帧，再为片段付费。",
      body: "故事板中每个镜头有一张静帧。只有你审批通过的镜头才会生成视频。",
      linkLabel: "观看用 NodeTool 制作的影片（英文）",
    },
    workflow: {
      title: "每个项目的底层都是一张节点图。",
      body: "你可以在下一集或 20 个广告变体上运行同一张图，导入你已有的 ComfyUI 工作流，或者让智能体搭建这张图。",
      linkLabel: "关于节点工作流（英文）",
    },
    local: {
      title: "项目保存在你自己的电脑上。",
      body: `NodeTool Studio 将工作区、工作流、文件和你配置的凭据保存在你的电脑上。受支持的开放权重模型可以通过 ${LOCAL_RUNTIMES} 在本地运行。调用托管模型时，请求会发送到相应的服务商。`,
      linkLabel: "关于 Studio（英文）",
    },
    language: {
      title: "应用支持简体中文界面。",
      body: "在 设置 → 常规 → 外观 中可以把界面语言切换为简体中文。部分尚未翻译的页面仍显示英文。本页之外的网站和文档为英文。",
      linkLabel: "文档（英文）",
    },
    providers: {
      title: "直接连接 DeepSeek、通义千问和可灵。",
      body: "在设置中添加服务商的 API 密钥，NodeTool 就会直接调用该服务商。链接指向英文页面。",
      items: [
        { provider: "deepseek", name: "DeepSeek", does: "对话（V3 和 R1 推理模型）" },
        { provider: "alibaba", name: "阿里云（通义千问 Qwen、通义万相 Wan）", does: "Qwen 对话，Qwen-Image 和 Wan 图像生成，Wan 视频生成，Qwen TTS 语音合成" },
        { provider: "moonshot", name: "月之暗面（Kimi）", does: "Kimi 对话" },
        { provider: "minimax", name: "MiniMax", does: "对话、图像生成、海螺 Hailuo 视频生成、语音合成" },
        { provider: "zai", name: "智谱 Z.ai（GLM）", does: "GLM 对话，GLM-Image 图像生成，CogVideoX 视频生成，语音识别" },
        { provider: "kling", name: "可灵 Kling AI", does: "可灵视频生成和图像生成" },
        { provider: "byteplus", name: "BytePlus ModelArk", does: "Seed 对话，Seedream 图像生成和编辑，Seedance 视频生成" },
      ],
    },
    faqHeading: "常见问题",
    faq: [
      {
        question: "NodeTool 是什么？",
        answer:
          "NodeTool 是一款开源 AI 视频编辑器，同时提供图像、音频、文本和节点工作流工具。你可以让智能体创建或编辑项目，然后自己修改。可以用 ChatGPT 或 Claude 订阅登录，使用自己的服务商密钥，或在本地运行受支持的模型。",
      },
      {
        question: "NodeTool 收费吗？",
        answer:
          "Studio 免费且开源。Cloud 在 alpha 阶段免费，未来的 Cloud 定价尚未公布。服务商的 API 费用另计，通过订阅使用的部分计入你订阅方案的额度。本地模型使用你自己的硬件和电力，不产生按次计费的服务商费用。",
      },
      {
        question: "NodeTool 是开源的吗？",
        answer:
          "是的。NodeTool 的源代码以 AGPL-3.0 许可证在 GitHub 上公开。Studio 和 Cloud 使用相同的源代码，你也可以自行托管 NodeTool。",
      },
      {
        question: "可以用中文界面吗？",
        answer:
          "可以。在 设置 → 常规 → 外观 中把界面语言切换为简体中文。部分尚未翻译的页面仍显示英文。文档为英文。",
      },
      {
        question: "可以使用我的 ChatGPT 或 Claude 订阅吗？",
        answer:
          "可以，在 Studio 中使用。用 ChatGPT 或 Claude 登录后，智能体会使用该订阅而不是 API 密钥运行。这些运行计入你订阅方案的额度。",
      },
      {
        question: "需要 GPU 吗？",
        answer:
          "不需要。Studio 可以使用托管服务商，模型在服务商的硬件上运行。只有当你选择在自己的电脑上运行受支持的开放权重模型时，才需要考虑 GPU。具体要求取决于模型和运行环境。",
      },
      {
        question: "支持哪些模型？",
        answer: `支持主流模型，包括 ${MODELS}，可通过 ${PROVIDERS} 等服务商调用。模型也可以通过 ${LOCAL_RUNTIMES} 在你自己的电脑上运行。`,
      },
    ],
    closing: "NodeTool Studio 免费且开源。",
  },

  hi: {
    path: "/hi",
    hreflang: "hi",
    ogLocale: "hi_IN",
    label: "हिन्दी",
    title: "NodeTool | ओपन-सोर्स AI फ़िल्म स्टूडियो, एजेंट और नोड वर्कफ़्लो",
    description:
      "एक वाक्य से AI शॉर्ट फ़िल्म बनाइए और हर शॉट को अलग से एडिट कीजिए। ओपन-सोर्स, macOS, Windows और Linux के लिए मुफ़्त। ChatGPT या Claude प्लान, अपनी API कुंजियों या लोकल मॉडल पर चलता है।",
    badge: "ओपन-सोर्स AI फ़िल्म स्टूडियो",
    h1: "AI फ़िल्में बनाइए, शॉट दर शॉट।",
    lead: "एक वाक्य से शुरुआत कीजिए। एजेंट कहानी लिखता है, हर शॉट के लिए एक स्टिल बनाता है और टाइमलाइन पर क्लिप जोड़ता है। क्लिप के पैसे देने से पहले हर स्टिल को मंज़ूर कीजिए, किसी भी शॉट को अलग से दोबारा बनाइए, और जो तरीका काम करे उसे वर्कफ़्लो के रूप में सेव कीजिए ताकि उसे फिर से चला सकें।",
    setup:
      "डेस्कटॉप ऐप में अपने ChatGPT या Claude प्लान से साइन इन कीजिए, और एजेंट उसी प्लान पर चलेगा। या अपनी प्रोवाइडर API कुंजियाँ जोड़िए और बिना किसी अतिरिक्त शुल्क के सूची मूल्य चुकाइए।",
    platforms: "macOS, Windows और Linux के लिए मुफ़्त और ओपन-सोर्स। ब्राउज़र संस्करण अल्फ़ा में है।",
    download: "मुफ़्त डाउनलोड करें",
    tryBrowser: "ब्राउज़र में आज़माएँ",
    videoAlt: "NodeTool: एक वाक्य से बीट शीट, किरदार, स्टिल और क्लिप वाला स्टोरीबोर्ड, और तैयार कट",
    cardsLabel: "NodeTool क्या बनाता है",
    cards: [
      {
        title: "फ़िल्में",
        body: "स्क्रिप्ट लिखिए, हर शॉट का स्टोरीबोर्ड बनाइए और टाइमलाइन पर क्लिप एडिट कीजिए, सब एक ही प्रोजेक्ट में।",
        linkLabel: "डेस्कटॉप ऐप के बारे में (अंग्रेज़ी)",
      },
      {
        title: "एजेंट",
        body: "एजेंट को सादी भाषा में बताइए कि क्या बदलना है। वह प्रोजेक्ट एडिट करता है, और आप किसी भी समय काम अपने हाथ में ले सकते हैं।",
        linkLabel: "एजेंट कैसे काम करता है (अंग्रेज़ी)",
      },
      {
        title: "लाइव टाइमलाइन",
        body: "किसी क्लिप से एक वर्कफ़्लो जोड़िए। उसका कोई इनपुट बदलने पर क्लिप पुरानी दिखने लगती है, तो आप सिर्फ़ वही टेक दोबारा बनाते हैं और बाकी कट वैसा ही रहता है।",
        linkLabel: "वीडियो एडिटर के बारे में (अंग्रेज़ी)",
      },
    ],
    storyboard: {
      title: "क्लिप के पैसे देने से पहले स्टिल मंज़ूर कीजिए।",
      body: "स्टोरीबोर्ड में हर शॉट का एक स्टिल होता है। सिर्फ़ वही शॉट वीडियो बनते हैं जिन्हें आप मंज़ूर करते हैं।",
      linkLabel: "NodeTool में बनी फ़िल्में देखें (अंग्रेज़ी)",
    },
    workflow: {
      title: "हर प्रोजेक्ट के नीचे एक नोड ग्राफ़ है।",
      body: "उसी ग्राफ़ को अगले एपिसोड या बीस विज्ञापन वेरिएंट पर चलाइए, अपना मौजूदा ComfyUI वर्कफ़्लो लाइए, या एजेंट से ग्राफ़ बनवाइए।",
      linkLabel: "नोड वर्कफ़्लो के बारे में (अंग्रेज़ी)",
    },
    local: {
      title: "प्रोजेक्ट आपके अपने कंप्यूटर पर।",
      body: `NodeTool Studio वर्कस्पेस, वर्कफ़्लो, फ़ाइलें और आपके सेट किए गए क्रेडेंशियल आपके कंप्यूटर पर सेव करता है। समर्थित ओपन-वेट मॉडल ${LOCAL_RUNTIMES} के ज़रिए लोकल चल सकते हैं। जब आप कोई होस्टेड मॉडल चलाते हैं, तो अनुरोध उस प्रोवाइडर के पास जाता है।`,
      linkLabel: "Studio के बारे में (अंग्रेज़ी)",
    },
    language: {
      title: "ऐप हिन्दी में भी चलता है।",
      body: "सेटिंग्स → जनरल → दिखावट में इंटरफ़ेस की भाषा हिन्दी चुनिए। अनुवाद मशीन से किया गया है, और कुछ स्क्रीन अभी अंग्रेज़ी में दिखती हैं। इस पेज के अलावा साइट और डॉक्यूमेंटेशन अंग्रेज़ी में हैं।",
      linkLabel: "डॉक्यूमेंटेशन (अंग्रेज़ी)",
    },
    providers: {
      title: "Sarvam, DeepSeek, Qwen और Kling से सीधे जुड़िए।",
      body: "किसी प्रोवाइडर की API कुंजी सेटिंग्स में जोड़िए, और NodeTool उस प्रोवाइडर को सीधे कॉल करता है। लिंक किए गए पेज अंग्रेज़ी में हैं।",
      items: [
        { provider: "sarvam", name: "Sarvam AI", does: "चैट, हिन्दी और तमिल समेत 11 भाषाओं में Bulbul से टेक्स्ट-टू-स्पीच, और 22 भारतीय भाषाओं व अंग्रेज़ी में Saaras से स्पीच-टू-टेक्स्ट" },
        { provider: "deepseek", name: "DeepSeek", does: "चैट (V3 और R1 रीज़निंग मॉडल)" },
        { provider: "alibaba", name: "Alibaba Cloud (Qwen, Wan)", does: "Qwen चैट, Qwen-Image और Wan से इमेज, Wan से वीडियो, Qwen TTS से टेक्स्ट-टू-स्पीच" },
        { provider: "moonshot", name: "Moonshot (Kimi)", does: "Kimi चैट" },
        { provider: "minimax", name: "MiniMax", does: "चैट, इमेज, Hailuo से वीडियो, टेक्स्ट-टू-स्पीच" },
        { provider: "zai", name: "Z.ai (GLM)", does: "GLM चैट, GLM-Image से इमेज, CogVideoX से वीडियो, स्पीच-टू-टेक्स्ट" },
        { provider: "kling", name: "Kling AI", does: "Kling से वीडियो और इमेज" },
        { provider: "byteplus", name: "BytePlus ModelArk", does: "Seed चैट, Seedream से इमेज बनाना और एडिट करना, Seedance से वीडियो" },
      ],
    },
    faqHeading: "अक्सर पूछे जाने वाले सवाल",
    faq: [
      {
        question: "NodeTool क्या है?",
        answer:
          "NodeTool एक ओपन-सोर्स AI वीडियो एडिटर है, जिसमें इमेज, ऑडियो, टेक्स्ट और नोड वर्कफ़्लो के टूल भी हैं। एजेंट से प्रोजेक्ट बनाने या बदलने को कहिए, फिर खुद बदलाव कीजिए। अपने ChatGPT या Claude प्लान से साइन इन कीजिए, अपनी प्रोवाइडर कुंजियाँ इस्तेमाल कीजिए, या समर्थित मॉडल लोकल चलाइए।",
      },
      {
        question: "NodeTool की कीमत क्या है?",
        answer:
          "Studio मुफ़्त और ओपन-सोर्स है। Cloud अल्फ़ा के दौरान मुफ़्त है, और Cloud की आगे की कीमत घोषित नहीं हुई है। प्रोवाइडर के API शुल्क अलग से लगते हैं, और सब्सक्रिप्शन से हुआ इस्तेमाल आपके प्लान की सीमा में गिना जाता है। लोकल मॉडल आपके हार्डवेयर और बिजली पर चलते हैं, उनके लिए हर कॉल का प्रोवाइडर शुल्क नहीं लगता।",
      },
      {
        question: "क्या NodeTool ओपन-सोर्स है?",
        answer:
          "हाँ। NodeTool का सोर्स कोड GitHub पर AGPL-3.0 लाइसेंस के तहत उपलब्ध है। Studio और Cloud एक ही सोर्स से बने हैं, और आप NodeTool को खुद होस्ट कर सकते हैं।",
      },
      {
        question: "क्या ऐप हिन्दी में चलता है?",
        answer:
          "हाँ। सेटिंग्स → जनरल → दिखावट में भाषा हिन्दी चुनिए। अनुवाद मशीन से किया गया है, इसलिए कुछ स्क्रीन अभी अंग्रेज़ी में दिखती हैं। डॉक्यूमेंटेशन अंग्रेज़ी में है।",
      },
      {
        question: "क्या मैं अपना ChatGPT या Claude सब्सक्रिप्शन इस्तेमाल कर सकता हूँ?",
        answer:
          "हाँ, Studio में। ChatGPT या Claude से साइन इन कीजिए, और एजेंट API कुंजी के बजाय उसी सब्सक्रिप्शन पर चलेगा। ये रन आपके प्लान की सीमा में गिने जाते हैं।",
      },
      {
        question: "क्या मुझे GPU चाहिए?",
        answer:
          "नहीं। Studio होस्टेड प्रोवाइडर इस्तेमाल कर सकता है, जहाँ मॉडल प्रोवाइडर के हार्डवेयर पर चलता है। GPU की ज़रूरत तभी है जब आप समर्थित ओपन-वेट मॉडल अपने कंप्यूटर पर चलाना चुनें। तब ज़रूरत मॉडल और रनटाइम पर निर्भर करती है।",
      },
      {
        question: "कौन से मॉडल समर्थित हैं?",
        answer: `प्रमुख मॉडल, जैसे ${MODELS}, जिन तक ${PROVIDERS} जैसे प्रोवाइडर के ज़रिए पहुँचा जाता है। मॉडल ${LOCAL_RUNTIMES} के ज़रिए आपके अपने कंप्यूटर पर भी चल सकते हैं।`,
      },
    ],
    closing: "NodeTool Studio मुफ़्त और ओपन-सोर्स है।",
  },

  es: {
    path: "/es",
    hreflang: "es",
    ogLocale: "es_ES",
    label: "Español",
    title: "NodeTool | Estudio de cine con IA de código abierto, agentes y flujos de nodos",
    description:
      "Convierte una frase en un cortometraje con IA que puedes editar plano a plano. Código abierto y gratis para macOS, Windows y Linux. Funciona con tu plan de ChatGPT o Claude, tus propias claves de API o modelos locales.",
    badge: "Estudio de cine con IA de código abierto",
    h1: "Dirige películas con IA, plano a plano.",
    lead: "Empieza con una frase. El agente escribe la historia, dibuja un fotograma para cada plano y monta los clips en una línea de tiempo. Aprueba cada fotograma antes de pagar por su clip, vuelve a generar cualquier plano por separado y guarda lo que funciona como un flujo de trabajo que puedes volver a ejecutar.",
    setup:
      "En la aplicación de escritorio, inicia sesión con tu plan de ChatGPT o Claude y el agente funciona con él. O añade tus propias claves de API y paga el precio de lista del proveedor, sin recargos.",
    platforms: "Gratis y de código abierto para macOS, Windows y Linux. La versión para navegador está en alfa.",
    download: "Descargar gratis",
    tryBrowser: "Probar en el navegador",
    videoAlt: "NodeTool: una frase se convierte en una escaleta, personajes, un storyboard de fotogramas y clips, y un montaje terminado",
    cardsLabel: "Qué hace NodeTool",
    cards: [
      {
        title: "Películas",
        body: "Escribe el guion, crea el storyboard de cada plano y monta los clips en una línea de tiempo, todo en un mismo proyecto.",
        linkLabel: "Sobre la aplicación de escritorio (en inglés)",
      },
      {
        title: "El agente",
        body: "Dile al agente qué cambiar con tus propias palabras. Edita el proyecto y tú puedes tomar el control en cualquier momento.",
        linkLabel: "Cómo funciona el agente (en inglés)",
      },
      {
        title: "Una línea de tiempo viva",
        body: "Vincula un flujo de trabajo a un clip. Si cambias una de sus entradas, el clip se marca como desactualizado, así que regeneras solo esa toma y el resto del montaje se queda igual.",
        linkLabel: "Sobre el editor de vídeo (en inglés)",
      },
    ],
    storyboard: {
      title: "Aprueba el fotograma antes de pagar por el clip.",
      body: "El storyboard tiene un fotograma por plano. Solo los planos que apruebas se convierten en vídeo.",
      linkLabel: "Ver películas hechas con NodeTool (en inglés)",
    },
    workflow: {
      title: "Debajo de cada proyecto hay un grafo de nodos.",
      body: "Ejecuta el mismo grafo en el siguiente episodio o en veinte variantes de un anuncio, importa un flujo de ComfyUI que ya tengas o pide al agente que construya el grafo.",
      linkLabel: "Sobre los flujos de nodos (en inglés)",
    },
    local: {
      title: "Tus proyectos, en tu ordenador.",
      body: `NodeTool Studio guarda el espacio de trabajo, los flujos, los archivos y las credenciales que configures en tu ordenador. Los modelos de pesos abiertos compatibles pueden ejecutarse en local con ${LOCAL_RUNTIMES}. Cuando usas un modelo alojado, la solicitud sale hacia ese proveedor.`,
      linkLabel: "Sobre Studio (en inglés)",
    },
    language: {
      title: "La aplicación está en español.",
      body: "Cambia el idioma de la interfaz a español en Configuración → General → Apariencia. La traducción es automática y algunas pantallas todavía aparecen en inglés. El resto del sitio y la documentación están en inglés.",
      linkLabel: "Documentación (en inglés)",
    },
    faqHeading: "Preguntas frecuentes",
    faq: [
      {
        question: "¿Qué es NodeTool?",
        answer:
          "NodeTool es un editor de vídeo con IA de código abierto, con herramientas para imágenes, audio, texto y flujos de nodos. Pide al agente que cree o edite un proyecto y luego haz tus propios cambios. Inicia sesión con tu plan de ChatGPT o Claude, usa tus propias claves de proveedor o ejecuta modelos compatibles en local.",
      },
      {
        question: "¿Cuánto cuesta NodeTool?",
        answer:
          "Studio es gratis y de código abierto. Cloud es gratis durante la alfa y su precio futuro no se ha anunciado. Los cargos de API de los proveedores van aparte, y el uso con suscripción cuenta contra los límites de tu plan. Los modelos locales usan tu hardware y tu electricidad, sin cargo por llamada de ningún proveedor.",
      },
      {
        question: "¿NodeTool es de código abierto?",
        answer:
          "Sí. El código fuente de NodeTool está disponible en GitHub con licencia AGPL-3.0. Studio y Cloud comparten el mismo código, y puedes alojar NodeTool tú mismo.",
      },
      {
        question: "¿La aplicación está en español?",
        answer:
          "Sí. Elige español en Configuración → General → Apariencia. La traducción es automática, así que algunas pantallas todavía aparecen en inglés. La documentación está en inglés.",
      },
      {
        question: "¿Puedo usar mi suscripción de ChatGPT o Claude?",
        answer:
          "Sí, en Studio. Inicia sesión con ChatGPT o Claude y el agente funciona con esa suscripción en lugar de una clave de API. Esas ejecuciones cuentan contra los límites de tu plan.",
      },
      {
        question: "¿Necesito una GPU?",
        answer:
          "No. Studio puede usar proveedores alojados, donde el modelo se ejecuta en el hardware del proveedor. La GPU solo importa si decides ejecutar modelos de pesos abiertos compatibles en tu ordenador. En ese caso, lo que necesitas depende del modelo y del entorno de ejecución.",
      },
      {
        question: "¿Qué modelos son compatibles?",
        answer: `Los principales modelos, como ${MODELS}, a través de proveedores como ${PROVIDERS}. Los modelos también pueden ejecutarse en tu propio ordenador con ${LOCAL_RUNTIMES}.`,
      },
    ],
    closing: "NodeTool Studio es gratis y de código abierto.",
  },

  pt: {
    path: "/pt",
    hreflang: "pt",
    ogLocale: "pt_BR",
    label: "Português",
    title: "NodeTool | Estúdio de cinema com IA de código aberto, agentes e fluxos de nós",
    description:
      "Transforme uma frase em um curta-metragem com IA que você edita plano a plano. Código aberto e grátis para macOS, Windows e Linux. Funciona com seu plano do ChatGPT ou Claude, suas próprias chaves de API ou modelos locais.",
    badge: "Estúdio de cinema com IA de código aberto",
    h1: "Dirija filmes com IA, plano a plano.",
    lead: "Comece com uma frase. O agente escreve a história, desenha um quadro para cada plano e monta os clipes em uma linha do tempo. Aprove cada quadro antes de pagar pelo clipe, refaça qualquer plano separadamente e salve o que funciona como um fluxo de trabalho que você pode executar de novo.",
    setup:
      "No aplicativo para desktop, entre com seu plano do ChatGPT ou Claude e o agente roda nele. Ou adicione suas próprias chaves de API e pague o preço de tabela do provedor, sem acréscimos.",
    platforms: "Grátis e de código aberto para macOS, Windows e Linux. A versão para navegador está em alfa.",
    download: "Baixar grátis",
    tryBrowser: "Testar no navegador",
    videoAlt: "NodeTool: uma frase vira um roteiro de batidas, personagens, um storyboard de quadros e clipes, e uma edição finalizada",
    cardsLabel: "O que o NodeTool faz",
    cards: [
      {
        title: "Filmes",
        body: "Escreva o roteiro, faça o storyboard de cada plano e monte os clipes em uma linha do tempo, tudo em um só projeto.",
        linkLabel: "Sobre o aplicativo para desktop (em inglês)",
      },
      {
        title: "O agente",
        body: "Diga ao agente o que mudar com suas próprias palavras. Ele edita o projeto, e você pode assumir a qualquer momento.",
        linkLabel: "Como o agente funciona (em inglês)",
      },
      {
        title: "Uma linha do tempo viva",
        body: "Vincule um fluxo de trabalho a um clipe. Ao mudar uma das entradas, o clipe aparece como desatualizado, e você gera de novo só aquela tomada enquanto o resto da edição continua igual.",
        linkLabel: "Sobre o editor de vídeo (em inglês)",
      },
    ],
    storyboard: {
      title: "Aprove o quadro antes de pagar pelo clipe.",
      body: "O storyboard tem um quadro por plano. Só os planos que você aprova viram vídeo.",
      linkLabel: "Ver filmes feitos no NodeTool (em inglês)",
    },
    workflow: {
      title: "Por baixo de cada projeto há um grafo de nós.",
      body: "Rode o mesmo grafo no próximo episódio ou em vinte variações de um anúncio, importe um fluxo do ComfyUI que você já tem ou peça ao agente para montar o grafo.",
      linkLabel: "Sobre fluxos de nós (em inglês)",
    },
    local: {
      title: "Seus projetos no seu computador.",
      body: `O NodeTool Studio salva o espaço de trabalho, os fluxos, os arquivos e as credenciais que você configurar no seu computador. Modelos de pesos abertos compatíveis podem rodar localmente com ${LOCAL_RUNTIMES}. Quando você usa um modelo hospedado, a solicitação vai para esse provedor.`,
      linkLabel: "Sobre o Studio (em inglês)",
    },
    language: {
      title: "O aplicativo está em português.",
      body: "Mude o idioma da interface para português em Configurações → Geral → Aparência. A tradução é automática, e algumas telas ainda aparecem em inglês. O restante do site e a documentação estão em inglês.",
      linkLabel: "Documentação (em inglês)",
    },
    faqHeading: "Perguntas frequentes",
    faq: [
      {
        question: "O que é o NodeTool?",
        answer:
          "O NodeTool é um editor de vídeo com IA de código aberto, com ferramentas para imagens, áudio, texto e fluxos de nós. Peça ao agente para criar ou editar um projeto e depois faça suas próprias alterações. Entre com seu plano do ChatGPT ou Claude, use suas próprias chaves de provedor ou rode modelos compatíveis localmente.",
      },
      {
        question: "Quanto custa o NodeTool?",
        answer:
          "O Studio é grátis e de código aberto. O Cloud é grátis durante a fase alfa, e o preço futuro ainda não foi anunciado. As cobranças de API dos provedores são à parte, e o uso por assinatura conta nos limites do seu plano. Modelos locais usam seu hardware e sua energia, sem cobrança por chamada de provedor.",
      },
      {
        question: "O NodeTool é de código aberto?",
        answer:
          "Sim. O código-fonte do NodeTool está no GitHub sob a licença AGPL-3.0. Studio e Cloud usam o mesmo código, e você pode hospedar o NodeTool por conta própria.",
      },
      {
        question: "O aplicativo está em português?",
        answer:
          "Sim. Escolha português em Configurações → Geral → Aparência. A tradução é automática, então algumas telas ainda aparecem em inglês. A documentação está em inglês.",
      },
      {
        question: "Posso usar minha assinatura do ChatGPT ou Claude?",
        answer:
          "Sim, no Studio. Entre com o ChatGPT ou o Claude e o agente roda nessa assinatura em vez de uma chave de API. Essas execuções contam nos limites do seu plano.",
      },
      {
        question: "Preciso de uma GPU?",
        answer:
          "Não. O Studio pode usar provedores hospedados, em que o modelo roda no hardware do provedor. A GPU só importa se você escolher rodar modelos de pesos abertos compatíveis no seu computador. Nesse caso, o que você precisa depende do modelo e do ambiente de execução.",
      },
      {
        question: "Quais modelos são compatíveis?",
        answer: `Os principais modelos, como ${MODELS}, por meio de provedores como ${PROVIDERS}. Os modelos também podem rodar no seu próprio computador com ${LOCAL_RUNTIMES}.`,
      },
    ],
    closing: "O NodeTool Studio é grátis e de código aberto.",
  },
};

/** Every language version of the overview, for hreflang in heads and the sitemap. */
export const HOME_LANGUAGE_ALTERNATES: Record<string, string> = {
  en: "/",
  ...Object.fromEntries(Object.values(LANGUAGE_PAGES).map((page) => [page.hreflang, page.path])),
  "x-default": "/",
};
