import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /cloud (app/cloud/page.tsx and layout.tsx). The update-list form is left out. */
export const cloud: LocalizedPageContent = {
  route: "/cloud",
  name: "Cloud（アルファ版）",
  title: "NodeTool Cloud（アルファ版）| ブラウザで使うNodeToolのワークスペース",
  description:
    "エージェント、編集できるプロジェクト画面、ホスト型ストレージ、リモートのプロバイダーを備えたNodeToolのワークスペースを、ブラウザで試せます。Cloudはアルファ版のプレビューです。仕事にはStudioをお使いください。",
  hero: {
    kicker: "NodeTool Cloud · アルファ版プレビュー",
    h1: "NodeToolのワークスペースを、ブラウザで。",
    lead: "インストールなしでNodeToolを試せます。Cloudは、同じAIエージェントとエディターをWebブラウザで動かし、プロジェクトをオンラインに保存します。メディアの生成には、自分のAIプロバイダーのアカウントをつなぎます。Cloudはアルファ版、つまり初期のテスト版です。NodeToolを試すために使い、大切な仕事には使わないでください。",
    note: "アルファ版プレビュー · インターネット接続が必要 · オンラインのAIプロバイダーのみ。報酬のある仕事にはStudioをお使いください。",
    primary: { label: "Cloudを試す（アルファ版）", href: "https://app.nodetool.ai" },
    secondary: { label: "Studioをダウンロード", href: "/studio" },
    media: {
      kind: "image",
      src: "/surface-storyboard-poster.webp",
      width: 1920,
      height: 1080,
      alt: "生成したショットとエージェントのツール記録が並ぶ、NodeToolの絵コンテエディター",
      caption: "絵コンテエディター。ここで生成したショットは、すべて編集できます。",
    },
  },
  sections: [
    {
      kind: "text",
      id: "editable-project",
      kicker: "編集できる設計",
      title: "編集できるものを確かめる。",
      body: [
        "エージェントが変更するのは、あなた自身も開ける同じ絵コンテ、ワークフロー、タイムラインです。下の録画は、この方法で作ったプロジェクトです。アルファ版の間は、一部のモデルや操作がCloudでまだ使えないことがあります。",
      ],
      media: {
        kind: "reel",
        base: "/hero-flow",
        alt: "NodeTool：一文がビートシート、キャラクターや素材、静止画とクリップの絵コンテ、完成したカットになる",
        caption: "NodeToolのプロジェクトのデモ：エージェントが物語を整理し、キャラクターを設計し、絵コンテを描き、クリップをつないで、あとから修正できるカットにします。",
      },
    },
    {
      kind: "cards",
      id: "hosted-boundaries",
      kicker: "ホスト型の境界",
      title: "何がどこで動くかを知る。",
      intro: "Cloudはインストールの手間を省きます。自分のコンピューター上のAIモデルは動かせず、生成にかかる料金は、AIプロバイダーから別に請求されます。",
      cards: [
        { title: "ワークスペース", body: "ホスト型のアルファ版はブラウザで開き、エージェント、キャンバス、エディターをまとめて使えます。デスクトップアプリのインストールは不要です。" },
        { title: "プロジェクトの保存", body: "Cloudはホスト型のストレージを使います。機密性の高い素材や規制対象の素材を扱う前に、現在のアルファ版の条件を確認してください。" },
        { title: "AIプロバイダー", body: "リモートの画像、動画、音声、言語モデルは、あなたがつないだプロバイダーのアカウントで動きます。プロバイダーの料金はNodeToolとは別です。" },
        { title: "ローカルモデル", body: "Cloudは、あなたのコンピューター上でOllama、MLX、llama.cppなどのランタイムを通して動くモデルを使えません。ローカル推論にはStudioを使ってください。" },
        { title: "接続", body: "Cloudにはインターネット接続が必要です。すべてのステップがローカルのファイルと対応するローカルモデルだけで済むなら、Studioは接続なしでもローカルの作業を続けられます。" },
      ],
    },
  ],
  faq: {
    heading: "アルファ版を試す前に",
    items: [
      {
        question: "StudioとCloudはどちらを使えばよいですか？",
        answer:
          "継続的な作業にはStudioを選んでください。プロジェクトをコンピューターに保存し、オンラインのプロバイダーとローカルモデルの両方に対応して、macOS、Windows、Linuxで動作します。インストールせずにブラウザでNodeToolを試したい場合はCloudを選びます。Cloudはアルファ版で、エディション間のプロジェクトの移行はまだ完全ではありません。必要なファイルと機能が正しく移るかを確認してください。",
      },
      {
        question: "Cloudのアルファ版には何を期待できますか？",
        answer:
          "Cloudは、ブラウザでNodeToolを試すための初期バージョンです。機能、ストレージ、利用可否は変わることがあり、プロジェクトの移行もまだ完全ではありません。クライアントの仕事にはStudioを使ってください。ある機能に頼る前に、Cloudのページと利用規約を確認してください。",
      },
      {
        question: "Cloudはプロジェクトをどこに保存しますか？",
        answer:
          "Cloudはホスト型のプロジェクトストレージを使います。保持期間とアクセスのルールは、現在のプライバシーポリシーと利用規約に従います。素材をお使いの端末に置いておく必要がある場合は、Studioを使い、該当するステップではリモートのプロバイダーを避けてください。",
      },
      {
        question: "NodeToolはローカルファーストで、プライバシーは守られますか？",
        answer:
          "NodeTool Studioは、ワークスペース、ワークフロー、ファイル、設定した認証情報をあなたのマシンに保存します。対応するオープンウェイトのモデルは、MLX、Ollama、llama.cpp、vLLM、LM Studioでローカルに動かせます。ホスト型モデルを呼び出すと、リクエストはあなたのマシンからそのプロバイダーに送られます。Cloudはホスト型のプロジェクトストレージを使うので、機密性の高い素材を扱う前に、現在のプライバシーポリシーと利用規約を確認してください。",
      },
    ],
  },
  readMore: {
    heading: "関連ページ",
    links: [
      { label: "Studio（デスクトップ版）", href: "/studio" },
      { label: "料金", href: "/pricing" },
    ],
  },
  closing: {
    title: "インストールせずに、ワークスペースを試す。",
    body: "CloudはアルファのうちにNodeToolを試すために使ってください。実際のプロジェクトにはStudioをダウンロードしてください。",
    primary: { label: "Cloudを試す（アルファ版）", href: "https://app.nodetool.ai" },
    secondary: { label: "Studioをダウンロード", href: "/studio" },
  },
};
