import type { LocalizedPageContent } from "@/i18n/content";
import { HOSTED_PROVIDERS, LOCAL_RUNTIMES, OPEN_SOURCE_LINE } from "../shared";

/** Translates /node-based-workflows (app/node-based-workflows/page.tsx). */
export const nodeBasedWorkflows: LocalizedPageContent = {
  route: "/node-based-workflows",
  name: "ノードワークフロー",
  title: "ノードワークフロー | 確認でき、実行でき、何度でも再実行できるAIワークフロー · NodeTool",
  description:
    "NodeToolは、オープンソースのノードベースAIワークフローキャンバスです。画像、動画、音声、テキストのモデルを一つのグラフにつなぎ、各ステップが動く様子を見て、同じグラフを新しい入力でもう一度実行できます。",
  hero: {
    kicker: "ノードワークフロー",
    h1: "確認でき、実行でき、何度でも再実行できるノードワークフロー。",
    lead: "NodeToolは、オープンソースのノードベースAIワークフローキャンバスです。画像、動画、音声、テキストのモデルを一つのグラフにつなぎ、各ステップが動く様子を見て、同じグラフを新しい入力でもう一度実行できます。",
    note: OPEN_SOURCE_LINE,
    secondary: { label: "ワークフローテンプレートを見る", href: "/templates" },
    media: {
      kind: "reel",
      base: "/hero-nodes",
      alt: "NodeToolのワークフローをつなぎます。型が合わないエッジは拒否され、五つのショットがFor Each、Text To Image、Image To Video、Collect、Concatenate Videoを通って一つのカットになり、その後に画像モデルが差し替えられます",
      caption: "つなぐところから完成したカットまで、一つのワークフロー。ショットはNodeToolに同梱のUnder the Bedのサンプルによるものです。",
    },
  },
  sections: [
    {
      kind: "cards",
      id: "fail-early",
      title: "有料の実行の前に、切れた配線を見つける。",
      intro: "Kie.aiでは、5秒の{clipModel}クリップを5本作ると{fiveClipPrice}かかります。その費用がかかるワークフローは、9番目のステップではなく、最初の呼び出しの前に失敗するべきです。NodeToolは次の仕組みで、早く、分かりやすくエラーを出します。",
      cards: [
        { title: "型付きのポート", body: "すべての入力と出力が、テキスト、画像、動画、音声、リストなどの型を宣言します。エディターは接続を受け付ける前に型を確認するので、動画がテキストプロンプトにつながることはありません。" },
        { title: "支払う前のチェック", body: "nodetool validateはグラフを実行せずに読み取り、不明なノード、足りない必須フィールド、型の合わないエッジ、存在しないモデルIDを報告します。エージェントもvalidate_workflowツールで同じチェックを使えます。" },
        { title: "すべてのステップが画面に見える", body: "各ノードは、待機中か、実行中か、完了したかを表示し、自分の出力を保持します。実行が失敗したときは、どのステップで何が出力されたかを確認できます。" },
        { title: "グラフはそのままにモデルを替える", body: "Text To Image、Image To Video、Text To Speechは、選んだモデルを提供するプロバイダーに振り分けられます。一つのフィールドでSeedreamをFLUXやImagenに替えても、配線はそのままです。" },
        { title: "バッチ処理と制御フロー", body: "For Eachはリストの各項目に対して後続のステップを実行し、Collectが結果を集めます。If、Switch、Fallbackで分岐でき、Subgraphはノードの集まりを一つに折りたためます。" },
        { title: "キャンバスの外でも実行できる", body: "組んだグラフがそのまま呼び出すグラフになります。nodetool runで実行する、実行用エンドポイントにPOSTしてJSONを受け取る、MCPサーバー経由でCursorやClaude Codeに渡す、のいずれも可能です。" },
      ],
      note: "Kie.aiの公開価格。データはgenspend.ioによります。",
    },
    {
      kind: "steps",
      id: "walkthrough",
      title: "動画のワークフローを、ノードごとに見る。",
      intro: "七つのノードが、五つのショットプロンプトを一本の編集済み動画に変えます。六つ目のプロンプトを加えれば、同じグラフが六つのショットを作ります。映画トレーラージェネレーターのテンプレートも、同じ構造です。",
      steps: [
        { title: "String List Input", meta: "nodetool.input.StringListInput", body: "五つのショットプロンプトを保持します。" },
        { title: "For Each", meta: "nodetool.control.ForEach", body: "プロンプトをインデックス付きで一つずつ送り出します。" },
        { title: "Text To Image", meta: "nodetool.image.TextToImage", body: "選んだ画像モデルで、各プロンプトを静止画にします。" },
        { title: "Image To Video", meta: "nodetool.video.ImageToVideo", body: "選んだ動画モデルで、各静止画を動かします。" },
        { title: "Collect", meta: "nodetool.control.Collect", body: "五つのクリップがすべて終わるまで待ち、一つのリストとして渡します。" },
        { title: "Concatenate Video", meta: "nodetool.video.Concat", body: "リストを一本の動画につなぎます。" },
        { title: "Output", meta: "nodetool.output.Output", body: "編集済みのカットを、キャンバス、CLI、API呼び出し元に返します。" },
      ],
    },
    {
      kind: "cards",
      id: "nodes",
      title: "数百のノードを、一つのキャンバスで。",
      intro: "モデル、メディア、データ、ファイルをカバーする既製のノードに加えて、Replicate、FAL、Kie.ai上の数千のモデル向けに生成したノードがあります。一例を挙げます。",
      cards: [
        { title: "画像", body: "Text To Image、Image To Image、Upscale Image、Remove Background、Segment Image、Apply Mask、Compare Images、Image To 3D" },
        { title: "動画", body: "Text To Video、Image To Video、Concatenate Video、Extract Video Frame、Extract Audio、Trim、Overlay" },
        { title: "音声", body: "Text To Speech、Speech to Text、Text To Music、Overlay Audio、Concatenate Audio、Transcribe" },
        { title: "テキストとエージェント", body: "Agent、Summarizer、Extractor、Classifier、Structured Output Generator、Enhance Prompt、Web Search" },
        { title: "ロジック、データ、コード", body: "For Each、Collect、If、Switch、Fallback、Subgraph、Code、Hybrid Search、Webhook Trigger" },
        {
          title: "エージェントに配線を任せる",
          body: "ワークフローを一文で説明します。内蔵エージェントがノードを選び、同じキャンバス上でつないで実行します。置かれたノードは、どれも編集できます。",
          link: { label: "エージェントの仕組み", href: "/agents" },
        },
      ],
    },
  ],
  faq: {
    heading: "よくある質問",
    items: [
      {
        question: "ノードベースのワークフローとは何ですか？",
        answer:
          "ノードベースのワークフローは、グラフとして描いたプロセスです。各ノードは画像の生成やクリップの結合など一つの仕事をし、エッジが各ノードの出力を次のノードの入力に運びます。グラフは保存されるので、同じプロセスを新しい入力でもう一度実行できます。",
      },
      {
        question: "ノードベースのワークフローは、自動化ステップのリストと何が違いますか？",
        answer:
          "リストは上から下へ実行されます。グラフは一つの出力を複数の分岐に分けたり、リストの項目ごとに一度ずつステップを実行したり、結果をまとめ直したりでき、そのすべてを一つのキャンバスで見られます。NodeToolは、各エッジが型の合うもの同士をつないでいるかも確認します。",
      },
      {
        question: "NodeToolでノードベースのワークフローを作るのに、コードは必要ですか？",
        answer:
          "いいえ。メニューからノードを追加してエッジをドラッグでつなぐか、内蔵エージェントにグラフを組んでもらいます。コードを使いたいときは、CodeノードがサンドボックスのJavaScriptを実行し、ワークフローをTypeScriptファイルとして書くこともできます。",
      },
      {
        question: "ノードはどのAIモデルを使えますか？",
        answer: `ホスト型のモデルは、${HOSTED_PROVIDERS}などのプロバイダーから、自分のキーを使って公開価格で利用できます。ローカルモデルは、${LOCAL_RUNTIMES}などでキーなしで動かせます。`,
      },
    ],
  },
  readMore: {
    heading: "関連ページ",
    links: [
      { label: "ノードベースAI：ノードにできること", href: "/node-based-ai" },
      { label: "ワークフローテンプレート", href: "/templates" },
      { label: "対応しているすべてのモデル", href: "/models" },
      { label: "コーディングエージェント向けのMCPサーバー", href: "/mcp" },
      { label: "ComfyUIとの比較", href: "/alternatives/comfyui" },
      { label: "主要コンセプトのガイド", href: "https://docs.nodetool.ai/key-concepts" },
      { label: "最初のワークフロー", href: "https://docs.nodetool.ai/first-workflow" },
      { label: "ワークフローエディターのガイド", href: "https://docs.nodetool.ai/workflow-editor" },
      { label: "ノードリファレンス", href: "https://docs.nodetool.ai/nodes/" },
    ],
  },
  closing: {
    title: "最初のワークフローをつなぎましょう。",
    body: "NodeTool Studioは無料のオープンソースです。テンプレートか空のキャンバスから始めて、自分のキーかローカルモデルを使えます。",
  },
};
