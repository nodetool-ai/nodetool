import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /download (app/download/page.tsx, components/DownloadPanel.tsx). */
export const download: LocalizedPageContent = {
  route: "/download",
  name: "ダウンロード",
  title: "NodeTool Studioをダウンロード | macOS、Windows、Linux向けの無料オープンソース",
  description:
    "NodeTool Studioデスクトップアプリをダウンロードできます。無料のオープンソース（AGPL-3.0）で、macOS、Windows、Linuxに対応しています。プロジェクト、キー、ファイルはあなたのコンピューターに残ります。",
  hero: {
    kicker: "ダウンロード",
    h1: "NodeTool Studioをダウンロード。",
    lead: "デスクトップ版のスタジオです。無料のオープンソースで、ライセンスはAGPL-3.0。プロジェクト、キー、ファイルはあなたのコンピューターに残ります。",
    primary: { label: "インストーラーを選ぶ", href: "#installers" },
  },
  sections: [
    {
      kind: "installers",
      id: "installers",
      title: "お使いのコンピューターに合うビルドを選んでください。",
      intro: "インストールしたくない場合は、NodeTool Cloudが同じワークスペースをブラウザのタブで動かします。アルファ版なので、本格的な作業にはStudioを使ってください。",
    },
    {
      kind: "cards",
      id: "needs",
      title: "必要なもの。",
      cards: [
        {
          title: "APIキー（なくても始められます）",
          body: "アプリを開き、ワークフローを読み込んで、何かをつなぐ前に、その中のすべてのノードを読めます。ホスト型のモデルを呼び出すワークフローの実行には、そのプロバイダーのキーが必要で、料金はプロバイダーに直接支払います。",
        },
        {
          title: "空き容量はアプリの分だけ",
          body: "インストーラーのサイズは、上の各ボタンに表示されています。オープンウェイトモデルは任意の追加です。自分のマシンで推論を動かしたい場合だけダウンロードしてください。最初のセットで約20GBを見込みます。何も自動ではダウンロードされません。",
        },
        {
          title: "グラフィックスカードは不要",
          body: "GPUが関係するのはローカルモデルだけです。ホスト型のプロバイダーを使うなら、普通のノートパソコンで足ります。レンダリングは、選んだプロバイダーで行われます。",
        },
      ],
    },
    {
      kind: "table",
      id: "first-launch",
      title: "初めて開くとき。",
      head: ["OS", "手順"],
      rows: [
        ["macOS", ".dmgを開き、NodeToolを「アプリケーション」にドラッグします。「アプリケーション」からNodeToolを開き、初回起動のメッセージを確認します。"],
        ["Windows", ".exeのインストーラーを実行し、インストール先を選びます。新しいビルドではSmartScreenの警告が出ることがあります。「詳細情報」を選んでから「実行」を選んでください。"],
        ["Linux", "AppImageに実行権限を付けます：chmod +x Nodetool-*.AppImage。そのまま実行するか、同じリリースのFlatpakをインストールします。"],
      ],
    },
    {
      kind: "text",
      id: "next",
      title: "インストールしたら、次は？",
      body: [
        "各レシピは、一つのファイルとして読み込めるワークフローの連なりで、実行した結果がページに載っています。一つ読み込んで読み、実行したくなったらキーを追加してください。",
      ],
      links: [
        { label: "レシピを見る", href: "/recipes" },
        { label: "インストールガイド", href: "https://docs.nodetool.ai/installation" },
        { label: "はじめに", href: "https://docs.nodetool.ai/getting-started" },
        { label: "トラブルシューティング", href: "https://docs.nodetool.ai/troubleshooting" },
      ],
    },
  ],
  closing: {
    title: "無料のオープンソース。入れてすぐ使えます。",
    body: "StudioはNodeToolの完成版です。Cloudはインストール不要のプレビュー版で、アルファ段階です。",
    primary: { label: "インストーラーを選ぶ", href: "#installers" },
    secondary: { label: "ブラウザで試す（アルファ版）", href: "https://app.nodetool.ai" },
  },
};
