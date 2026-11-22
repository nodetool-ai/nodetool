import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /ad-library (app/ad-library/page.tsx, components/adLibrary). */
export const adLibrary: LocalizedPageContent = {
  route: "/ad-library",
  name: "広告ライブラリ",
  title: "動画広告のコンセプト | 編集できるソーシャル向け短尺広告 · NodeTool",
  description:
    "ソーシャル向けの短い広告のための、編集できる動画広告のコンセプトです。各コンセプトは、ビートごとの長さ、構図、コピーの文字数、素材を定め、NodeToolではミニアプリとして、あなたの画像、ロゴ、コピーから縦型の広告を作れます。",
  hero: {
    kicker: "動画広告のコンセプト",
    h1: "アイデアが明確だから、広告を作る価値がある。",
    lead: "ソーシャル向けの短い広告のための、編集できる動画広告のコンセプトが{adCount}本あります。各コンセプトは、ビートごとの長さ、構図、コピーの文字数の上限、素材を定め、NodeToolではミニアプリとして使えます。あなたの画像、ロゴ、コピーから、縦型の広告を作れます。",
    note: "{adCount}コンセプト · 8〜15秒 · 9:16、4:5、1:1",
    secondary: { label: "コンセプトを見る", href: "#concepts" },
  },
  sections: [
    {
      kind: "catalog",
      id: "concepts",
      title: "コンセプトを選ぶ。",
      intro: "各コンセプトは、ビートの長さどおりに、レンダリング済みのNodeToolのタイムラインを再生します。ブランド、コピー、数字はすべて架空です。",
      source: "adLibrary",
    },
    {
      kind: "text",
      id: "more",
      title: "すべてのステップを見せる完全なプロジェクトを見たいですか？",
      body: ["レシピや、ショットごとに見られるサンプルのAIストーリーボードをご覧ください。"],
      links: [
        { label: "レシピ", href: "/recipes" },
        { label: "サンプルのストーリーボード", href: "/storyboards" },
      ],
    },
  ],
  closing: {
    title: "自分の素材で、縦型の広告を作りましょう。",
    body: "無料のオープンソースのStudioをダウンロードして、広告のコンセプトを開き、あなたの画像、ロゴ、コピーに差し替えてください。",
  },
};
