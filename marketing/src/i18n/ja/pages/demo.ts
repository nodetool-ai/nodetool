import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /demo (app/demo/page.tsx, components/TimelineEditorDemo.tsx, components/NodeEditorDemo.tsx). */
export const demo: LocalizedPageContent = {
  route: "/demo",
  name: "ライブデモ",
  title: "ブラウザでNodeToolを試す：タイムラインエディターとノードエディターのデモ",
  description:
    "NodeToolの実際のタイムラインエディターとノードエディターをブラウザで開けます。ダウンロードもサインインも不要です。ノードエディターはサンプル結果で動き、何も保存されません。",
  hero: {
    kicker: "ライブデモ",
    h1: "ブラウザでNodeToolを試す。",
    lead: "下の二つのエディターは、アプリに入っているものをこのページで動くようにしたものです。ダウンロードもサインインも不要です。変更した内容は保存されません。",
    note: "エディターの画面は英語です。",
    secondary: { label: "ブラウザ版を開く", href: "https://app.nodetool.ai" },
  },
  sections: [
    {
      kind: "cards",
      id: "demos",
      title: "二つのデモ",
      cards: [
        {
          title: "タイムラインエディター",
          body: "完成した作品をStudioのタイムラインで開きます。再生、スクラブ、トラックのズーム、レイヤーの選択ができます。",
          link: { label: "タイムラインのデモへ", href: "#try-the-timeline" },
        },
        {
          title: "ノードエディター",
          body: "プロンプトを編集し、画像から動画へのグラフをつなぎ直し、メニューからノードを追加して、Runを押します。",
          link: { label: "ノードエディターのデモへ", href: "#try-the-node-editor" },
        },
      ],
    },
    {
      kind: "demo",
      id: "try-the-timeline",
      editor: "timeline",
      copy: {
        title: "タイムラインエディターを試す。",
        intro:
          "Studioのエディターが、NodeToolのサンプル作品の一つを読み込んでブラウザで動きます。再生、再生ヘッドのドラッグ、トラックのズーム、レイヤーの選択ができます。ここでの変更は残りません。",
        open: "{film}をエディターで開く",
        frameTitle: "NodeToolのタイムラインエディターで開いた{film}（読み取り専用のデモ）",
        note: "エディターを開くと約3 MBを読み込みます。WebGPUに対応したブラウザで最もなめらかに再生されます。",
        filmPicker: "開くタイムライン",
      },
    },
    {
      kind: "demo",
      id: "try-the-node-editor",
      editor: "nodeEditor",
      copy: {
        title: "ノードエディターを試す。",
        intro:
          "NodeToolのエディターがブラウザで動きます。プロンプト、Text To Imageノード、Image To Videoノードが入っています。プロンプトを編集し、ノードをドラッグしてつなぎ直し、ノードメニューからEnhance PromptやText To Videoを追加して、Runを押してください。",
        open: "ノードエディターを開く",
        frameTitle: "NodeToolのノードエディター（サンプル結果のデモ）",
        note: "Runを押すと、プロンプトの単語に合わせて、以前NodeToolで作ったサンプルの静止画とクリップが返ります。ここではモデルは動かず、何も保存されません。エディターを開くと約3 MBを読み込みます。",
      },
    },
  ],
  closing: {
    title: "自分のプロジェクトを作る。",
    body: "デモではモデルを呼び出せず、編集も残りません。Studioはあなたのコンピューターで動き、ローカルモデルか自分のプロバイダーキーを使います。ブラウザ版はアルファ版です。",
    secondary: { label: "ブラウザ版を開く", href: "https://app.nodetool.ai" },
  },
};
