import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /marketing (app/marketing/page.tsx, data/marketingPage.ts). */
export const marketing: LocalizedPageContent = {
  route: "/marketing",
  name: "広告・マーケティング",
  title: "AI広告制作 | オープンソースのAI広告ソフトウェア · NodeTool",
  description:
    "NodeToolは、オープンソースのAI広告ソフトウェアです。エージェントに商品写真と企画を渡すと、広告のストーリーボードを作り、プロバイダーキーで静止画とクリップをレンダリングして、編集できるタイムラインにカットします。",
  hero: {
    kicker: "広告とマーケティング",
    h1: "AIで広告を作る。",
    lead: "NodeToolは、オープンソースのAI広告ソフトウェアです。エージェントに商品写真と企画を渡すと、広告のストーリーボードを作り、プロバイダーキーで静止画とクリップをレンダリングして、編集できるタイムラインにカットします。",
    note: "開いて編集できるサンプル広告が{adCount}本 · 自分のキーでFlux、Veo、Kling、Seedanceを利用",
    secondary: { label: "広告ライブラリを見る", href: "/ad-library" },
  },
  sections: [
    {
      kind: "catalog",
      id: "ads",
      title: "{adCount}の広告コンセプトのうち4つ。どれも編集できるNodeToolのタイムラインからレンダリングしています。",
      intro: "ブランド、コピー、数字はすべて架空です。",
      source: "adLibrary",
      slugs: ["kinetic-offer-wall", "benefit-led-dashboard-punch-in", "binary-choice-participation-card", "result-seen-through-the-product"],
      link: { label: "すべてのコンセプトを見る", href: "/ad-library" },
    },
    {
      kind: "steps",
      id: "campaign",
      title: "一つの企画、一式のキャンペーン素材、一度の修正。",
      intro: "「演出するキャンペーンキット」レシピの、実際の実行結果です。カップは架空のデモ商品です。公開する前に、生成された商品の形状と素材を、実在するブランドの参照画像と照らし合わせてください。",
      steps: [
        { title: "メインビジュアル、16:9", body: "GPT Image 2.5が企画からメインビジュアルをレンダリングします。水面の上のコバルトブルーの台、琥珀色の日の出、左側にコピー用の余白を残した構図です。" },
        { title: "ソーシャル1:1と縦型9:16", body: "対になる編集モデルが、各サイズに構図を作り直します。カップ、シーン、色調を保つよう指示します。正方形は左上にコピー用の余白を残し、縦型は上の三分の一を空けます。" },
        { title: "修正", body: "「水しぶきを半分ほどに減らし、左側の濃紺のコピー用の余白を広げて」。編集モデルには、商品、シーン、配色、カメラを保つよう指示したので、変わったのは水しぶきとコピー用の余白だけです。" },
      ],
      links: [{ label: "手順どおりに進める", href: "/recipes/directed-campaign-kit" }],
    },
    {
      kind: "cards",
      id: "more",
      title: "広告チーム向けのその他のページ",
      cards: [
        { title: "広告ライブラリ", body: "縦型の短い広告のコンセプト。それぞれにビート、長さ、コピーの文字数の上限、レンダリング済みのサンプルが付いています。", link: { label: "開く", href: "/ad-library" } },
        { title: "サンプルのストーリーボード", body: "完成した広告と、それを構成するすべてのショット。", link: { label: "開く", href: "/storyboards" } },
        { title: "レシピ", body: "キャンペーンキット、UGC動画、商品コマーシャル、商品カタログ画像を、一歩ずつ。", link: { label: "開く", href: "/recipes" } },
      ],
    },
  ],
  faq: {
    heading: "AI広告クリエイティブ：よくある質問",
    items: [
      {
        question: "AIは商品写真を動画広告にできますか？",
        answer:
          "できます。NodeToolでは、商品写真を使って商品をエンティティとして保存し、企画を書くと、エージェントが広告のストーリーボードを作ります。各ショットは、選んだ画像モデルで静止画を、動画モデルでクリップをレンダリングし、「タイムラインを作成」がそれらを、トリムして書き出せるカットに組み立てます。公開する前に、生成された商品を実際の商品と比べてください。",
      },
      {
        question: "広告の9:16、4:5、1:1のバージョンはどう作りますか？",
        answer:
          "タイムラインメニューの「サイズを変換」が、同じ素材から、9:16、1:1、4:5の各サイズの新しいシーケンスを作り、元のカットはそのまま残ります。中央でのクロップか、追跡した被写体に合わせたリフレームを選べ、セーフマージンも設定できます。",
      },
      {
        question: "一つの広告を、カタログの別の商品に使い回せますか？",
        answer:
          "できます。Per-SKU Ad Factoryテンプレートは、Recast Storyboardノードで、承認済みのストーリーボードを別の商品にコピーします。プロンプトが変わらないフレームは残り、商品が映るショットだけが再レンダリングされます。",
      },
      {
        question: "NodeToolでAI広告クリエイティブを作るといくらかかりますか？",
        answer: "NodeToolは無料のオープンソースです。レンダリングは自分のプロバイダーキーで、プロバイダーの価格で動き、確定する前にレンダリングのダイアログに見積もりが表示されます。",
      },
      {
        question: "NodeToolが広告主向けにしないことは何ですか？",
        answer:
          "AIアバターの素材ライブラリはなく、広告の成果を予測せず、広告プラットフォームへの配信もしません。作るのはクリエイティブです。静止画、クリップ、編集できるタイムラインを作り、書き出してアップロードするのはあなたです。",
      },
    ],
  },
  closing: {
    title: "次の商品で、この流れを試しましょう。",
    body: "macOS、Windows、Linux向けの無料のオープンソースのスタジオをダウンロードして、「演出するキャンペーンキット」を開いてください。",
  },
};
