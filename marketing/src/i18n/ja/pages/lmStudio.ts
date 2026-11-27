import type { LocalizedPageContent } from "@/i18n/content";

/**
 * Translates /alternatives/lm-studio (competitorEntries.ts, the comparison
 * template with the local language model runtime visuals). Left out: the
 * three product screenshots of the stages (the steps carry their text, and the
 * hero reel stays), and the list "What are the best LM Studio alternatives?",
 * which names other English-market tools.
 */
export const lmStudio: LocalizedPageContent = {
  route: "/alternatives/lm-studio",
  name: "LM Studioとの比較",
  title: "LM Studioの代替：ローカルモデルのワークフロー | NodeTool",
  description:
    "Windowsなどで使えるLM Studioの代替を、ローカル型とオープンソースで比較します。NodeToolはローカルモデルをエージェント、ドキュメント検索、メディア生成のワークフローにつなげます。",
  hero: {
    kicker: "LM Studioの代替",
    h1: "ローカルモデルを、チャットの先へ。",
    lead: "Ollama、MLX、llama.cppでモデルを動かし、そのままエージェント、ドキュメント検索、画像・動画・音楽のワークフローで使えます。",
    note: "オープンソース · ローカルとホスト型のモデル · 自分のプロバイダーアカウント",
    secondary: { label: "LM Studioと見比べる", href: "#compare" },
    media: {
      kind: "reel",
      base: "/hero-nodes",
      alt: "NodeToolのワークフローをつなぎます。型が合わないエッジは拒否され、五つのショットがFor Each、Text To Image、Image To Video、Collect、Concatenate Videoを通って一つのカットになり、その後に画像モデルが差し替えられます",
      caption: "ノードは手でつなぐことも、エージェントにグラフを作らせることもできます。型の合わない接続は実行前に検出され、モデルはその場で差し替えられます。",
    },
  },
  sections: [
    {
      kind: "steps",
      id: "stages",
      title: "ローカルモデルからワークフローへ",
      intro: "チャットは入り口の一つです。同じモデルを、エージェントや複数ステップのワークフローの中でも動かせます。",
      steps: [
        {
          title: "接続したどのモデルともチャット",
          body: "ローカルモデルかホスト型モデルを選んでチャットします。生成したメディアは会話に残ります。",
          meta: "1. チャット",
        },
        {
          title: "ローカルモデルを一か所で管理",
          body: "ローカルモデルの閲覧、ダウンロード、管理ができ、各モデルが使えるノードも確認できます。",
          meta: "2. モデル",
        },
        {
          title: "ワークフローの中でモデルを使う",
          body: "モデルをグラフにつなぎ、エージェント、ドキュメント検索、生成ノードと組み合わせます。",
          meta: "3. ワークフロー",
        },
      ],
    },
    {
      kind: "table",
      id: "compare",
      title: "NodeToolとLM Studio",
      intro:
        "LM Studioは、デスクトップ向けのローカル言語モデル実行環境です。NodeToolは、画像、動画、音声、テキストのワークフローのためのオープンソースの制作ワークスペースで、エージェントを備え、デスクトップまたはセルフホストで動かせ、自分のプロバイダーアカウントを使います。",
      head: ["機能", "LM Studio", "NodeTool"],
      rows: [
        ["ローカル言語モデルのチャットとモデルブラウザ", "専用設計で完成度が高い", "Ollama、MLX、llama.cpp経由で対応"],
        ["OpenAI互換のローカルサーバー", "はい", "プロバイダー連携経由"],
        ["ネイティブのメディア生成（画像、動画、音楽）", "いいえ", "はい"],
        ["エージェントとドキュメント検索", "ドキュメントとのチャットとMCPツール", "編集できるエージェントと検索のワークフロー"],
        ["クラウドプロバイダー（自分のキー）", "いいえ", "はい"],
        ["ソース", "プロプライエタリ（無料）", "AGPL-3.0（オープンソース）"],
        ["ビジュアルキャンバス", "いいえ", "はい"],
      ],
    },
    {
      kind: "text",
      id: "when-lm-studio",
      title: "LM Studioが向いているとき",
      body: [
        "ローカルモデルをダウンロードし、ドキュメントとチャットし、MCPツールをつなぎ、OpenAI互換のエンドポイントを提供したいなら、LM Studioのほうが特化した選択肢です。",
        "NodeToolは、ローカルモデルをビジュアルなワークフローの中で、検索、画像、動画、音声のステップと並べて使えます。エージェントがそのワークフローを作成して修正でき、エディターは生成したメディアを編集できるプロジェクトとして保持します。",
        "LM Studioもドキュメント検索とMCPツールに対応していますが、デスクトップの画面はローカルモデルのチャットと提供が中心です。NodeToolは、編集できるクリエイティブなワークフローとメディア制作が中心です。",
      ],
      links: [
        { label: "LM Studioのドキュメントチャット", href: "https://lmstudio.ai/docs/app/basics/rag" },
        { label: "LM StudioのMCPツール", href: "https://lmstudio.ai/docs/developer/core/mcp" },
      ],
    },
  ],
  faq: {
    heading: "よくある質問",
    items: [
      {
        question: "NodeToolとLM Studioの違いは何ですか？",
        answer:
          "LM Studioは、ローカルのGGUF言語モデルを動かすことに特化したデスクトップアプリで、モデルブラウザ、チャット画面、OpenAI互換のローカルサーバーを備えています。NodeToolはオープンソースのビジュアルキャンバスで、ローカルモデルもOllama、MLX、llama.cpp経由で動かせます。さらに、画像、動画、音楽を生成し、モデルを軸にしたエージェントやドキュメント検索のワークフローを組み立てられます。",
      },
      {
        question: "ローカルモデルにはLM StudioとNodeToolのどちらを使うべきですか？",
        answer:
          "ローカル言語モデルをダウンロードしてチャットしたい、またはOpenAI互換のエンドポイントで提供したいだけなら、LM Studioのほうが特化したツールです。ローカル（とクラウド）のモデルを使って、検索、エージェント、メディア生成などのワークフローを組みたいなら、NodeToolがそのためのキャンバスです。",
      },
      {
        question: "NodeToolはオープンソースですか？",
        answer:
          "はい。NodeToolはAGPL-3.0のオープンソースで、macOS、Windows、Linuxのデスクトップアプリとして動きます。LM Studioは無料ですが、プロプライエタリです。",
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
    title: "ローカルのチャットから、ワークフロー全体へ。",
    body: "Studioをダウンロードして、ローカルモデルをキャンバスに置き、生成、エージェント、ドキュメント検索と組み合わせてください。",
  },
};
