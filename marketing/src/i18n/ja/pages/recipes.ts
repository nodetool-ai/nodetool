import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /recipes (app/recipes/page.tsx). */
export const recipes: LocalizedPageContent = {
  route: "/recipes",
  name: "レシピ",
  title: "レシピ | 一つのアイデアを、一歩ずつ形に · NodeTool",
  description:
    "作りたいものを選び、絵コンテや台本のガイドに沿って一歩ずつ進めます。各パートを確認しながら、エディターで手を入れ続けられます。キャンペーンキット、UGC動画、商品コマーシャル、多言語動画、商品カタログ、トレーラー。",
  hero: {
    kicker: "レシピ",
    h1: "一つのアイデアから。一歩ずつ形に。",
    lead: "作りたいものを選んでください。絵コンテや台本のガイドに沿って進め、パートごとに確認し、そのままエディターで仕上げます。",
    secondary: { label: "レシピを見る", href: "#recipes" },
  },
  sections: [
    {
      kind: "catalog",
      id: "recipes",
      title: "どのレシピも、実際に作ったプロジェクトです。",
      intro: "どれかを開くと、各ステップと、そこから実際に生まれた成果物を確認できます。",
      source: "recipes",
    },
    {
      kind: "text",
      id: "editable",
      title: "どのパートも、あとから編集できます。",
      body: [
        "エンティティで登場人物と商品の見た目をそろえます。絵コンテでフレームを確認し、台本をセリフごとに調整して、最後にタイムラインですべてをまとめます。",
      ],
      links: [
        { label: "ショットごとに見られる絵コンテの作例", href: "/storyboards" },
        { label: "編集できる動画広告テンプレートから始める", href: "/ad-library" },
      ],
    },
  ],
  readMore: {
    heading: "関連ページ",
    links: [
      { label: "ワークフローテンプレート", href: "/templates" },
      { label: "動画広告テンプレート", href: "/ad-library" },
      { label: "クックブック", href: "https://docs.nodetool.ai/cookbook" },
      { label: "ユースケースのガイド", href: "https://docs.nodetool.ai/use-cases" },
    ],
  },
  closing: {
    title: "レシピを読み込んで、読んで、実行する。",
    body: "無料のオープンソースのStudioをダウンロードしてください。レシピはそれぞれ一つのファイルとして読み込めます。実行するときに、プロバイダーキーを追加します。",
  },
};
