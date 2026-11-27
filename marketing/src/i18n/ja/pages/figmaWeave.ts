import type { LocalizedPageContent } from "@/i18n/content";

/**
 * Translates /alternatives/figma-weave (competitorEntries.ts, the comparison
 * template). The credit-cost table and the list of related alternatives are
 * left out: the first carries prices.
 */
export const figmaWeave: LocalizedPageContent = {
  route: "/alternatives/figma-weave",
  name: "Figma Weaveとの比較",
  title: "Figma Weaveの代替：オープンソースでセルフホスト可能 | NodeTool",
  description:
    "オープンソースでセルフホストできる、Figma Weaveの代替を比較します。NodeToolは自分のAPIキーとローカルモデルを使え、ワークフローを自分で実行して所有できます。",
  hero: {
    kicker: "Figma Weaveの代替",
    h1: "オープンソースのFigma Weave代替。自分のキーで。",
    lead: "Figma Weaveは、Figmaの製品群の中にあるホスト型のAIキャンバスです。NodeToolはオープンソースで、自分のキーを使い、セルフホストでき、自分のコンピューターでローカルモデルも動かせます。",
    note: "ブラウザ、ホスト型、クローズドソース · NodeToolはオープンソースで、自分のキーを使います",
    secondary: { label: "Figma Weaveと見比べる", href: "#compare" },
  },
  sections: [
    {
      kind: "table",
      id: "compare",
      title: "NodeToolとFigma Weave",
      intro: "Figma Weaveは、独自のAIクレジットで課金されるクローズドなホスト型キャンバスで、セルフホストはできません。NodeToolはオープンソースで、自分のキーでプロバイダーを呼び出します。",
      head: ["機能", "Figma Weave", "NodeTool"],
      rows: [
        ["料金モデル", "AIクレジット（月額プラン）", "自分のキー、プロバイダーの公開価格"],
        ["モデル", "厳選された一覧", "OpenAI、Anthropic、Google、fal.ai、Replicate、Kie.ai、ローカル"],
        ["ソース", "クローズド", "AGPL-3.0"],
        ["無料枠", "毎月の無料クレジット（動画は対象外）", "Studioは無料"],
        ["セルフホスト", "いいえ", "はい"],
        ["デスクトップアプリとオフライン", "いいえ", "デスクトップアプリ。ローカルモデルならオフライン可"],
        ["ローカルモデル（Ollama、MLX、llama.cpp）", "いいえ", "はい"],
      ],
      note: "Figma Weaveの料金はweave.figma.com/pricingで確認してください。NodeToolの費用は料金のページにあります。",
    },
    {
      kind: "text",
      id: "when-weave",
      title: "Figma Weaveが向いているとき。",
      body: [
        "すでにFigmaでデザインしているチームで、インストール不要のホスト型キャンバスがほしいなら、Figma Weaveが合います。クレジットで課金される厳選モデル一覧が、予算の立て方に合うときに選んでください。",
        "自分のキャンバスとワークフローを持ち、自分のキーでプロバイダーの価格どおりに支払いたい、または自分のコンピューターでモデルを動かしたいなら、NodeToolが合います。",
      ],
      links: [{ label: "料金を見る", href: "/pricing" }],
    },
  ],
  faq: {
    heading: "よくある質問",
    items: [
      {
        question: "Figma WeaveとWeavyは同じものですか？",
        answer:
          "はい。Figmaは2025年10月にWeavyを買収し、Figma Weaveに名前を変えました。weave.figma.comで独立した製品として動き、独自のAIクレジットと課金があってFigma本体とは別です。今後、Figmaのプラットフォームに徐々に統合されていきます。",
      },
      {
        question: "NodeToolで動かせる画像・動画モデルは何ですか？",
        answer:
          "Flux、Seedream、GPT Image、Nano Banana、Recraft、Veo、Kling、Seedance、Sora、Hailuo、Wanを、fal.ai、Replicate、Kie.ai、AtlasCloud、OpenAI、Googleなどのプロバイダー経由で使えます。加えて、Ollama、MLX、llama.cppでローカルモデルも動かせます。",
      },
      {
        question: "NodeToolもFigma Weaveのようにクレジットを使いますか？",
        answer:
          "いいえ。NodeToolはクレジットを販売せず、自分のキーを使う場合は何も上乗せしません。プロバイダーのAPIキーをつないで、各プロバイダーの公開価格を直接支払うか、対応するローカルモデルを自分のハードウェアで動かします。",
      },
      {
        question: "チームでNodeToolをセルフホストして、ワークフローを共有できますか？",
        answer:
          "はい。NodeToolはAGPL-3.0のオープンソースで、Dockerを使って自分のサーバーで動かすことも、macOS、Windows、Linuxのデスクトップアプリとして動かすこともできます。ワークフローとプロジェクトはファイルとして保存されるので、バージョン管理、共有、マシンをまたいだ再実行ができます。",
      },
    ],
  },
  readMore: {
    heading: "関連ページ",
    links: [
      { label: "すべての代替ツール", href: "/alternatives" },
      { label: "料金", href: "/pricing" },
      { label: "対応モデル", href: "/models" },
    ],
  },
  closing: {
    title: "自分のキャンバスとワークフローを、自分のものに。",
    body: "Studioをダウンロードしてください。オープンソースで、自分のキーを使い、主要なクラウドやローカルのプロバイダーを公開価格で利用できます。",
  },
};
