/**
 * Copy for /ja, the Japanese overview page. Every sentence translates copy
 * already published on the English site (home hero, home cards, landing FAQ
 * in faqEntries.ts), so it carries no claim the English pages do not make.
 * The language claim rests on web/src/i18n/locales.ts, which lists "ja"
 * (日本語) in the Settings → General → Appearance language selector. The
 * catalog is machine translated (web/src/i18n/README.md) and untranslated
 * screens fall back to English, which the page says.
 */
import type { QaPair } from "@/lib/jsonld";

export const JA_TITLE =
  "NodeTool | オープンソースのAI映画制作スタジオ、エージェント、ノードワークフロー";

export const JA_DESCRIPTION =
  "一文からAIで短編映画を作り、ショットごとに編集できるオープンソースのツールです。macOS、Windows、Linux向けに無料。ChatGPTやClaudeのプラン、自分のAPIキー、ローカルモデルで動きます。";

export const JA_BADGE = "オープンソースのAI映画スタジオ";

export const JA_H1 = "AI映画を、ショットごとに演出する。";

export const JA_LEAD =
  "一文から始めましょう。エージェントがストーリーを書き、ショットごとに静止画を描き、タイムライン上でクリップを編集します。クリップの料金を払う前に静止画を確認して承認でき、どのショットも個別に撮り直せます。うまくいった手順は、もう一度実行できるワークフローとして保存できます。";

export const JA_SETUP =
  "デスクトップアプリでは、ChatGPTまたはClaudeのプランでサインインすると、エージェントがそのプランで動きます。自分のプロバイダーAPIキーを追加して、上乗せなしの定価で支払うこともできます。";

export const JA_PLATFORMS =
  "macOS、Windows、Linux向けに無料のオープンソースで提供しています。ブラウザ版はアルファ版です。";

export const JA_CARDS = [
  {
    title: "映画",
    body: "脚本を書き、すべてのショットの絵コンテを作り、タイムラインでクリップを編集します。すべてが一つのプロジェクトに入っています。",
    href: "/studio",
    linkLabel: "デスクトップアプリについて（英語）",
  },
  {
    title: "エージェント",
    body: "変えたいことを普段の言葉で伝えると、エージェントがプロジェクトを編集します。いつでも自分で作業を引き継げます。",
    href: "/agents",
    linkLabel: "エージェントの仕組み（英語）",
  },
  {
    title: "ライブタイムライン",
    body: "クリップにワークフローを結び付けます。入力を一つ変えるとそのクリップが古くなったと表示されるので、そのテイクだけを再生成し、残りの編集はそのまま残ります。",
    href: "/ai-video-editor",
    linkLabel: "動画エディターについて（英語）",
  },
] as const;

export const JA_STORYBOARD_TITLE = "クリップの料金を払う前に、静止画を承認する。";
export const JA_STORYBOARD_BODY =
  "絵コンテにはショットごとに一枚の静止画があります。承認したショットだけが動画になります。";

export const JA_WORKFLOW_TITLE = "すべてのプロジェクトの下に、ノードグラフがある。";
export const JA_WORKFLOW_BODY =
  "同じグラフを次のエピソードや20種類の広告バリエーションに実行したり、手持ちのComfyUIワークフローを読み込んだり、エージェントにグラフを組ませたりできます。";

export const JA_LANGUAGE_TITLE = "アプリは日本語で使えます。";
export const JA_LANGUAGE_BODY =
  "設定 → 一般 → 外観 で表示言語を日本語に切り替えられます。翻訳は機械翻訳で、まだ英語のまま表示される画面もあります。このページ以外のサイトとドキュメントは英語です。";

export const JA_LOCAL_TITLE = "プロジェクトは自分のコンピューターに。";
export const JA_LOCAL_BODY =
  "NodeTool Studioは、ワークスペース、ワークフロー、ファイル、設定した認証情報をあなたのコンピューターに保存します。対応するオープンウェイトモデルは、MLX、Ollama、llama.cpp、vLLM、LM Studioでローカル実行できます。ホスト型のモデルを呼び出すと、リクエストはそのプロバイダーに送られます。";

export const JA_FAQ: readonly QaPair[] = [
  {
    question: "NodeToolとは何ですか？",
    answer:
      "NodeToolは、画像、音声、テキスト、ノードワークフローのツールを備えたオープンソースのAI動画エディターです。エージェントにプロジェクトの作成や編集を頼み、そのあと自分で手を加えられます。ChatGPTやClaudeのプランでサインインするか、自分のプロバイダーキーを使うか、対応モデルをローカルで実行します。",
  },
  {
    question: "料金はかかりますか？",
    answer:
      "Studioは無料のオープンソースです。Cloudはアルファ期間中は無料で、今後の料金は発表されていません。プロバイダーのAPI料金は別にかかり、サブスクリプションでの利用はそのプランの上限にカウントされます。ローカルモデルは自分のハードウェアと電気代で動き、呼び出しごとのプロバイダー料金はかかりません。",
  },
  {
    question: "NodeToolはオープンソースですか？",
    answer:
      "はい。ソースコードはGitHubでAGPL-3.0ライセンスのもと公開されています。StudioとCloudは同じソースを使っており、NodeToolを自分でホストすることもできます。",
  },
  {
    question: "日本語で使えますか？",
    answer:
      "はい。設定 → 一般 → 外観 で表示言語を日本語に切り替えられます。翻訳は機械翻訳のため、まだ英語で表示される画面もあります。ドキュメントは英語です。",
  },
  {
    question: "ChatGPTやClaudeのサブスクリプションは使えますか？",
    answer:
      "はい、Studioで使えます。ChatGPTまたはClaudeでサインインすると、エージェントはAPIキーではなくそのサブスクリプションで動きます。その実行はプランの利用上限にカウントされます。",
  },
  {
    question: "GPUは必要ですか？",
    answer:
      "いいえ。Studioはホスト型のプロバイダーを使えるので、モデルはプロバイダー側のハードウェアで動きます。GPUが必要になるのは、対応するオープンウェイトモデルを自分のコンピューターで動かす場合だけです。必要な性能はモデルと実行環境によって異なります。",
  },
  {
    question: "どのモデルに対応していますか？",
    answer:
      "Flux、Seedance、Wan、Veo、Kling、Hailuo、Qwen Image、Whisper、ElevenLabs、Sunoなどの主要モデルに、FAL、KIE、OpenAI、Anthropic、Gemini、Replicate、Together、Groq、Mistral、OpenRouter、HuggingFaceといったプロバイダー経由で接続できます。MLX、Ollama、llama.cpp、vLLM、LM Studioで自分のコンピューター上でも実行できます。",
  },
];

/** hreflang pairs for the home page and /ja. Both pages list both. */
export const HOME_LANGUAGE_ALTERNATES = {
  en: "/",
  ja: "/ja",
  "x-default": "/",
} as const;
