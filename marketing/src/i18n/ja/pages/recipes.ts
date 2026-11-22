import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /recipes (app/recipes/page.tsx). */
export const recipes: LocalizedPageContent = {
  route: "/recipes",
  name: "レシピ",
  title: "レシピ | 一つのアイデアから、一歩ずつ形にする · NodeTool",
  description:
    "作りたいものを選び、ストーリーボードや脚本のガイドに沿って一歩ずつ進めます。各パートを確認し、エディターで手を入れ続けられます。キャンペーンキット、UGC動画、商品コマーシャル、多言語動画、商品カタログ、トレーラー。",
  hero: {
    kicker: "レシピ",
    h1: "一つのアイデアから。一歩ずつ形にする。",
    lead: "作りたいものを選びます。ストーリーボードや脚本のガイドに沿って進め、各パートを確認し、そのままエディターで仕上げます。",
    secondary: { label: "レシピを見る", href: "#recipes" },
  },
  sections: [
    {
      kind: "catalog",
      id: "recipes",
      title: "どのレシピも、実際に実行したプロジェクトです。",
      intro: "どれかを開くと、各ステップと、その結果として得られたものを確認できます（英語のページ）。",
      source: "recipes",
    },
    {
      kind: "text",
      id: "editable",
      title: "どのパートも、編集できるまま。",
      body: [
        "エンティティで登場人物と商品の見た目を揃えます。ストーリーボードでフレームを確認し、脚本をセリフごとに調整して、最後にタイムラインですべてをまとめます。",
      ],
      links: [
        { label: "ショットごとのサンプルストーリーボードを見る", href: "/storyboards" },
        { label: "編集できる動画広告のコンセプトから始める", href: "/ad-library" },
      ],
    },
  ],
  readMore: {
    heading: "関連ページ",
    links: [
      { label: "ワークフローテンプレート", href: "/templates" },
      { label: "広告ライブラリ", href: "/ad-library" },
      { label: "クックブック", href: "https://docs.nodetool.ai/cookbook" },
      { label: "ユースケースのガイド", href: "https://docs.nodetool.ai/use-cases" },
    ],
  },
  closing: {
    title: "レシピを一つ読み込み、読んで、実行する。",
    body: "無料のオープンソースのStudioをダウンロードしてください。各レシピは一つのファイルとして読み込めます。実行したくなったら、プロバイダーキーを追加します。",
  },
};
