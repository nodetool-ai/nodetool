/**
 * Japanese strings of the shared frame: header, footer, buttons and the
 * installer picker. Nav labels are keyed by the English href, so the header
 * keeps one link list and only swaps the words.
 */
import type { LocaleChrome } from "@/i18n/content";
import type { DownloadPanelCopy } from "@/components/DownloadPanel";

export const JA_CHROME: LocaleChrome = {
  download: "Studioを無料でダウンロード",
  tryBrowser: "ブラウザで試す（アルファ版）",
  englishVersion: "英語版を読む",
  englishSuffix: "（英語）",
  updated: "更新日",
};

/** Header and footer group titles, keyed by the English title. */
export const JA_NAV_GROUPS: Record<string, string> = {
  Product: "製品",
  Solutions: "ソリューション",
  Resources: "リソース",
  Compare: "比較",
  Legal: "法務",
};

/** Header and footer link labels, keyed by href. */
export const JA_NAV_LABELS: Record<string, string> = {
  "/studio": "Studio デスクトップ版",
  "/cloud": "Cloud（アルファ版）",
  "/agents": "エージェント",
  "/node-based-workflows": "ノードワークフロー",
  "/node-based-ai": "ノードベースAI",
  "/ai-video-editor": "AI動画エディター",
  "/ai-image-editor": "AI画像エディター",
  "/storyboards": "絵コンテ",
  "/mcp": "MCPサーバー",
  "/models": "対応モデル",
  "/download": "ダウンロード",
  "/developers": "開発者向け",
  "/marketing": "広告・マーケティング",
  "/gamedev": "ゲーム開発",
  "/gamedev/ai-game-engines": "AIゲームエンジンの比較",
  "/solutions/local-first": "ローカルファースト",
  "/solutions/researchers": "研究者向け",
  "/solutions": "すべてのソリューション",
  "/templates": "テンプレート",
  "/recipes": "レシピ",
  "/presets": "プリセット",
  "/ad-library": "動画広告テンプレート",
  "/alternatives": "代替ツールの比較",
  "/alternatives/comfyui": "ComfyUIとの比較",
  "/faq": "よくある質問",
  "/pricing": "料金",
  "/blog": "ブログ",
  "/tasks": "タスク",
  "/providers": "プロバイダー",
  "/showcase": "作品集",
  "/ideas": "ワークフローのアイデア",
  "/imprint": "運営者情報",
  "/privacy": "プライバシーポリシー",
  "/terms": "利用規約",
  "https://docs.nodetool.ai": "ドキュメント",
};

/** AnnouncementBar. The English bar links /cloud, which has no translation. */
export const JA_ANNOUNCEMENT = {
  text: "NodeTool Cloudはアルファ版です。ブラウザで映像を演出し、ワークフローを実行できます。自分のキーを使います。",
  short: "NodeTool Cloudはアルファ版です。",
  href: "https://app.nodetool.ai",
  cta: "試す",
  dismiss: "お知らせを閉じる",
};

/** HeroDemoPlayer controls. */
export const JA_PLAYER = {
  soundOn: "音声をオンにする",
  soundOff: "音声をオフにする",
  pause: "デモを一時停止",
  play: "デモを再生",
  fullscreenLabel: "デモを全画面で再生",
  fullscreen: "全画面",
};

export const JA_HEADER = {
  skip: "本文へスキップ",
  star: "GitHubでスターを付ける",
  starLabel: "GitHubでNodeToolにスターを付ける",
  openMenu: "メニューを開く",
  closeMenu: "メニューを閉じる",
  menu: "サイトメニュー",
  home: "NodeToolのホーム",
};

export const JA_FOOTER = {
  blurb: "第一線のアーティスト、デザイナー、動画編集者と一緒に作っている、無料のオープンソースソフトウェアです。作りたいものを伝えると、エージェントが形にし、プロジェクトファイルとして保存されます。",
  builtInOpen: "オープンに開発しています。",
  languages: "言語",
};

export const JA_DOWNLOAD_PANEL: DownloadPanelCopy = {
  downloadFor: "{platform}版をダウンロード",
  notes: {
    "mac-arm": "M1以降のチップ、macOS 12以降",
    "mac-intel": "Intelチップ搭載のMac、macOS 12以降",
    windows: "64ビット版 Windows 10または11",
    linux: "64ビット版AppImage。各リリースにFlatpakも付属",
  },
  onMobile: "NodeTool Studioをインストールするには、パソコンでこのページを開いてください。下のmacOS、Windows、Linux用のビルドから選べます。",
  pickBuild: "お使いのパソコンに合うビルドを選んでください。",
  releasesBefore: "すべてのビルド、リリースノート、チェックサムは",
  releasesLink: " GitHub Releasesページ",
  releasesAfter: "にあります。",
};
