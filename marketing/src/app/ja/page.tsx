import type { Metadata } from "next";
import { ArrowUpRight, Download } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import HeroDemoPlayer from "../../components/HeroDemoPlayer";
import FaqSection from "../../components/FaqSection";
import JsonLd from "../../components/JsonLd";
import { breadcrumbSchema } from "@/lib/jsonld";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";
import {
  HOME_LANGUAGE_ALTERNATES,
  JA_BADGE,
  JA_CARDS,
  JA_DESCRIPTION,
  JA_FAQ,
  JA_H1,
  JA_LANGUAGE_BODY,
  JA_LANGUAGE_TITLE,
  JA_LEAD,
  JA_LOCAL_BODY,
  JA_LOCAL_TITLE,
  JA_PLATFORMS,
  JA_SETUP,
  JA_STORYBOARD_BODY,
  JA_STORYBOARD_TITLE,
  JA_TITLE,
  JA_WORKFLOW_BODY,
  JA_WORKFLOW_TITLE,
} from "@/data/japanesePage";

/*
 * Japanese overview. Japan sends the third-most search clicks at a 9.4% CTR
 * with no Japanese content (search-performance report, 2026-11-12), so this
 * page tests whether a translated overview ranks for Japanese queries. The
 * root layout renders <html lang="en">, so the page marks its own content
 * lang="ja". Home and /ja list each other as hreflang alternates.
 */
export const metadata: Metadata = {
  title: { absolute: JA_TITLE },
  description: JA_DESCRIPTION,
  alternates: { canonical: "/ja", languages: HOME_LANGUAGE_ALTERNATES },
  openGraph: {
    title: JA_TITLE,
    description: JA_DESCRIPTION,
    url: "https://nodetool.ai/ja",
    siteName: "NodeTool",
    locale: "ja_JP",
    alternateLocale: ["en_US"],
    type: "website",
    images: DEFAULT_OG_IMAGES,
  },
  twitter: { card: "summary_large_image", title: JA_TITLE, description: JA_DESCRIPTION },
};

const sectionTitle = "text-2xl font-semibold tracking-tight md:text-3xl";
const bodyText = "leading-relaxed text-slate-300";
const cardLink = "focus-ring mt-4 inline-flex items-center gap-1 rounded font-medium text-cyan-200 hover:text-cyan-100";

export default function JapanesePage() {
  return (
    <>
      <SiteHeader />
      <JsonLd data={breadcrumbSchema([{ name: "日本語", url: "/ja" }])} />
      <main id="content" lang="ja" className="bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-5xl px-6 pb-24 pt-36 lg:px-8">
          <section aria-labelledby="ja-title">
            <p className="mb-5 text-base font-medium text-cyan-200">{JA_BADGE}</p>
            <h1 id="ja-title" className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">{JA_H1}</h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-300">{JA_LEAD}</p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <a href="/download?from=ja" className="focus-ring inline-flex items-center gap-2 rounded-full bg-cyan-200 px-6 py-3 font-medium text-slate-950 hover:bg-cyan-100">
                <Download className="h-4 w-4" aria-hidden="true" />
                無料でダウンロード
              </a>
              <a href="https://app.nodetool.ai" target="_blank" rel="noopener noreferrer" className="focus-ring rounded font-medium text-slate-100 hover:text-cyan-200">
                ブラウザで試す
              </a>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-300">{JA_SETUP}</p>
            <p className="mt-2 text-xs text-slate-400">{JA_PLATFORMS}</p>
          </section>

          <div className="mt-14">
            <HeroDemoPlayer
              mediaBase="/hero-flow"
              alt="NodeTool：一文がビートシート、登場人物、静止画とクリップの絵コンテ、完成した編集になるまで"
            />
          </div>

          <ul aria-label="NodeToolで作れるもの" className="mt-16 grid gap-8 md:grid-cols-3">
            {JA_CARDS.map((card) => (
              <li key={card.href} className="rounded-xl border border-slate-700 p-6">
                <h2 className="text-xl font-medium">{card.title}</h2>
                <p className={`mt-3 ${bodyText}`}>{card.body}</p>
                <a href={card.href} hrefLang="en" className={cardLink}>
                  {card.linkLabel}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>

          {[
            { id: "ja-storyboard", title: JA_STORYBOARD_TITLE, body: JA_STORYBOARD_BODY, href: "/storyboards", label: "NodeToolで作った映画を見る（英語）" },
            { id: "ja-workflow", title: JA_WORKFLOW_TITLE, body: JA_WORKFLOW_BODY, href: "/node-based-workflows", label: "ノードワークフローについて（英語）" },
            { id: "ja-local", title: JA_LOCAL_TITLE, body: JA_LOCAL_BODY, href: "/studio", label: "Studioについて（英語）" },
            { id: "ja-language", title: JA_LANGUAGE_TITLE, body: JA_LANGUAGE_BODY, href: "https://docs.nodetool.ai", label: "ドキュメント（英語）" },
          ].map((section) => (
            <section key={section.id} aria-labelledby={section.id} className="mt-20 grid gap-6 border-t border-slate-700 pt-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <h2 id={section.id} className={sectionTitle}>{section.title}</h2>
              <div>
                <p className={bodyText}>{section.body}</p>
                <a href={section.href} hrefLang="en" className={cardLink}>
                  {section.label}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </section>
          ))}

          <FaqSection items={JA_FAQ} heading="よくある質問" className="mt-20 max-w-3xl" id="ja-faq" />

          <div className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t border-slate-700 pt-10">
            <p className="max-w-xl text-lg leading-relaxed text-slate-300">
              NodeTool Studioは無料のオープンソースです。
              <a href="/" hrefLang="en" className="focus-ring ml-2 rounded text-cyan-200 underline underline-offset-2 hover:text-cyan-100">English</a>
            </p>
            <a href="/download?from=ja" className="focus-ring inline-flex items-center rounded-full bg-slate-100 px-6 py-3 font-medium text-slate-950 hover:bg-slate-200">
              無料でダウンロード
            </a>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
