import type { LocalizedPageContent } from "@/i18n/content";

const INSTALL = "npx -y --package=@nodetool-ai/cli-mcp nodetool-mcp install";

/** Translates /mcp (app/mcp/page.tsx, data/mcpPage.ts). */
export const mcp: LocalizedPageContent = {
  route: "/mcp",
  name: "MCPサーバー",
  title: "クリエイティブMCPサーバー | Claude Code、Codex、Cursorにスタジオを · NodeTool",
  description:
    "NodeToolは、オープンソースのMCPサーバーとして動きます。Claude Code、Codex、OpenCode、Cursor、Claude Desktopに追加すると、エージェントが画像、動画、音声、音楽を生成し、編集できるストーリーボード、タイムライン、ワークフローに入れられます。",
  hero: {
    kicker: "クリエイティブMCPサーバー",
    h1: "コーディングエージェントに、スタジオを渡す。",
    lead: "NodeToolは、オープンソースのMCPサーバーとして動きます。Claude Code、Codex、OpenCode、Cursor、Claude Desktopに追加すると、エージェントが画像、動画、音声、音楽を生成し、それを開いて編集できる文書に入れられます。文書とは、ストーリーボード、タイムライン、脚本、スケッチ、ゲーム、ワークフローです。自分のプロバイダーキーで動き、デスクトップアプリは必須ではありません。",
    code: `$ ${INSTALL}`,
    note: "Node.js 22以降が必要です。クライアントを再起動して、NodeToolを使うよう頼んでください。",
    primary: { label: "設定方法を見る", href: "#clients" },
    secondary: { label: "Studioをダウンロード（任意）", href: "/download" },
  },
  sections: [
    {
      kind: "cards",
      id: "clients",
      title: "対応しているクライアント。",
      cards: [
        { title: "Claude Code", body: "nodetool-mcp installが、すべてのプロジェクトで使えるユーザースコープで設定します。" },
        { title: "Codex", body: "nodetool-mcp installが設定し、長い動画ジョブのためにツールのタイムアウトを900秒にします。" },
        { title: "OpenCode", body: "nodetool-mcp installが設定します。" },
        { title: "Cursor、Windsurf、その他のクライアント", body: "nodetool-mcp configを実行し、出力されるmcpServersブロックを貼り付けます。" },
        { title: "Claude Desktop", body: "nodetool-mcp configのブロックを貼り付けるか、Studioの「設定 → MCPサーバー」から同梱の拡張機能をインストールします。" },
      ],
    },
    {
      kind: "cards",
      id: "capabilities",
      title: "エージェントにできること。",
      intro: "結果はすべてNodeToolのプロジェクトに入ります。エージェントが作ったものはStudioで開いて、編集を続けられます。",
      cards: [
        { title: "メディアを生成する", body: "画像、画像編集、テキスト・画像・参照からの動画、音声、音楽、文字起こしを、指定したプロバイダーとモデルで実行します。find_modelがタスクに合う実在のモデルIDを返すので、エージェントが推測する必要はありません。" },
        { title: "動画を作る", body: "ストーリーボードを作り、静止画とクリップをレンダリングし、脚本に声を付け、タイムラインを組み立て、編集し、フレームをプレビューして、カットをレンダリングします。" },
        { title: "ゲームを作る", body: "2Dまたは3Dのゲームを作り、チェックを通した操作で編集し、アートとサウンドを生成してインストールし、ヘッドレスでプレイテストし、フレームをキャプチャして、Webプレーヤーをビルドします。" },
        { title: "画像を編集する", body: "バージョン付きのレイヤー付きスケッチを作成して編集し、どんな結果もview_imageで確認します。" },
        { title: "ワークフローを実行する", body: "ノードワークフローを作成、検証、デバッグ、実行します。バックグラウンドジョブとして開始して、ログを読むこともできます。" },
        { title: "ファイルを残す", body: "ファイルをアセットとしてアップロードし、結果をダウンロードします。ローカル接続では、download_assetがプロジェクト内のパスに直接書き込みます。" },
      ],
    },
    {
      kind: "table",
      id: "tools",
      title: "ツール、リソース、プロンプト。",
      intro: "サーバーが登録する直接のツールは少数です。残りの機能は、nodetool://capabilitiesとnodetool://sandboxの二つのリソースが説明します。各スキルはMCPプロンプトなので、Claude Codeではスラッシュコマンドとして表示されます。",
      head: ["ツール", "用途"],
      rows: [
        ["execute_code", "nodetool.<namespace>.<method>()を呼び出すサンドボックスのJavaScriptを実行します。上のすべての機能は、これ経由で使います。"],
        ["view_image", "画像を返し、エージェントがピクセルを見られるようにします。"],
        ["upload_asset, download_asset", "ファイルをアセットライブラリに出し入れします。"],
        ["find_model, list_models, list_provider_models", "ある機能に使える、実在のプロバイダーとモデルのIDを探します。"],
        ["search_nodes, get_node_info, list_nodes", "ワークフロー用のノードタイプを探します。"],
        ["browser, http_request, download_file, list_directory", "NodeToolのURLチェックを通して、ページとファイルを取得します。"],
        ["run_subtask", "NodeToolのツールを持つ子エージェントにタスクを任せます。"],
      ],
    },
    {
      kind: "table",
      id: "modes",
      title: "Studioがあってもなくても使えます。",
      head: ["接続方法", "内容"],
      rows: [
        ["stdio（デフォルト）", "nodetool-mcp serve。Studioまたはクラシックなサーバーが127.0.0.1:7777で動いていれば、リクエストはそこに送られ、開いているエディターにエージェントの変更がリアルタイムで表示されます。動いていなければ、デフォルトのデータディレクトリを使って単独で動作します。"],
        ["HTTP", "クラシックなAPIサーバーが動いている間、nodetool-mcp install --httpでクライアントをhttp://127.0.0.1:7777/mcpに向けます。"],
        ["リモートサーバー", "「設定 → MCPサーバー → エージェントをリモートで接続」でアクセストークンを作成し、クライアントをそのサーバーに向けます。"],
      ],
    },
    {
      kind: "text",
      id: "keys",
      title: "プロバイダーキーは一度保存するだけ。",
      body: [
        "生成にはプロバイダーキーが必要です。nodetool secrets storeで保存するか、同じ名前の環境変数を設定します。ノードの検索、検証、アセット、ファイルのツールにはキーは不要です。",
      ],
      code: "nodetool secrets store FAL_API_KEY\nnodetool secrets store OPENAI_API_KEY",
      bullets: [
        "ほとんどの機能は、個別のMCPツールではなくexecute_codeの中で動きます。execute_codeの呼び出しを毎回確認するかどうかは、クライアントの承認設定で決まります。サーバー自体には承認の確認はありません。",
        "サーバーのファイルツールが扱うのはNodeToolのワークスペースで、お使いのファイルシステムではありません。結果をプロジェクト内のパスに書き込むには、ローカル接続が必要です。",
        "サーバーにはNode.js 22以降が必要です。",
      ],
    },
  ],
  faq: {
    heading: "MCPサーバーについての質問",
    items: [
      {
        question: "Claude Codeに画像と動画の生成をさせるMCPサーバーはどれですか？",
        answer: `NodeToolです。${INSTALL}を実行し、Claude Codeを再起動して、画像か動画を生成するよう頼んでください。自分のキーでfal、Replicate、OpenAI、Geminiなどのプロバイダーを呼び出し、結果を再利用できるアセットとして保存します。`,
      },
      {
        question: "MCPサーバーは、クリップを生成するだけでなく、動画のタイムラインも編集できますか？",
        answer:
          "できます。NodeToolのMCPサーバー経由で、エージェントはストーリーボードとタイムラインを作成して編集し、フレームをレンダリングしてカットを確認し、最終的な動画をレンダリングします。タイムラインはNodeTool Studioで開いて、編集を続けられます。",
      },
      {
        question: "Claude Codeは、NodeToolでゲームを作れますか？",
        answer:
          "作れます。ゲームのツールはexecute_codeを通して動きます。ゲームの作成、シーンとスクリプトの編集、スプライト、タイルセット、音楽、効果音の生成、ヘッドレスでのプレイテスト、Webプレーヤーのビルドができます。エンジンのスキルは、Claude Codeにスラッシュコマンドとして表示されます。",
      },
      {
        question: "ComfyUIのMCPサーバーとは何が違いますか？",
        answer:
          "ComfyUIのMCPサーバーは、ComfyUIのワークフローを実行します。NodeToolのサーバーは、エージェントが作業するための編集できる文書も渡します。ストーリーボード、タイムライン、スケッチ、ゲームなどです。また、ホスト型のプロバイダーもローカルモデルも呼び出せます。",
      },
      {
        question: "デスクトップアプリは必要ですか？",
        answer:
          "いいえ。クラシックなAPIサーバーが動いていなければ、nodetool-mcp serveは単独で動きます。Studioを開いていれば、リクエストはそちらに送られ、エージェントの編集がエディターで進む様子を見られます。",
      },
      {
        question: "スクリプトやCIから使えますか？",
        answer:
          "使えます。MCPのほかに、nodetool CLIがターミナルからワークフローと生成を実行し、サーバーにはワークフローを実行するRESTエンドポイントがあります。開発者向けのページをご覧ください。",
      },
    ],
  },
  readMore: {
    heading: "関連ページ",
    links: [
      { label: "MCPサーバーのガイド", href: "https://docs.nodetool.ai/mcp-server" },
      { label: "エージェント：オープンソースのクリエイティブハーネス", href: "/agents" },
      { label: "ノードワークフロー", href: "/node-based-workflows" },
      { label: "開発者向けページ：CLI、REST、セルフホスト", href: "/developers" },
      { label: "Claude Codeでゲームを作る", href: "/gamedev" },
      { label: "AI動画エディター", href: "/ai-video-editor" },
      { label: "npmのパッケージ", href: "https://www.npmjs.com/package/@nodetool-ai/cli-mcp" },
    ],
  },
  closing: {
    title: "コマンド一つでつながります。",
    body: `${INSTALL}を実行し、クライアントを再起動して、NodeToolを使うよう頼んでください。エージェントの変更をエディターで見たいときは、Studioも開いておきます。`,
  },
};
