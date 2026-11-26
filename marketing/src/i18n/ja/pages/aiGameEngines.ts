import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /gamedev/ai-game-engines (app/gamedev/ai-game-engines/page.tsx, data/gameEngineComparison.ts). */
export const aiGameEngines: LocalizedPageContent = {
  route: "/gamedev/ai-game-engines",
  name: "AIゲームエンジンの比較",
  title: "AIゲームエンジンの比較：NodeTool、Unity、Godot、Roblox Studio · NodeTool",
  description:
    "AIエージェントがNodeTool、Unity、Godot、Roblox Studio、Summer Engine、Rosebudでどのようにゲームを作るか、作った後に何を編集できるか、それぞれどこへ書き出せるかを比較します。",
  hero: {
    kicker: "ゲーム開発",
    h1: "AIゲームエンジンの比較",
    lead: "いまは、いくつかのエンジンでAIエージェントが遊べるゲームを作れます。違いは三つあり、どれが合うかはそこで決まります。エージェントがどうつながるか、ゲームを自分で実行して確認できるか、エージェントが止まった後に何が手元に残るかです。このページでは、この三点で六つの選択肢を比べます。NodeToolが不利な点も含めています。",
    note: "他社製品についての情報は、各社自身のページに基づいています。確認日は{gameSourcesChecked}です。出典はページの最後にまとめています。",
    secondary: { label: "ゲーム開発", href: "/gamedev" },
  },
  sections: [
    {
      kind: "table",
      id: "table",
      title: "並べて比較",
      head: ["観点", "NodeTool", "Unity with Unity AI", "Godot with godot-mcp", "Roblox Studio", "Summer Engine", "Rosebud AI"],
      rows: [
        ["ライセンス", "オープンソース、AGPL-3.0", "プロプライエタリ", "Godotとgodot-mcpはどちらもMIT", "プロプライエタリ", "無料のプロプライエタリなデスクトップアプリ。エージェントのツールはMIT", "ホスト型サービス"],
        ["エージェントのつなぎ方", "内蔵エージェント、またはClaude Code、Codex、OpenCode、Cursor向けのMCPサーバー", "Unity MCP Server。2026年5月からオープンベータで、Claude Code、Cursor、Windsurf、Claude Desktop、VS Code Copilotなどに対応", "エディターの起動、プロジェクトの実行、シーンやノードの作成ができるコミュニティ製のMCPサーバー", "StudioにMCPサーバーを内蔵。Robloxは以前のオープンソースのリファレンスサーバーを2026年4月にアーカイブ", "内蔵のSummer Agent、またはClaude Code、Codex、Cursor向けのMCPとCLI", "文章での説明から直接生成"],
        ["エージェントが自分でゲームを確認", "記録した入力とアサーションによるヘッドレスのテストプレイ、フレームの取り込み、2Dでのルート探索", "シーン階層、コンポーネント、コンソールを読み、エディターの操作を実行", "デバッグモードでプロジェクトを実行し、出力を読む", "リファレンスサーバーは、プレイモードを開始してその中でスクリプトを実行できた", "プレイモードを実行し、エージェントのエラー確認を助ける", "ブラウザで自分でテスト"],
        ["作った後に編集するもの", "同じゲーム文書を、Game Editorで編集。シーンツリー、インスペクター、スクリプト", "Unity EditorでUnityプロジェクトを編集", "GodotエディターでGodotプロジェクトを編集", "StudioでRobloxのエクスペリエンスを編集", "Godot 4互換のシーンとスクリプト", "ブラウザで、ゲームプレイ、アセット、NPCの挙動を編集"],
        ["書き出し先", "Webプレーヤーと、Windows、macOS、Linux向けのデスクトップアプリのプロジェクト", "デスクトップ、モバイル、コンソール、Web", "デスクトップ、モバイル、Web", "Robloxプラットフォーム", "WindowsとmacOS。その後、Steam、itch.io、自分のサイトへ", "共有できるブラウザのリンク"],
        ["必要なもの", "無料。アートとサウンドの生成には、自分のプロバイダーアカウントを使う", "Unity 6、Unity Cloudに接続したプロジェクト、Unity AIのトライアルまたはサブスクリプション", "Godotのインストール。MCPサーバーにはNode.jsも必要", "Roblox Studio", "デスクトップアプリはローカルのプロジェクトなら無料。ホスト型のSummer AIは有料のクレジットが必要", "無料で試せる。有料プランには商用利用の権利が含まれる"],
      ],
    },
    {
      kind: "cards",
      id: "pick",
      title: "どれを選ぶか",
      cards: [
        { title: "NodeTool", body: "エージェントに、Webやデスクトップ向けの小さな2D/3Dゲームを作ってテストさせたい。アートとサウンドも同じ場所で生成したい。編集し続けられるオープンソースのプロジェクトを手元に残したい。ゲームが、動画、画像、絵コンテを含む大きなプロジェクトの一部である場合にも向いています。" },
        { title: "Unity", body: "モバイルやコンソール向けのビルドが必要、大きなアセットのエコシステムが欲しい、またはチームがすでにUnityで作業していて、プロプライエタリなエンジンとUnity AIのベータの条件を受け入れられる。" },
        { title: "Godot", body: "モバイルとWebに書き出せる、機能の揃ったオープンソースのエンジンが欲しく、コミュニティ製のMCPサーバー経由で操作することに抵抗がない。" },
        { title: "Roblox Studio", body: "ゲームをRoblox上で公開したい。Robloxのプレイヤー、マルチプレイ、経済圏を使う。" },
        { title: "Summer Engine", body: "AIを前提にしたエディターが欲しく、プロジェクトはGodot 4と互換のままにして、Steamやitch.ioで公開するつもりがある。" },
        { title: "Rosebud AI", body: "説明文からブラウザのプロトタイプをすばやく作り、共有できるリンクが欲しい。何もインストールしたくない。" },
      ],
    },
    {
      kind: "text",
      id: "differs",
      title: "NodeToolの違い",
      body: [],
      bullets: [
        "エンジンは、エージェントによる制作のために書かれています。エージェントは、ソースファイルを編集してコンパイルが通るよう祈るのではなく、型付きの操作で検証済みのゲーム文書を変更します。",
        "実行は決定的です。そのため、エージェントのテストプレイとあなたのプレイは同じ挙動になり、リプレイで修正を証明できます。",
        "アセット生成はエンジンのツールの一部です。スプライト、タイルセット、音楽、効果音、音声、3Dモデルを、生成、調整、結び付けまで一度に行います。",
        "同じワークスペースに、絵コンテ、動画タイムライン、スケッチ、ワークフローがあるので、ゲームのトレーラーやストア用のアートも、ゲームのすぐ隣で作れます。",
      ],
    },
    {
      kind: "text",
      id: "gaps",
      title: "NodeToolが弱い点",
      body: [],
      bullets: [
        "モバイル、コンソール、マルチプレイには対応していません。",
        "2D物理にはダイナミックボディがなく、3Dにはカスタムシェーダー、ナビゲーションメッシュ、地形がありません。",
        "エコシステムははるかに小さく、アセットストアやプラグインがなく、Unity、Godot、Robloxほどの規模のコミュニティのチュートリアルもありません。",
      ],
      links: [{ label: "NodeToolで作ったゲームを遊ぶ", href: "/gamedev" }],
    },
    {
      kind: "text",
      id: "sources",
      title: "出典",
      body: [],
      links: [
        { label: "Unity: Unity's AI tools in beta, how to get started with MCP", href: "https://unity.com/en/blog/unity-ai-mcp-how-to-get-started" },
        { label: "godot-mcp in the Archestra MCP catalog", href: "https://archestra.ai/mcp-catalog/coding-solo__godot-mcp" },
        { label: "Roblox: studio-rust-mcp-server (archived)", href: "https://github.com/Roblox/studio-rust-mcp-server" },
        { label: "Summer Engine: best AI for game development", href: "https://www.summerengine.com/best-ai-for-game-development.md" },
        { label: "Summer Engine: how to make games in Claude Code", href: "https://www.summerengine.com/mcp/how-to-make-games-in-claude-code" },
        { label: "Rosebud AI vs Base44", href: "https://lab.rosebud.ai/blog/rosebud-ai-vs-base44-whats-the-best-way-to-build-a-video-game-with-ai" },
        { label: "NodeTool: Native Game Engine coverage", href: "https://docs.nodetool.ai/game-engine/" },
      ],
    },
  ],
  faq: {
    heading: "質問",
    items: [
      {
        question: "最も良いオープンソースのAIゲームエンジンはどれですか？",
        answer: "何を公開するかによります。Godotは最も機能の揃ったオープンソースのエンジンで、コミュニティ製のMCPサーバー経由でエージェントと使えます。NodeToolはオープンソースで、最初からエージェント向けに作られており、ヘッドレスのテストプレイとアセット生成がありますが、書き出し先はWebとデスクトップだけです。",
      },
      {
        question: "MCPに対応しているゲームエンジンはどれですか？",
        answer: "このページのエンジンでは、NodeToolが自前のMCPサーバーを提供し、UnityにはオープンベータのMCPサーバーがあり、Roblox Studioには内蔵のものがあり、Godotにはコミュニティ製のMCPサーバーがあります。Summer Engineは、Claude Code、Codex、CursorのMCP設定を文書にしています。",
      },
      {
        question: "公式のAIエージェント向けツールがあるゲームエンジンはどれですか？",
        answer: "UnityとRoblox Studioは、ベンダー自身が提供しています。Unity AIは2026年5月からオープンベータのMCPサーバーを備え、Roblox StudioはMCPサーバーを内蔵しています。NodeToolとSummer Engineは、自前のエージェントと、Claude Code、Codex、Cursor向けのMCPサーバーを備えています。Godotのエージェント向けツールは、godot-mcpのようなコミュニティ製のMCPサーバーによるものです。",
      },
      {
        question: "AIエージェントは、編集し続けられるゲームを作れますか？",
        answer: "作れます。ブラウザだけで完結する生成ツールを除き、ここにあるどのエンジンでも可能です。ただし、エージェントがエンジン自身のプロジェクト形式の中で作業することが条件です。NodeToolでは、エージェントとGame Editorが同じゲーム文書を変更するので、インポートや変換は要りません。",
      },
    ],
  },
  closing: {
    title: "編集し続けられるゲームを作る。",
    body: "Studioは無料のオープンソースです。ゲームはいつでも編集できます。新しいアセットを生成したいときは、自分のモデルプロバイダーをつないでください。",
    primary: { label: "Studioをダウンロード", href: "/download" },
    secondary: { label: "NodeToolで作ったゲームを遊ぶ", href: "/gamedev" },
  },
};
