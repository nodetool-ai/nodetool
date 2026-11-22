import type { LocalizedPageContent } from "@/i18n/content";
import { LOCAL_RUNTIMES } from "../shared";

/** Translates /models (app/models/page.tsx, data/modelEntries.ts hub entry). */
export const models: LocalizedPageContent = {
  route: "/models",
  name: "対応モデル",
  title: "対応しているAIモデル | すべてのトップモデルが、ノードになる · NodeTool",
  description:
    "Veo 3、Sora、Kling、FLUX、Seedream、Imagenなど、画像と動画のトップモデルのすべてが、ビジュアルAIワークフローで実行、連結、比較できるノードになります。自分のキーでプロバイダーの価格どおりに使えます。",
  hero: {
    kicker: "モデルディレクトリ",
    h1: "すべてのトップモデルが、ノードになる。",
    lead: "今使える最高の画像・動画モデルを集めました。どれもビジュアルワークフローで実行でき、順番につなげることも、二つのモデルに同じプロンプトを与えて比べることもできます。自分のキーを使い、プロバイダーの価格で利用します。NodeToolは現在、{providerCount}のプロバイダーの{modelCount}モデルに対応しています。",
    primary: { label: "すべてのモデルを見る", href: "#featured" },
    secondary: { label: "Studioを無料でダウンロード", href: "/download" },
  },
  sections: [
    {
      kind: "catalog",
      id: "featured",
      title: "動画モデルと画像モデル",
      intro: "各カードに、そのモデルを提供しているプロバイダーの数を表示しています。",
      source: "models",
    },
    {
      kind: "text",
      id: "local",
      title: "自分のコンピューターでモデルを動かす。",
      body: [
        `対応するオープンウェイトモデルは、${LOCAL_RUNTIMES}でローカル実行できます。キーは不要で、実行ごとの課金もありません。どのモデルをどれだけの速さで動かせるかは、お使いのハードウェアで決まります。`,
      ],
      links: [{ label: "ローカルモデルとクラウドモデル", href: "https://docs.nodetool.ai/models" }],
    },
    {
      kind: "cards",
      id: "compare",
      title: "同じプロンプト、二つのモデルを並べて比べる。",
      cards: [
        { title: "Kling vs Hailuo", body: "画像から動画への二つのモデルに、同じプロンプトを与えます。", link: { label: "比較を見る", href: "/models/kling-vs-hailuo" } },
        { title: "Seedance vs Kling", body: "ByteDanceと快手の動画モデルに、同じプロンプトを与えます。", link: { label: "比較を見る", href: "/models/seedance-vs-kling" } },
        { title: "Hailuo vs Wan", body: "MiniMaxとAlibabaの動画モデルに、同じプロンプトを与えます。", link: { label: "比較を見る", href: "/models/hailuo-vs-wan" } },
        { title: "FLUX vs Seedream", body: "テキストから画像への二つのモデルに、同じプロンプトを与えます。", link: { label: "比較を見る", href: "/models/flux-vs-seedream" } },
      ],
    },
  ],
  faq: {
    heading: "よくある質問",
    items: [
      {
        question: "どのモデルに対応していますか？",
        answer: `主要なモデルに対応しています。Flux、Seedance、Wan、Veo、Kling、Hailuo、Qwen Image、Whisper、ElevenLabs、Sunoなどで、FAL、KIE、OpenAI、Anthropic、Gemini、Replicate、Together、Groq、Mistral、OpenRouter、HuggingFaceといったプロバイダー経由で利用します。モデルは、${LOCAL_RUNTIMES}を使って自分のコンピューターで動かすこともできます。`,
      },
      {
        question: "「自分のキーを使う」とは、私にとってどういうことですか？",
        answer:
          "自分のキーを使う（BYOK）とは、自分のプロバイダーAPIキーを接続することです。リクエストはそれらのプロバイダーに送られ、公開されている料金をプロバイダーに直接支払います。NodeToolは上乗せもクレジット制度もありません。",
      },
      {
        question: "NodeToolはモデルの価格に上乗せしますか？",
        answer: "いいえ。自分のAPIキーを接続した場合、プロバイダーの公開価格をプロバイダーに直接支払います。NodeToolは何も上乗せしません。",
      },
      {
        question: "モデルをローカルで動かせますか？",
        answer: `はい。Studioは、${LOCAL_RUNTIMES}（MLXはApple Silicon向け）によるローカルモデルに対応しています。使えるモデルと速度は、お使いのハードウェアで決まります。ローカルモデルへのリクエストはあなたのコンピューターで処理されます。オンラインのプロバイダーには、あなたが送ったリクエストが引き続き届きます。`,
      },
    ],
  },
  readMore: {
    heading: "関連ページ",
    links: [
      { label: "プロバイダーとAPIキー", href: "/providers" },
      { label: "料金", href: "/pricing" },
      { label: "ノードワークフロー", href: "/node-based-workflows" },
      { label: "モデルとプロバイダーのガイド", href: "https://docs.nodetool.ai/models-and-providers" },
      { label: "ローカルモデルとクラウドモデル", href: "https://docs.nodetool.ai/models" },
      { label: "コストとクレジットのガイド", href: "https://docs.nodetool.ai/costs-and-credits" },
    ],
  },
  closing: {
    title: "ツールを替えずに、モデルを替える。",
    body: "無料のオープンソースのStudioをダウンロードして、すでに持っているプロバイダーキーをつなぐか、モデルをローカルで動かしてください。",
  },
};
