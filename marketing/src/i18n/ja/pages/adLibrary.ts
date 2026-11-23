import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /ad-library (app/ad-library/page.tsx, components/adLibrary). */
export const adLibrary: LocalizedPageContent = {
  route: "/ad-library",
  name: "動画広告テンプレート",
  title: "動画広告テンプレート | 編集できるSNS向け短尺広告 · NodeTool",
  description:
    "SNS向けの短い広告に使える、編集可能な動画広告テンプレートです。各テンプレートはビートごとの長さ、構図、コピーの語数、必要な素材を定めています。NodeToolではミニアプリとして、あなたの画像、ロゴ、コピーから縦型の広告を作れます。",
  hero: {
    kicker: "動画広告テンプレート",
    h1: "アイデアが明確なら、広告は作る価値がある。",
    lead: "SNS向けの短い広告に使える、編集可能な動画広告テンプレートを{adCount}本そろえました。各テンプレートはビートごとの長さ、構図、コピーの語数の上限、必要な素材を定めていて、NodeToolではミニアプリとして使えます。あなたの画像、ロゴ、コピーから縦型の広告を作れます。",
    note: "{adCount}テンプレート · 8〜15秒 · 9:16、4:5、1:1",
    secondary: { label: "テンプレートを見る", href: "#concepts" },
  },
  sections: [
    {
      kind: "catalog",
      id: "concepts",
      title: "テンプレートを選ぶ。",
      intro: "どのテンプレートも、ビートの長さどおりにレンダリングしたNodeToolのタイムラインを再生します。ブランド、コピー、数字はすべて架空です。",
      source: "adLibrary",
    },
    {
      kind: "text",
      id: "more",
      title: "すべての工程を見せる完全なプロジェクトを見たい方へ",
      body: ["レシピや、ショットごとに見られるAI絵コンテの作例をご覧ください。"],
      links: [
        { label: "レシピ", href: "/recipes" },
        { label: "絵コンテの作例", href: "/storyboards" },
      ],
    },
  ],
  closing: {
    title: "自分の素材で、縦型の広告を作りましょう。",
    body: "無料のオープンソースのStudioをダウンロードし、広告テンプレートを開いて、あなたの画像、ロゴ、コピーに差し替えてください。",
  },
};
