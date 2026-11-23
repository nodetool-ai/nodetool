import type { LocalizedPageContent } from "@/i18n/content";

/**
 * Translates /alternatives/comfyui (competitorEntries.ts, the comparison
 * template). The other-tools list is translated from `otherTools`, including
 * its check date.
 */
export const comfyui: LocalizedPageContent = {
  route: "/alternatives/comfyui",
  name: "ComfyUIとの比較",
  title: "ComfyUIの代替 | ComfyUIのグラフはそのままに、周りのエディターを加える · NodeTool",
  description:
    "NodeToolは、Python環境と壊れやすいカスタムノードを、クラウドモデルとローカルモデルに対応した一つのオープンソースのデスクトップアプリに置き換えます。内蔵のエージェント、ストーリーボード、タイムライン付き。既存のComfyUIグラフはAPI形式で読み込み、一つのノードとして実行できます。",
  hero: {
    kicker: "ComfyUIの代替",
    h1: "ComfyUIのグラフはそのままに。周りのエディターを加える。",
    lead: "NodeToolは、Python環境と壊れやすいカスタムノードを、一つのオープンソースのデスクトップアプリに置き換えます。クラウドモデルとローカルモデルに対応し、内蔵のエージェント、ストーリーボード、タイムラインがあります。既存のComfyUIグラフがありますか？ API形式で読み込んで、一つのノードとして実行できます。",
    note: "デスクトップインストーラー一つ · 内蔵エージェント · ComfyUI APIのグラフを実行",
    secondary: { label: "ComfyUIと見比べる", href: "#compare" },
    media: {
      kind: "reel",
      base: "/hero-nodes",
      alt: "ノードを手でつなぐか、エージェントにグラフを組ませます。型の合わないエッジは実行前に止められ、どのモデルもその場で差し替えられます。",
    },
  },
  sections: [
    {
      kind: "steps",
      id: "project",
      title: "グラフから、完成したプロジェクトまで。",
      intro: "ワークフローキャンバスは、いくつかあるエディターの一つです。ストーリーボードとタイムラインが、同じプロジェクトを扱います。",
      steps: [
        { title: "構築：エージェントとグラフ", body: "映画を説明します。エージェントがワークフローを書き、すべてのステップがノードエディターで見えます。" },
        { title: "生成：ショットと素材", body: "ストーリーボードで静止画を使って見た目を決めます。承認したショットだけが動画になります。" },
        { title: "仕上げ：編集できるカット", body: "タイムラインでクリップを並べ、トリムし、重ねます。または、エージェントに冒頭を詰めてもらいます。" },
      ],
    },
    {
      kind: "table",
      id: "compare",
      title: "NodeToolとComfyUI",
      intro: "ComfyUIは、画像・動画生成グラフのためのノードエディターで、サンプラーやモデルの設定を細かく制御できます。NodeToolは制作用のワークスペースで、生成グラフはそのエディターの一つであり、隣にストーリーボード、レイヤー付きスケッチ、脚本、動画タイムラインがあります。ComfyUIサーバー、NodeTool GPUワーカー、Comfy Cloudを、そのグラフの中の一つのノードとして呼び出せます。",
      head: ["機能", "ComfyUI", "NodeTool"],
      rows: [
        ["セットアップ", "Python環境とカスタムノードマネージャー", "デスクトップインストーラー一つ、またはDocker"],
        ["内蔵エージェント", "コミュニティのノード", "グラフを構築、検証、修復"],
        ["メディアの種類", "対応するワークフローで画像、動画、音声", "画像、動画、音声、テキスト"],
        ["モデル", "ローカルモデルと、パートナーの画像・動画モデル", "メディアの種類を横断したローカルモデルとホスト型モデル"],
        ["編集ツール（マスク、インペイント、リライト、レイヤー）", "ワークフローとノードで利用可能", "統合されたエディターとノード"],
        ["ローカルモデル", "ローカルの拡散モデル、LoRA、ControlNetへの幅広い対応", "Ollama、MLX、llama.cpp、Flux、SD.cpp、Wan、加えてホスト型API"],
        ["デスクトップとブラウザ", "ローカルのWebインターフェースとComfy Cloud", "StudioとCloud（アルファ版）"],
        ["オープンソース", "はい", "はい"],
        ["カスタムノードの安定性", "サードパーティ製で、バージョンが衝突することがある", "内蔵で、メンテナンスされた一つのコードベース"],
        ["マシン間でのワークフローの持ち運び", "カスタムノードのインストールが必要な場合がある", "同じモデルとプロバイダーへのアクセスが必要"],
        ["ComfyUIワークフローの実行", "はい", "ノードとして、ComfyUIサーバー、NodeTool GPUワーカー、Comfy Cloud上で"],
      ],
    },
    {
      kind: "text",
      id: "when-comfyui",
      title: "ComfyUIが向いているとき。",
      body: [
        "グラフそのものが仕事で、サンプラー、スケジューラー、カスタムノードを手で調整するなら、ComfyUIを選んでください。拡散モデルの画像に加えて、テキストから動画、画像から動画も動かせます。カスタムノードを使う共有グラフは、次のマシンでも同じ拡張機能とモデルが必要で、それらを呼び出すNodeToolのワークフローも同様です。",
      ],
    },
    {
      kind: "table",
      id: "others",
      title: "そのほかのComfyUIの代替",
      intro: "自分のコンピューターで動くオープンソースのソフトウェアなら、ComfyUIにいちばん近い代替は、NodeTool、InvokeAI、SwarmUI、Stable Diffusion WebUI Forgeです。ブラウザのホスト型キャンバスなら、Figma Weave、Flora、Kreaです。下の各行に、そのツールの動作環境とライセンスを載せています。",
      head: ["ツール", "概要", "動作環境とライセンス"],
      rows: [
        ["InvokeAI", "統合キャンバスとノードベースのワークフローエディターを備えた画像生成アプリ。", "Windows、macOS、Linux · オープンソース（Apache-2.0）"],
        ["SwarmUI", "画像・動画モデル向けのフォーム中心のインターフェース。Comfy Workflowタブで生のグラフを開けます。", "Windows、Linux、Apple SiliconのmacOS · オープンソース（MIT）"],
        ["Stable Diffusion WebUI Forge", "AUTOMATIC1111のStable Diffusion WebUIをベースにしたWebインターフェース。設定はグラフではなくフォームです。", "ローカルで動作 · オープンソース（AGPL-3.0）"],
        ["Draw Things", "Appleのデバイスで画像モデルをオフライン実行するアプリ。", "Mac、iPhone、iPad · 無料アプリ、アプリ内課金あり"],
      ],
      note: "確認日：2026年11月12日",
    },
  ],
  faq: {
    heading: "よくある質問",
    items: [
      {
        question: "ComfyUIのワークフローが、共有や更新の後に動かなくなるのはなぜですか？",
        answer:
          "共有されたComfyUIのグラフが、別のマシンにはないカスタムノードやモデルを参照していることがあります。ComfyUI Managerで、足りないノードのインストールを助けられます。共有する前に、拡張機能とモデルの要件を確認してください。NodeToolのワークフローも、同じモデルとプロバイダーへのアクセスが必要です。ただし、中心となる編集機能はアプリに同梱されています。",
      },
      {
        question: "NodeToolは、既存のComfyUIワークフローを実行できますか？",
        answer:
          "はい。ワークフローをAPI（prompt）形式で書き出している場合です。Run ComfyUI Workflowノードが、自分で動かしているComfyUIサーバー、ComfyUIの前段に置いたNodeTool GPUワーカー、またはCOMFY_API_KEYを使ったComfy Cloudに、それを送ります。サーバーには、そのワークフローのカスタムノードとモデルが必要です。",
      },
      {
        question: "MacやLinuxで使えるComfyUIの代替はありますか？",
        answer:
          "はい。NodeTool Studioには、Apple SiliconとIntel Mac向けの.dmg、Windowsインストーラー、Linux向けのAppImageがあります。macOS 14以降のApple Siliconでは、ローカルモデルをAppleのMLXフレームワークで動かせます。InvokeAIもmacOSとLinuxで動き、SwarmUIはLinuxとApple SiliconのMacで動きます。Draw ThingsはMac、iPhone、iPad向けの無料アプリで、画像モデルをオフラインで動かします。",
      },
      {
        question: "ComfyUIのいちばんよいオンライン代替は何ですか？",
        answer:
          "インストール不要のホスト型キャンバスなら、Figma Weave、Flora、Kreaがブラウザで動き、それぞれ独自のモデル一覧とクレジットがあります。Comfy Cloudは、ComfyUI自身のホスト版です。NodeTool Cloudもブラウザで動きますが、アルファ版なので、報酬を得る仕事にはデスクトップのNodeTool Studioを使ってください。",
      },
      {
        question: "ComfyUIより簡単な代替はありますか？",
        answer:
          "どこが難しいかによります。グラフが壁なら、Stable Diffusion WebUI Forgeは設定をフォームにまとめ、SwarmUIはフォームを先に見せて、グラフは別のタブに置きます。セットアップが壁なら、KreaやFloraのようなホスト型キャンバスはインストール不要です。NodeToolでは、望む結果を説明すればエージェントがワークフローを構築して検証します。テンプレートから始めることもでき、ホスト型モデルならグラフィックスカードもモデルのダウンロードも不要です。",
      },
      {
        question: "無料のオープンソースのComfyUI代替はありますか？",
        answer:
          "はい。NodeToolはAGPL-3.0、InvokeAIはApache-2.0、SwarmUIはMIT、Stable Diffusion WebUI ForgeはAGPL-3.0の、無料のオープンソースです。4つとも、自分のコンピューターでローカルモデルを動かせます。NodeToolは、自分のプロバイダーキーでホスト型モデルも呼び出せ、料金はプロバイダーが公開価格で請求します。",
      },
    ],
  },
  readMore: {
    heading: "関連ページ",
    links: [
      { label: "ノードワークフロー", href: "/node-based-workflows" },
      { label: "すべての代替ツール", href: "/alternatives" },
      { label: "対応モデル", href: "/models" },
    ],
  },
  closing: {
    title: "セットアップは省いて、コントロールは残す。",
    body: "macOS、Windows、Linux向けのStudioをダウンロードしてください。エージェントで新しいグラフを組むか、既存のComfyUI APIワークフローを一つのノードとして読み込みます。",
  },
};
