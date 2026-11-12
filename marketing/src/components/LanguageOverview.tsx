import type { Metadata } from "next";
import { ArrowUpRight, Download } from "lucide-react";
import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import HeroDemoPlayer from "./HeroDemoPlayer";
import FaqSection from "./FaqSection";
import JsonLd from "./JsonLd";
import { breadcrumbSchema } from "@/lib/jsonld";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";
import {
  BLOCK_HREFS,
  CARD_HREFS,
  HOME_LANGUAGE_ALTERNATES,
  LANGUAGE_PAGES,
  type LanguageCode,
} from "@/data/languagePages";

/*
 * The translated overview pages (/ja, /zh, /hi, /es, /pt). Japan sent the
 * third-most search clicks with no Japanese content (search-performance
 * report, 2026-11-12), which started this set. The root layout renders
 * <html lang="en">, so each page marks its own content with its language.
 * Home and every language page list one another as hreflang alternates.
 */
export function languageMetadata(locale: LanguageCode): Metadata {
  const page = LANGUAGE_PAGES[locale];
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: page.path, languages: HOME_LANGUAGE_ALTERNATES },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `https://nodetool.ai${page.path}`,
      siteName: "NodeTool",
      locale: page.ogLocale,
      alternateLocale: ["en_US"],
      type: "website",
      images: DEFAULT_OG_IMAGES,
    },
    twitter: { card: "summary_large_image", title: page.title, description: page.description },
  };
}

const sectionTitle = "text-2xl font-semibold tracking-tight md:text-3xl";
const bodyText = "leading-relaxed text-slate-300";
const cardLink = "focus-ring mt-4 inline-flex items-center gap-1 rounded font-medium text-cyan-200 hover:text-cyan-100";

export default function LanguageOverview({ locale }: { locale: LanguageCode }) {
  const page = LANGUAGE_PAGES[locale];
  const downloadHref = `/download?from=${locale}`;
  const blocks = (["storyboard", "workflow", "local", "language"] as const).map((key) => ({
    id: `${locale}-${key}`,
    href: BLOCK_HREFS[key],
    ...page[key],
  }));

  return (
    <>
      <SiteHeader />
      <JsonLd data={breadcrumbSchema([{ name: page.label, url: page.path }])} />
      <main id="content" lang={page.hreflang} className="bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-5xl px-6 pb-24 pt-36 lg:px-8">
          <section aria-labelledby={`${locale}-title`}>
            <p className="mb-5 text-base font-medium text-cyan-200">{page.badge}</p>
            <h1 id={`${locale}-title`} className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">{page.h1}</h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-300">{page.lead}</p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <a href={downloadHref} className="focus-ring inline-flex items-center gap-2 rounded-full bg-cyan-200 px-6 py-3 font-medium text-slate-950 hover:bg-cyan-100">
                <Download className="h-4 w-4" aria-hidden="true" />
                {page.download}
              </a>
              <a href="https://app.nodetool.ai" target="_blank" rel="noopener noreferrer" className="focus-ring rounded font-medium text-slate-100 hover:text-cyan-200">
                {page.tryBrowser}
              </a>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-300">{page.setup}</p>
            <p className="mt-2 text-xs text-slate-400">{page.platforms}</p>
          </section>

          <div className="mt-14">
            <HeroDemoPlayer mediaBase="/hero-flow" alt={page.videoAlt} />
          </div>

          <ul aria-label={page.cardsLabel} className="mt-16 grid gap-8 md:grid-cols-3">
            {page.cards.map((card, index) => (
              <li key={CARD_HREFS[index]} className="rounded-xl border border-slate-700 p-6">
                <h2 className="text-xl font-medium">{card.title}</h2>
                <p className={`mt-3 ${bodyText}`}>{card.body}</p>
                <a href={CARD_HREFS[index]} hrefLang="en" className={cardLink}>
                  {card.linkLabel}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>

          {blocks.map((block) => (
            <section key={block.id} aria-labelledby={block.id} className="mt-20 grid gap-6 border-t border-slate-700 pt-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <h2 id={block.id} className={sectionTitle}>{block.title}</h2>
              <div>
                <p className={bodyText}>{block.body}</p>
                <a href={block.href} hrefLang="en" className={cardLink}>
                  {block.linkLabel}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </section>
          ))}

          <FaqSection items={page.faq} heading={page.faqHeading} className="mt-20 max-w-3xl" id={`${locale}-faq`} />

          <div className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t border-slate-700 pt-10">
            <p className="max-w-xl text-lg leading-relaxed text-slate-300">
              {page.closing}
              <a href="/" hrefLang="en" lang="en" className="focus-ring ml-2 rounded text-cyan-200 underline underline-offset-2 hover:text-cyan-100">English</a>
            </p>
            <a href={downloadHref} className="focus-ring inline-flex items-center rounded-full bg-slate-100 px-6 py-3 font-medium text-slate-950 hover:bg-slate-200">
              {page.download}
            </a>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
