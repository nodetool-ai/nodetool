import React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { faqForSurface, type FaqEntry, type FaqSurface } from "@/data/faqEntries";

/**
 * Inline FAQ block — the single rendering used on the `/faq` hub, on the
 * standalone `/faq/<slug>` pages, and as a section on landing / comparison /
 * model pages. One source (`faqEntries.ts`), one component, three surfaces.
 *
 * Server-rendered with native `<details>` so every answer is in the server HTML
 * for crawlers and needs no client JS. Pass `surface` to pull the rows pinned to
 * a marketing surface, or pass `items` explicitly.
 */

export type FaqBlockProps = {
  /** Pull rows pinned to this surface (landing/comparison/models). */
  surface?: FaqSurface;
  /** Or pass rows directly (e.g. the hub passes a category group). */
  items?: FaqEntry[];
  /** Section heading. Set to null to omit. */
  heading?: string | null;
  /** Show a link to each row's standalone /faq page. */
  linkToStandalone?: boolean;
  /** Extra classes on the wrapping section. */
  className?: string;
};

const markdownComponents = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    const external = !!href && /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        className="text-blue-300 underline decoration-blue-300/40 underline-offset-2 hover:text-blue-200"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm leading-7 text-slate-300">{children}</p>
  ),
};

function FaqRow({
  item,
  linkToStandalone,
}: {
  item: FaqEntry;
  linkToStandalone?: boolean;
}) {
  return (
    <details className="group border-b border-slate-800/70 py-4">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-left">
        <span className="text-base font-semibold leading-7 text-white">
          {item.question}
        </span>
        <span
          aria-hidden="true"
          className="mt-1 text-slate-500 transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="mt-3 space-y-3 pr-6">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {item.answerMd}
        </ReactMarkdown>
        {linkToStandalone && (
          <Link
            href={item.route}
            className="inline-block text-xs font-medium text-blue-300 hover:text-blue-200"
          >
            Read more →
          </Link>
        )}
      </div>
    </details>
  );
}

export default function FaqBlock({
  surface,
  items,
  heading = "Frequently asked questions",
  linkToStandalone = false,
  className = "",
}: FaqBlockProps) {
  const rows = items ?? (surface ? faqForSurface(surface) : []);
  if (rows.length === 0) return null;

  return (
    <section
      aria-label={heading ?? "Frequently asked questions"}
      className={`mx-auto max-w-3xl px-6 ${className}`}
    >
      {heading && (
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          {heading}
        </h2>
      )}
      <div className="mt-6">
        {rows.map((item) => (
          <FaqRow key={item.slug} item={item} linkToStandalone={linkToStandalone} />
        ))}
      </div>
    </section>
  );
}
