import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import MarketingPageShell from "@/components/MarketingPageShell";
import JsonLd from "@/components/JsonLd";
import LinkedSentence from "@/components/localized/LinkedSentence";
import LocalizedCatalog from "@/components/localized/LocalizedCatalog";
import StoryboardViewer from "@/components/storyboards/StoryboardViewer";
import { StoryboardCard } from "@/components/storyboards/StoryboardCard";
import { isVertical, storyboards } from "@/data/storyboards";
import type { Storyboard } from "@/data/storyboards";
import { storyboardUploadDate } from "@/data/contentDates";
import { videoUploadDate } from "@/lib/jsonld";
import { fmt } from "@/i18n/detailLabels";
import type { StoryboardLabels } from "@/i18n/detailLabels";
import { localizedStoryboard, storyboardLabels } from "@/i18n/detailPages";
import { localeHref } from "@/i18n/links";
import { LOCALES, type Locale } from "@/i18n/routes";

/*
 * The page of one storyboard, /storyboards/<slug>, and its translations
 * (/zh/storyboards/<slug>). A translation passes its locale: the board's text
 * and the page's words switch, the film and the stills stay.
 */

const inlineLink =
  "focus-ring rounded text-amber-300 underline underline-offset-2 hover:text-amber-200";

function related(board: Storyboard): Storyboard[] {
  const index = storyboards.findIndex((item) => item.slug === board.slug);
  const sameCategory = storyboards.filter(
    (item) => item.category === board.category && item.slug !== board.slug
  );
  const next = [...storyboards.slice(index + 1), ...storyboards.slice(0, index)];
  const picks = sameCategory.slice(0, 3);
  for (const item of next) {
    if (picks.length >= 3) {
      break;
    }
    if (!picks.includes(item)) {
      picks.push(item);
    }
  }
  return picks;
}

function Header({ board, labels }: { board: Storyboard; labels: StoryboardLabels }) {
  const wide = !isVertical(board);
  const facts = [
    { label: labels.length, value: fmt(labels.viewer.seconds, { n: Math.round(board.video.duration) }) },
    { label: labels.shots, value: String(board.shots.length) },
    { label: labels.format, value: board.aspectRatio }
  ];
  return (
    <header
      className={
        wide ? "grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]" : ""
      }
    >
      <div>
        <p className="flex items-center gap-3 text-sm">
          <span className="font-medium text-amber-300">
            {labels.categories[board.category]}
          </span>
          <span className="font-jetbrains text-slate-500">{labels.kind}</span>
        </p>
        <h1
          className={`mt-4 font-semibold leading-[1.05] tracking-tight text-white ${
            wide ? "text-4xl md:text-5xl" : "text-4xl md:text-6xl"
          }`}
        >
          {board.title}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-300 md:text-xl">
          {board.description}
        </p>
      </div>
      <dl
        className={`grid max-w-md grid-cols-3 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 ${
          wide ? "" : "mt-8"
        }`}
      >
        {facts.map((fact) => (
          <div key={fact.label} className="bg-slate-950 px-5 py-4">
            <dt className="text-xs text-slate-400">{fact.label}</dt>
            <dd className="mt-1.5 text-lg font-medium text-white">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

export default function StoryboardDetail({
  board: english,
  locale = null
}: {
  board: Storyboard;
  locale?: Locale | null;
}) {
  const board = localizedStoryboard(locale, english);
  const labels = storyboardLabels(locale);
  const href = (route: string) => localeHref(locale, route).href;
  const more = related(english);
  const uploadDate = storyboardUploadDate(board.slug);
  return (
    <MarketingPageShell lang={locale ? LOCALES[locale].hreflang : undefined}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: board.title,
          description: board.description,
          ...(locale ? { inLanguage: LOCALES[locale].hreflang } : {}),
          thumbnailUrl: `https://nodetool.ai${board.video.poster.src}`,
          contentUrl: board.video.src,
          duration: `PT${Math.round(board.video.duration)}S`,
          width: board.video.width,
          height: board.video.height,
          ...(uploadDate ? { uploadDate: videoUploadDate(uploadDate) } : {})
        }}
      />
      <article className="mx-auto max-w-7xl px-6 pb-24 pt-10 lg:px-8">
        <a
          href={href("/storyboards")}
          className="focus-ring mb-10 inline-flex items-center gap-2 rounded text-sm text-slate-400 hover:text-amber-200"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {labels.back}
        </a>
        <StoryboardViewer board={board} labels={labels.viewer}>
          <Header board={board} labels={labels} />
        </StoryboardViewer>
        <section
          aria-label={`${labels.brief} · ${labels.style}`}
          className="mt-24 grid gap-12 border-t border-white/10 pt-16 md:grid-cols-2 md:gap-16"
        >
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">
              {labels.brief}
            </h2>
            <p className="mt-5 leading-relaxed text-slate-300">{board.brief}</p>
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">
              {labels.style}
            </h2>
            <figure className="mt-5 border-l-2 border-amber-300 pl-6">
              <blockquote className="leading-relaxed text-slate-100">
                {board.style}
              </blockquote>
            </figure>
          </div>
        </section>
        <section
          aria-labelledby="open-title"
          className="mt-20 flex flex-col items-start justify-between gap-6 rounded-2xl border border-white/10 bg-white/[0.03] p-8 md:flex-row md:items-center"
        >
          <div className="max-w-xl">
            <h2 id="open-title" className="text-xl font-semibold tracking-tight text-white">
              {labels.openTitle}
            </h2>
            <p className="mt-2 leading-relaxed text-slate-300">
              {labels.openBody}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              <LinkedSentence
                locale={locale}
                className={inlineLink}
                template={labels.openLinks}
                links={{
                  editor: { href: "/ai-video-editor", label: labels.editor },
                  guide: { href: "https://docs.nodetool.ai/storyboard-editor", label: labels.guide }
                }}
              />
              {board.category === "commercial" && (
                <>
                  {" "}
                  <LinkedSentence
                    locale={locale}
                    className={inlineLink}
                    template={labels.productLinks}
                    links={{ marketing: { href: "/marketing", label: labels.marketing } }}
                  />
                </>
              )}
            </p>
          </div>
          <a
            href={href("/download")}
            className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-full bg-amber-400 px-6 py-3 font-medium text-slate-950 transition-colors hover:bg-amber-300"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {labels.download}
          </a>
        </section>
        <nav
          aria-labelledby="more-title"
          className="mt-20 border-t border-white/10 pt-16"
        >
          <div className="mb-10 flex items-end justify-between gap-4">
            <h2 id="more-title" className="text-2xl font-semibold tracking-tight text-white">
              {labels.more}
            </h2>
            <a
              href={href("/storyboards")}
              className="focus-ring inline-flex items-center gap-2 rounded text-sm text-slate-300 hover:text-amber-200"
            >
              {fmt(labels.seeAll, { count: storyboards.length })}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          {locale ? (
            <LocalizedCatalog locale={locale} source="storyboards" slugs={more.map((item) => item.slug)} />
          ) : (
            <ul className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {more.map((item) => (
                <li key={item.slug}>
                  <StoryboardCard board={item} />
                </li>
              ))}
            </ul>
          )}
        </nav>
      </article>
    </MarketingPageShell>
  );
}
