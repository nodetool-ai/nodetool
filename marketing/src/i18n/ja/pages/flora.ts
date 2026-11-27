import type { LocalizedPageContent } from "@/i18n/content";

/**
 * Translates /alternatives/flora (competitorEntries.ts, the comparison
 * template with the creative canvas visuals). Left out: the three product
 * screenshots of the stages (the steps carry their text, and the hero reel
 * stays) and the list of other alternatives. The page states no prices, so no
 * price tokens appear.
 */
export const flora: LocalizedPageContent = {
  route: "/alternatives/flora",
  name: "Floraとの比較",
  title: "Floraの代替：オープンソースのAIキャンバスを自分のキーで | NodeTool",
  description:
    "Floraはクローズドでクレジット課金のホスト型キャンバスです。NodeToolは、画像、動画、音声、テキストを扱えるオープンソースのキャンバスで、自分のキーでセルフホストできます。",
  hero: {
    kicker: "Floraの代替",
    h1: "プロンプトも、レイヤーも、ワークフローも残る。",
    lead: "接続したプロバイダーのモデルで生成し、ほかのレイヤーには触れずに一つのレイヤーだけ描き直し、画像の裏にあるワークフローを再実行できます。",
    note: "オープンソース · ローカルとホスト型のモデル · 自分のプロバイダーアカウント",
    secondary: { label: "Floraと見比べる", href: "#compare" },
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
      title: "プロンプトから完成したアセットまで",
      intro: "画像はプロジェクトの終わりではありません。その裏にあるワークフローとレイヤーも、編集できる状態で残ります。",
      steps: [
        {
          title: "画像の裏にあるワークフロー",
          body: "プロンプト、参照画像、モデルはつながったノードなので、結果をたどって再実行できます。",
          meta: "1. 組み立てる",
        },
        {
          title: "レイヤーごとに仕上げる",
          body: "一つのレイヤーに説明を与えると、そのレイヤーだけが描き直されます。自分で描いたものはそのまま残ります。",
          meta: "2. 仕上げる",
        },
        {
          title: "絵コンテと動画へ",
          body: "同じプロジェクトに絵コンテがあり、承認した静止画をそこで動画クリップにできます。",
          meta: "3. つなげる",
        },
      ],
    },
    {
      kind: "table",
      id: "compare",
      title: "NodeToolとFlora",
      intro:
        "Floraは、ホスト型の無限キャンバスです。NodeToolは、画像、動画、音声、テキストのワークフローのためのオープンソースの制作ワークスペースで、エージェントを備え、デスクトップまたはセルフホストで動かせ、自分のプロバイダーアカウントを使います。",
      head: ["機能", "Flora", "NodeTool"],
      rows: [
        ["デザインと使い始めやすさ", "制作に特化したインターフェース", "奥行きを持たせたビジュアルキャンバス"],
        ["メディアの種類", "画像、動画", "画像、動画、音声、テキスト"],
        ["モデル", "厳選された一覧", "主要なプロバイダーすべて"],
        ["料金モデル", "クレジット", "自分のキー、プロバイダーの価格"],
        ["ソース", "クローズド", "AGPL-3.0"],
        ["セルフホストとデータの所有", "いいえ", "はい"],
        ["デスクトップアプリとローカルモデル", "いいえ", "はい"],
      ],
    },
    {
      kind: "text",
      id: "when-flora",
      title: "Floraが向いているとき",
      body: [
        "Floraは、実際に使っていて心地よいツールです。使い始めの案内もキャンバスもよく設計されていて、ホスト型でさっと画像や動画を作りたいときに手が伸びます。ただし、クローズドでクレジット課金です。モデルの一覧は厳選されたもので、レンダリングのたびにクレジットを消費し、作品は相手のプラットフォームに置かれます。",
        "NodeToolは、すぐ使える手軽な仕上がりを少し手放して、コントロールを取ります。画像、動画、音楽、テキストが一つのキャンバスを共有し、どのプロバイダーも自分のキーで公開価格のまま呼び出せ、ローカルモデルはOllama、MLX、llama.cppで動きます。エージェントファーストでもあり、やりたいことを説明すると、エージェントがグラフをつないで実行します。全体がAGPL-3.0のオープンソースなので、セルフホストでき、ファイルも手元に残せます。",
      ],
    },
  ],
  faq: {
    heading: "よくある質問",
    items: [
      {
        question: "NodeToolとFloraの違いは何ですか？",
        answer:
          "Floraは、AIの画像と動画向けのホスト型でクローズドソースのクリエイティブキャンバスで、クレジットで課金されます。NodeToolはオープンソース（AGPL-3.0）のビジュアルキャンバスで、自分のキーで動かし、画像、動画、音声、テキストを扱えます。主要なプロバイダーすべてに公開価格で接続でき、セルフホストも、ローカルモデルを使うデスクトップアプリとしての利用もできます。",
      },
      {
        question: "NodeToolはFloraの無料の代替になりますか？",
        answer:
          "NodeTool Studioは無料でダウンロードでき、オープンソースです。支払うのは、呼び出したプロバイダーへの公開価格分だけで、自分のAPIキーを使います。クレジットもプラットフォームの上乗せもありません。自分のハードウェアでローカルモデルを無料で動かすこともできます。",
      },
      {
        question: "ホスト型のキャンバスではなく、NodeToolをセルフホストできますか？",
        answer:
          "はい。NodeToolはAGPL-3.0のオープンソースでセルフホストでき、NodeTool Cloudは同じコードのマネージドホスティングです。どちらでも、ワークフローとファイルは自分のものです。",
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
    title: "自分のものになるキャンバスで作る。",
    body: "Studioをダウンロードして、画像、動画、音声、テキストをまたいで作ってください。キーも、ファイルも、自分のものです。",
  },
};
