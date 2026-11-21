import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, Download } from "lucide-react";
import SiteHeader from "../SiteHeader";
import SiteFooter from "../SiteFooter";
import HeroDemoPlayer from "../HeroDemoPlayer";
import FaqSection from "../FaqSection";
import JsonLd from "../JsonLd";
import DownloadPanel from "../DownloadPanel";
import LocalizedCatalog from "./LocalizedCatalog";
import { breadcrumbSchema } from "@/lib/jsonld";
import { DEFAULT_OG_IMAGES } from "@/lib/defaultOgImage";
import { modelDirectoryCounts } from "@/data/modelDirectory";
import { STAGE_COSTS } from "@/data/stageCosts";
import { storyboards } from "@/data/storyboards";
import { adRecipes } from "@/data/adLibrary";
import { LOCALES, languageAlternates, localizedPath, type Locale } from "@/i18n/routes";
import type { LocalizedPageContent, PageLink, PageMedia, PageSection } from "@/i18n/content";
import { localizedPage, localeChrome, downloadPanelCopy } from "@/i18n/pages";

/*
 * The frame of every translated page (/zh/studio, /zh/pricing, …). The copy
 * and the media choice come from i18n/<locale>/pages, so a page is data and
 * this file is the only layout. The root layout renders <html lang="en">, so
 * <main> carries the page's language, as on the language overview pages.
 */

export function localizedMetadata(locale: Locale, route: string): Metadata {
  const page = localizedPage(locale, route);
  const path = localizedPath(locale, route) ?? route;
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: path, languages: languageAlternates(route) },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `https://nodetool.ai${path}`,
      siteName: "NodeTool",
      locale: LOCALES[locale].ogLocale,
      alternateLocale: ["en_US"],
      type: "website",
      images: DEFAULT_OG_IMAGES,
    },
    twitter: { card: "summary_large_image", title: page.title, description: page.description },
  };
}

/**
 * Counts and prices that move with the catalogs, written as {token} in the
 * copy. Prices come from the calculator catalog through stageCosts.ts, as on
 * the English pages.
 */
const TOKENS: Record<string, string> = {
  modelCount: modelDirectoryCounts().models.toLocaleString("en-US"),
  providerCount: String(modelDirectoryCounts().providers),
  stillModel: STAGE_COSTS.stillModel,
  stillPrice: STAGE_COSTS.stillPrice,
  clipModel: STAGE_COSTS.clipModel,
  clipPrice: STAGE_COSTS.clipPrice,
  fiveClipPrice: STAGE_COSTS.fiveClipPrice,
  storyboardCount: String(storyboards.length),
  adCount: String(adRecipes.length),
};

export function fill(text: string): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => TOKENS[key] ?? match);
}

type ResolvedLink = { href: string; label: string; external: boolean; english: boolean };

/**
 * An internal link goes to the translated page when there is one. Otherwise
 * it stays on the English page, marked with hrefLang and a suffix, as do the
 * English docs.
 */
function resolveLink(locale: Locale, link: PageLink): ResolvedLink {
  const { href } = link;
  if (/^https?:\/\//.test(href)) {
    const english = new URL(href).hostname === "docs.nodetool.ai";
    return { href, label: link.label, external: true, english };
  }
  if (href.startsWith(`/${locale}`) || href.startsWith("#")) {
    return { href, label: link.label, external: false, english: false };
  }
  const [path, hash = ""] = href.split("#");
  const translated = localizedPath(locale, path);
  if (translated) {
    return { href: hash ? `${translated}#${hash}` : translated, label: link.label, external: false, english: false };
  }
  return { href, label: link.label, external: false, english: true };
}

function SmartLink({
  locale,
  link,
  className,
  icon = "arrow",
}: {
  locale: Locale;
  link: PageLink;
  className: string;
  icon?: "arrow" | "download" | "none";
}) {
  const chrome = localeChrome(locale);
  const resolved = resolveLink(locale, link);
  return (
    <a
      href={resolved.href}
      className={className}
      {...(resolved.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...(resolved.english ? { hrefLang: "en" } : {})}
    >
      {icon === "download" && <Download className="h-4 w-4" aria-hidden="true" />}
      {resolved.label}
      {resolved.english && chrome.englishSuffix}
      {icon === "arrow" &&
        (resolved.external ? (
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        ))}
    </a>
  );
}

const primaryButton =
  "focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition-colors hover:bg-blue-500";
const secondaryButton =
  "focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-6 py-3 text-sm font-semibold text-blue-200 transition-colors hover:border-blue-400 hover:bg-blue-500/20";
const textLink = "focus-ring inline-flex items-center gap-1 rounded font-medium text-blue-300 hover:text-blue-200";
const kickerClass = "text-xs font-semibold uppercase tracking-[0.18em] text-blue-300";
const h2Class = "mt-3 text-2xl font-semibold tracking-tight text-white md:text-4xl";
const bodyClass = "leading-relaxed text-slate-300";
const cardClass = "rounded-2xl border border-slate-800/70 bg-slate-900/50 p-6";

function Media({ media, priority }: { media: PageMedia; priority: boolean }) {
  if (media.kind === "reel") {
    // HeroDemoPlayer is its own <figure> and prints the caption.
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-2 shadow-2xl shadow-black/70">
        <HeroDemoPlayer mediaBase={media.base} alt={media.alt} caption={media.caption} priority={priority} />
      </div>
    );
  }
  return (
    <figure>
      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-2 shadow-2xl shadow-black/70">
        <Image
          src={media.src}
          alt={media.alt}
          width={media.width}
          height={media.height}
          priority={priority}
          sizes="(min-width: 1024px) 960px, 100vw"
          className="h-auto w-full rounded-xl"
        />
      </div>
      {media.caption && <figcaption className="mt-3 text-center text-sm text-slate-400">{media.caption}</figcaption>}
    </figure>
  );
}

function Code({ code }: { code: string }) {
  return (
    <pre className="mt-6 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-sm text-slate-200">
      <code>{code}</code>
    </pre>
  );
}

function SectionHeader({ id, kicker, title, intro }: { id: string; kicker?: string; title: string; intro?: string }) {
  return (
    <header className="max-w-3xl">
      {kicker && <p className={kickerClass}>{kicker}</p>}
      <h2 id={`${id}-title`} className={h2Class}>
        {fill(title)}
      </h2>
      {intro && <p className={`mt-4 text-lg ${bodyClass}`}>{fill(intro)}</p>}
    </header>
  );
}

function Section({ locale, section }: { locale: Locale; section: PageSection }) {
  const id = section.id;
  const wrap = (children: React.ReactNode) => (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto mt-20 max-w-6xl px-6 sm:mt-28 lg:px-8">
      {children}
    </section>
  );

  switch (section.kind) {
    case "text":
      return wrap(
        <div className={section.media ? "grid items-center gap-10 lg:grid-cols-2" : ""}>
          <div className="max-w-3xl">
            {section.kicker && <p className={kickerClass}>{section.kicker}</p>}
            <h2 id={`${id}-title`} className={h2Class}>
              {fill(section.title)}
            </h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className={`mt-4 text-lg ${bodyClass}`}>
                {fill(paragraph)}
              </p>
            ))}
            {section.bullets && (
              <ul className="mt-6 space-y-3">
                {section.bullets.map((item) => (
                  <li key={item} className={`flex gap-3 ${bodyClass}`}>
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" aria-hidden="true" />
                    <span>{fill(item)}</span>
                  </li>
                ))}
              </ul>
            )}
            {section.code && <Code code={section.code} />}
            {section.links && (
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
                {section.links.map((link) => (
                  <SmartLink key={link.href} locale={locale} link={link} className={textLink} />
                ))}
              </div>
            )}
          </div>
          {section.media && <Media media={section.media} priority={false} />}
        </div>
      );
    case "cards":
      return wrap(
        <>
          <SectionHeader id={id} kicker={section.kicker} title={section.title} intro={section.intro} />
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {section.cards.map((card) => (
              <li key={card.title} className={`${cardClass} flex flex-col`}>
                {card.meta && <p className="font-mono text-xs text-slate-400">{card.meta}</p>}
                <h3 className={`text-lg font-semibold text-white ${card.meta ? "mt-2" : ""}`}>{card.title}</h3>
                <p className={`mt-2 flex-1 text-sm ${bodyClass}`}>{fill(card.body)}</p>
                {card.link && <SmartLink locale={locale} link={card.link} className={`${textLink} mt-4 text-sm`} />}
              </li>
            ))}
          </ul>
          {section.note && <p className="mt-6 text-sm text-slate-400">{fill(section.note)}</p>}
        </>
      );
    case "steps":
      return wrap(
        <>
          <SectionHeader id={id} kicker={section.kicker} title={section.title} intro={section.intro} />
          <ol className="mt-10 grid gap-5 md:grid-cols-2">
            {section.steps.map((step, index) => (
              <li key={step.title} className={cardClass}>
                <p className="font-mono text-sm text-blue-300">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{step.title}</h3>
                {step.meta && <p className="mt-1 font-mono text-xs text-slate-400">{step.meta}</p>}
                <p className={`mt-2 text-sm ${bodyClass}`}>{fill(step.body)}</p>
              </li>
            ))}
          </ol>
          {section.note && <p className="mt-6 text-sm text-slate-400">{fill(section.note)}</p>}
          {section.links && (
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
              {section.links.map((link) => (
                <SmartLink key={link.href} locale={locale} link={link} className={textLink} />
              ))}
            </div>
          )}
        </>
      );
    case "table":
      return wrap(
        <>
          <SectionHeader id={id} title={section.title} intro={section.intro} />
          <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-800/70">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-slate-900/80 text-slate-200">
                <tr>
                  {section.head.map((cell) => (
                    <th key={cell} scope="col" className="px-4 py-3 font-semibold">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-300">
                {section.rows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, index) =>
                      index === 0 ? (
                        <th key={index} scope="row" className="px-4 py-3 font-medium text-slate-100">
                          {cell}
                        </th>
                      ) : (
                        <td key={index} className="px-4 py-3">
                          {cell}
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {section.note && <p className="mt-4 text-sm text-slate-400">{fill(section.note)}</p>}
        </>
      );
    case "catalog":
      return wrap(
        <>
          <SectionHeader id={id} kicker={section.kicker} title={section.title} intro={section.intro} />
          <LocalizedCatalog locale={locale} source={section.source} slugs={section.slugs} />
          {section.link && <SmartLink locale={locale} link={section.link} className={`${textLink} mt-8`} />}
        </>
      );
    case "installers":
      return wrap(
        <>
          <SectionHeader id={id} title={section.title} intro={section.intro} />
          <div className="mt-8 max-w-3xl">
            <DownloadPanel copy={downloadPanelCopy(locale)} />
          </div>
        </>
      );
  }
}

export default function LocalizedPage({ locale, route }: { locale: Locale; route: string }) {
  const page: LocalizedPageContent = localizedPage(locale, route);
  const chrome = localeChrome(locale);
  const path = localizedPath(locale, route) ?? route;
  const { hero } = page;
  const primary = hero.primary ?? { label: chrome.download, href: "/download" };

  return (
    <>
      <SiteHeader />
      <JsonLd
        data={breadcrumbSchema([
          { name: LOCALES[locale].label, url: `/${locale}` },
          { name: page.name, url: path },
        ])}
      />
      <main id="content" lang={LOCALES[locale].hreflang} className="relative min-h-screen overflow-clip-safe bg-slate-950 pb-24 text-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[36rem] bg-gradient-to-b from-blue-950/40 to-transparent" aria-hidden="true" />
        <section aria-labelledby="page-title" className="relative mx-auto max-w-6xl px-6 pt-32 sm:pt-40 lg:px-8">
          <div className="max-w-3xl">
            <p className={kickerClass}>{hero.kicker}</p>
            <h1 id="page-title" className="mt-4 text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              {hero.h1}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-300 md:text-xl">{fill(hero.lead)}</p>
            {hero.code && <Code code={hero.code} />}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <SmartLink locale={locale} link={primary} className={primaryButton} icon={primary.href === "/download" ? "download" : "none"} />
              {hero.secondary && <SmartLink locale={locale} link={hero.secondary} className={secondaryButton} icon="none" />}
            </div>
            {hero.note && <p className="mt-4 text-sm text-slate-400">{fill(hero.note)}</p>}
          </div>
          {hero.media && (
            <div className="mt-14">
              <Media media={hero.media} priority />
            </div>
          )}
        </section>

        {page.sections.map((section) => (
          <Section key={section.id} locale={locale} section={section} />
        ))}

        {page.faq && (
          <FaqSection
            items={page.faq.items.map((item) => ({ question: item.question, answer: fill(item.answer) }))}
            heading={page.faq.heading}
            id="faq"
            className="mx-auto mt-20 max-w-3xl px-6 sm:mt-28"
          />
        )}

        {page.readMore && (
          <nav aria-labelledby="read-more-title" className="mx-auto mt-16 max-w-3xl px-6">
            <h2 id="read-more-title" className="text-lg font-semibold text-white">
              {page.readMore.heading}
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {page.readMore.links.map((link) => (
                <li key={link.href}>
                  <SmartLink locale={locale} link={link} className={`${textLink} text-sm`} />
                </li>
              ))}
            </ul>
          </nav>
        )}

        <section aria-labelledby="closing-title" className="mx-auto mt-24 max-w-3xl px-6 text-center">
          <h2 id="closing-title" className="text-3xl font-semibold tracking-tight md:text-4xl">
            {page.closing.title}
          </h2>
          <p className={`mt-4 text-lg ${bodyClass}`}>{fill(page.closing.body)}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <SmartLink
              locale={locale}
              link={page.closing.primary ?? { label: chrome.download, href: "/download" }}
              className={primaryButton}
              icon={(page.closing.primary?.href ?? "/download") === "/download" ? "download" : "none"}
            />
            {page.closing.secondary && (
              <SmartLink locale={locale} link={page.closing.secondary} className={secondaryButton} icon="none" />
            )}
          </div>
          <p className="mt-8 text-sm text-slate-400">
            <a href={route} hrefLang="en" lang="en" className="focus-ring rounded underline underline-offset-4 hover:text-slate-200">
              {chrome.englishVersion}
            </a>
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
