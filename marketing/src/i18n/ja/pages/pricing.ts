import type { LocalizedPageContent } from "@/i18n/content";
import { LOCAL_RUNTIMES } from "../shared";

/**
 * Translates /pricing (app/pricing/page.tsx, faqEntries.ts). The credit-plan
 * calculator (ByokCalculator) is left out. The subscription section
 * (SubscriptionSection) is a table here.
 */
export const pricing: LocalizedPageContent = {
  route: "/pricing",
  name: "料金",
  title: "料金 | Studioは無料、Cloudアルファも無料、プロバイダーには直接支払い · NodeTool",
  description:
    "NodeTool Studioは無料のオープンソースです。現在のCloudアルファは無料で、将来のCloudの料金は未発表です。どちらのエディションでも、プロバイダーの料金は別にかかります。",
  hero: {
    kicker: "料金",
    h1: "ダウンロードは無料。プロバイダーの価格に、上乗せなし。",
    lead: "NodeTool Studioは無料のオープンソースです。すでに払っているChatGPT、Claude、Geminiのプランで動かす、自分のプロバイダーキーを追加して各プロバイダーに公開価格を支払う、自分のマシンでローカルモデルを動かして実行ごとの費用をゼロにする、のどれでも使えます。現在のCloudアルファは無料で、将来のCloudの料金は未発表です。",
  },
  sections: [
    {
      kind: "cards",
      id: "editions",
      title: "二つのエディション。",
      cards: [
        {
          title: "NodeTool Studio · ずっと無料",
          meta: "デスクトップアプリ · あなたのマシンで動作",
          body: `macOS、Windows、Linuxで動きます。ローカルモデルは${LOCAL_RUNTIMES}で動かせます。対応するクラウドプロバイダーの、自分のアカウントを使います。ワークフローとファイルはあなたのマシンに残ります。AGPL-3.0。`,
          link: { label: "Studioをダウンロード", href: "/download" },
        },
        {
          title: "NodeTool Cloud · アルファの間は無料",
          meta: "ホスト型 · インストール不要",
          body: "ブラウザで動き、インストールは不要です。対応するクラウドプロバイダーの、自分のアカウントを使います。プロバイダーの価格で、プロバイダーに直接支払います。自分でホストできるものと同じAGPL-3.0のコードです。将来のCloudの料金は未発表です。ご利用の前に、Cloudのページで現在のアルファの条件を確認してください。",
          link: { label: "Cloudを試す（アルファ版）", href: "https://app.nodetool.ai" },
        },
      ],
    },
    {
      kind: "table",
      id: "subscription",
      title: "すでに払っている20ドルのAIプランで、エージェントを動かす。",
      intro: "ChatGPTまたはClaudeでサインインすると、エージェントは従量課金のAPIではなく、あなたのサブスクリプションで動きます。ChatGPTとGeminiのプランは画像も生成し、Geminiは動画も生成します。これらの実行は、プラン自体の上限に対してカウントされます。プランが対応していないモデルには、fal.ai、Kie.ai、Replicate、OpenAIの自分のキーを追加して、そのプロバイダーに公開価格を支払います。NodeToolは何も上乗せしません。",
      head: ["プラン", "チャットとエージェント", "画像", "動画"],
      rows: [
        ["ChatGPT", "対応", "対応", "非対応"],
        ["Claude", "対応", "非対応", "非対応"],
        ["Gemini", "対応", "対応", "対応"],
      ],
      note: "サブスクリプションは、デスクトップアプリのStudioで動きます。Geminiは、サインインしているブラウザにNodeTool Chrome拡張機能も必要です。",
    },
    {
      kind: "table",
      id: "compare",
      title: "StudioとCloudの違いは？",
      intro: "Studioは無料のデスクトップアプリで、ローカルモデルも含めてあなたのマシンで動きます。Cloudは同じオープンソースのワークスペースをブラウザのタブで動かすもので、アルファの間は無料です。どちらも自分のキーでプロバイダーを呼び出します。報酬を得る仕事にはStudioを使ってください。こちらが完成版のエディションです。",
      head: ["機能", "Studio", "Cloud（アルファ版）"],
      rows: [
        ["現在の価格", "無料", "無料（アルファ）"],
        ["将来の価格", "無料", "未発表"],
        ["動作場所", "あなたのマシン（macOS、Windows、Linux）", "ブラウザ。こちらがホスト"],
        ["自分のAPIキーを使う", "対応", "対応"],
        ["プロバイダーに直接支払う（上乗せなし）", "はい", "はい"],
        ["ローカルモデル（Ollama、MLX、llama.cpp）", "対応", "非対応"],
        ["グラフィックスカードの要否", "ローカルモデルの場合のみ", "不要"],
        ["セットアップ", "デスクトップアプリをインストール", "なし。サインインするだけ"],
        ["オープンソース（AGPL-3.0）", "はい", "はい"],
        ["いつでもセルフホスト", "可能", "可能"],
      ],
    },
    {
      kind: "text",
      id: "byok",
      title: "自分のキーを使うとは、どういうことですか？",
      body: [
        "使うプロバイダーの、自分のAPIキーを追加します。たとえばFAL、KIE、OpenAI、Anthropic、Gemini、Replicateです。すべてのリクエストはそれらのプロバイダーに直接送られ、公開されている価格をプロバイダーに支払います。NodeToolは独自のクレジットを発行せず、プロバイダー価格への上乗せもしません。Cloudのアクセスと料金はアルファの間に変わることがあるので、特定のプランを前提にする前に、Cloudのページを確認してください。",
      ],
    },
  ],
  faq: {
    heading: "よくある質問",
    items: [
      {
        question: "「自分のキーを使う」とは、私にとってどういうことですか？",
        answer:
          "自分のキーを使う（BYOK）とは、自分のプロバイダーAPIキーを接続することです。リクエストはそれらのプロバイダーに送られ、公開されている料金をプロバイダーに直接支払います。NodeToolは上乗せもクレジット制度もありません。",
      },
      {
        question: "ChatGPT、Claude、Geminiのサブスクリプションを使えますか？",
        answer:
          "はい、Studioで使えます。ChatGPTまたはClaudeでサインインすると、エージェントはAPIキーではなくそのサブスクリプションで動きます。NodeTool Chrome拡張機能を使うと、サインイン中のChatGPTまたはGeminiのタブもNodeToolが使います。ChatGPTは画像を生成し、Geminiはチャット、画像、動画を実行します。これらの実行はプランの上限に対してカウントされるため、呼び出しごとの従量課金は発生しません。すべての実行は、ChatGPTまたはGeminiの履歴に残ります。",
      },
      {
        question: "NodeToolの料金はいくらですか？",
        answer:
          "Studioは無料のオープンソースです。Cloudはアルファの間は無料で、将来のCloudの料金は未発表です。プロバイダーのAPI料金は別にかかり、サブスクリプションでの利用はプランの上限に対してカウントされます。ローカルモデルは、呼び出しごとのプロバイダー料金なしで、あなたのハードウェアと電力を使います。",
      },
      {
        question: "NodeToolはモデルの価格に上乗せしますか？",
        answer: "いいえ。自分のAPIキーを接続した場合、プロバイダーの公開価格をプロバイダーに直接支払います。NodeToolは何も上乗せしません。",
      },
      {
        question: "StudioとCloudはどちらを使えばよいですか？",
        answer:
          "継続的な作業にはStudioを選んでください。プロジェクトをコンピューターに保存し、オンラインのプロバイダーとローカルモデルの両方に対応して、macOS、Windows、Linuxで動作します。インストールせずにブラウザで試したい場合はCloudを選びます。Cloudはアルファ版で、エディション間のプロジェクトの移行はまだ完全ではありません。必要なファイルと機能が正しく移るかを確認してください。",
      },
      {
        question: "モデルをローカルで動かせますか？",
        answer: `はい。Studioは、${LOCAL_RUNTIMES}によるローカルモデルに対応しています。使えるモデルと速度は、お使いのハードウェアで決まります。`,
      },
    ],
  },
  closing: {
    title: "無料で、あなたのマシンから始めましょう。",
    body: "Studioをダウンロードして、数分で最初のワークフローを作れます。",
  },
};
