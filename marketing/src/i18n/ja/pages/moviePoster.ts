import type { LocalizedPageContent } from "@/i18n/content";

/**
 * Translates /use-cases/movie-poster (app/use-cases/movie-poster/page.tsx and
 * layout.tsx, with the steps and FAQ from data/useCaseEntries.ts). Left out:
 * the live graph of the Movie Posters workflow (a React component, not data),
 * the "Start with the Movie Posters workflow" starter block, the row of five
 * poster images (one shows beside the concepts; a portrait poster as the
 * full-width hero filled the screen), and
 * the model cards, which the models section states in text. The page states no
 * prices, so no price tokens appear.
 */
export const moviePoster: LocalizedPageContent = {
  route: "/use-cases/movie-poster",
  name: "AI映画ポスタージェネレーター",
  title: "AI映画ポスター生成：ビリングブロック付き | NodeTool",
  description:
    "タイトル、ジャンル、観客層から、AIで映画ポスターを作成します。ストーリーのコンセプト、キービジュアル、キャッチコピー、ビリングブロックまで、自分のキーを使うオープンソースのキャンバスで。",
  hero: {
    kicker: "ユースケース · デザイン",
    h1: "AIで映画ポスターを作る",
    lead: "映画のタイトル、ジャンル、観客層を入力すると、NodeToolがクリエイティブ戦略を書き、映画ポスターのコンセプトを複数レンダリングします。それぞれにタイトル、キャッチコピー、ビリングブロック（クレジット表記）が入ります。自分のGeminiとGPT Image-2のキーで動くオープンソースのワークフローで、どの映画でも再実行できます。",
    secondary: { label: "仕組みを見る", href: "#how-it-works" },
  },
  sections: [
    {
      kind: "steps",
      id: "how-it-works",
      title: "仕組み",
      intro: "少数のノードで作業が完結します。ブリーフが戦略になり、戦略がコンセプトになり、コンセプトがキービジュアルになります。",
      steps: [
        {
          title: "ブリーフを決める",
          body: "三つのテキスト入力に、映画のタイトル、ジャンル、売り込む観客層を入れます。クリエイティブな入力はこれだけです。",
          meta: "Singularity · SF · AI愛好家",
        },
        {
          title: "戦略を書く",
          body: "Promptノードがブリーフを整え、エージェントが本格的なクリエイティブ戦略を返します。ポジショニング、観客のインサイト、中心となるビジュアルのコンセプト、カラーパレットです。",
          meta: "ポジショニング · 観客のインサイト · 16進数のパレット",
        },
        {
          title: "コンセプトを出す",
          body: "同じブリーフから複数のコンセプトを生成し、一つを選んで掘り下げます。",
          meta: "一回の実行で五つのストーリーコンセプト",
        },
        {
          title: "キービジュアルをレンダリングする",
          body: "各コンセプトは劇場公開用のポスタープロンプトに展開され、画像モデルがタイトル、キャッチコピー、ビリングブロックまで含めてレンダリングします。",
          meta: "GPT Image-2 · 2K · 本場ハリウッドのレイアウト",
        },
      ],
    },
    {
      kind: "text",
      id: "concepts",
      title: "一つのタイトルから、五つのコンセプト",
      body: [
        "同じブリーフでも、実行のたびに新しい戦略が出てきます。ここでは『Singularity』を五つのポスターコンセプトとしてレンダリングした結果を、キャンバスからそのまま載せています。",
      ],
      bullets: [
        "“The end of time isn't the end.”（時の終わりは、終わりではない。）",
        "“The end of limits. The beginning of everything.”（限界の終わり。すべての始まり。）",
        "“The future is not ours to control.”（未来は、私たちの手の中にはない。）",
        "“The end of man is only the beginning.”（人類の終わりは、始まりにすぎない。）",
        "“The future doesn't evolve. It accelerates.”（未来は進化しない。加速する。）",
      ],
      media: {
        kind: "image",
        src: "/poster-singularity-3-800.webp",
        width: 800,
        height: 1200,
        alt: "『Singularity』のポスターコンセプト：“The future is not ours to control.”",
        caption: "“The future is not ours to control.”",
      },
    },
    {
      kind: "cards",
      id: "direct-it",
      title: "自分でディレクションする",
      intro: "固定されたものはありません。モデルの差し替え、トーンの変更、コンセプトの引き直し、別のタイトルへの切り替えができます。",
      cards: [
        {
          title: "画像モデルを差し替える",
          body: "GPT Image-2、Flux、Nano Banana、Ideogram。ノードを一つ変えるだけで、バッチ全体が新しい見た目で再レンダリングされます。",
        },
        {
          title: "トーンを変える",
          body: "ジャンルや観客層を変えると、戦略、パレット、ポスターがそれに合わせて変わります。ブリーフを手で書き直す必要はありません。",
        },
        {
          title: "ポスターのレシピを編集する",
          body: "ポスターのPromptノードが、構図、タイポグラフィ、ビリングブロックのレイアウトを受け持ちます。一度調整すれば、以後のレンダリングはすべてそれに従います。",
        },
        {
          title: "どのタイトルでもバッチ処理",
          body: "新しいタイトルを入れて、もう一度実行します。再利用できるのはワークフローで、ポスターはその回の出力にすぎません。",
        },
      ],
    },
    {
      kind: "text",
      id: "models",
      title: "このワークフローで使うモデル",
      body: [
        "自分のキーで呼び出します。請求はプロバイダーから届き、NodeToolからではありません。トークンへの上乗せはなく、より良いモデルが出た日に差し替えられます。",
        "Gemini 3.1 Pro Preview（Gemini）が戦略とストーリーコンセプトを書き、GPT Image-2（kie）がキービジュアルをレンダリングします。",
      ],
    },
  ],
  faq: {
    heading: "よくある質問",
    items: [
      {
        question: "AIで映画ポスターを作るには？",
        answer:
          "NodeToolなら四つのノードで作れます。タイトル、ジャンル、観客層を入力し、エージェントがクリエイティブ戦略を書き、リストジェネレーターがそれを異なるストーリーコンセプトに展開し、画像モデルが各コンセプトを、タイトル、キャッチコピー、ビリングブロックまで含めた劇場公開用のポスターとしてレンダリングします。",
      },
      {
        question: "無料のAI映画ポスタージェネレーターはありますか？",
        answer:
          "NodeToolはオープンソースで、macOS、Windows、Linux向けに無料でダウンロードでき、Movie Postersワークフローも同梱されています。実行のたびに、自分のプロバイダーキーでテキストモデルと画像モデルを呼び出すので、レンダリングの料金はプロバイダーから請求され、NodeToolは何も上乗せしません。",
      },
      {
        question: "ビリングブロックとは何ですか？ AIポスターにも入りますか？",
        answer:
          "ビリングブロックは、劇場公開用ポスターの下部にあるクレジットのブロックです。キャスト、監督、プロデューサー、スタジオのロゴ、公開日が、縦に細長い書体で並びます。ポスタープロンプトは標準的なレイアウトで画像モデルにこれを求めるので、どのポスターにも入りますが、中の名前はモデルが書いた仮の文字です。実在のクレジットにするには、正確な名前をプロンプトに入れ、間違った文字はマスク編集で直してください。",
      },
      {
        question: "このワークフローはどのモデルを使いますか？",
        answer:
          "Gemini 3.1 Pro Previewが戦略とストーリーコンセプトを書き、GPT Image-2がキービジュアルをレンダリングします。どちらも自分のプロバイダーキーで、プロバイダーの価格どおりに呼び出します。",
      },
      {
        question: "別の画像モデルに差し替えられますか？",
        answer:
          "はい。GPT Image-2、Flux、Nano Banana、Ideogramはノード一つの差です。モデルを変えると、ワークフローの残りはそのままで、バッチ全体が新しい見た目で再レンダリングされます。",
      },
      {
        question: "デザイナーやPhotoshopは必要ですか？",
        answer:
          "いいえ。ポスターのPromptノードが構図、タイポグラフィ、ビリングブロックのレイアウトを受け持つので、実行のたびに仕上がったポスターコンセプトができます。新しいタイトルを入れてもう一度実行するだけで、再利用できるのはワークフローです。",
      },
    ],
  },
  readMore: {
    heading: "ほかのユースケース",
    links: [
      { label: "映画の予告編を作る", href: "/use-cases/movie-trailer" },
      { label: "すべてのユースケース", href: "/#use-cases" },
    ],
  },
  closing: {
    title: "ポスターのセットをデザインする",
    body: "macOS、Windows、Linux向けのオープンソースのスタジオをダウンロードし、このワークフローを開けば、数分でキャンペーン分をレンダリングできます。",
    secondary: { label: "映画の予告編を作る", href: "/use-cases/movie-trailer" },
  },
};
