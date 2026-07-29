import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import {
  faqEntries,
  getFaq,
  FAQ_CATEGORY_LABELS,
  type FaqEntry,
} from "@/data/faqEntries";

const BASE_URL = "https://nodetool.ai";

export function generateStaticParams() {
  return faqEntries.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const faq = getFaq(slug);
  if (!faq) return {};
  return {
    title: faq.title,
    description: faq.description,
    alternates: { canonical: faq.route },
    openGraph: {
      title: faq.question,
      description: faq.description,
      url: `${BASE_URL}${faq.route}`,
      type: "article",
    },
  };
}

function plainText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
    <p className="text-lg leading-8 text-slate-300">{children}</p>
  ),
};

function relatedFaqs(faq: FaqEntry): FaqEntry[] {
  return faqEntries
    .filter((e) => e.slug !== faq.slug && e.category === faq.category)
    .slice(0, 4);
}

export default async function FaqStandalonePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const faq = getFaq(slug);
  if (!faq) notFound();

  // QAPage structured data — the standalone-page schema for a single Q&A.
  const qaPage = {
    "@context": "https://schema.org",
    "@type": "QAPage",
    mainEntity: {
      "@type": "Question",
      name: faq.question,
      answerCount: 1,
      acceptedAnswer: {
        "@type": "Answer",
        text: plainText(faq.answerMd),
        url: `${BASE_URL}${faq.route}`,
      },
    },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
      { "@type": "ListItem", position: 2, name: "FAQ", item: `${BASE_URL}/faq` },
      {
        "@type": "ListItem",
        position: 3,
        name: faq.question,
        item: `${BASE_URL}${faq.route}`,
      },
    ],
  };

  const related = relatedFaqs(faq);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={qaPage} />
      <JsonLd data={breadcrumb} />

      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-[120px]" />
      </div>

      <SiteHeader />

      <article className="relative isolate mx-auto max-w-3xl px-6 pt-28 sm:pt-36">
        <nav className="text-sm text-slate-400">
          <Link href="/faq" className="hover:text-slate-200">
            FAQ
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-500">
            {FAQ_CATEGORY_LABELS[faq.category]}
          </span>
        </nav>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-white md:text-4xl">
          {faq.question}
        </h1>

        <div className="mt-6 space-y-5">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {faq.answerMd}
          </ReactMarkdown>
        </div>

        {faq.relatedRoute && (
          <div className="mt-8">
            <Link
              href={faq.relatedRoute}
              className="inline-flex items-center gap-1 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-200 hover:bg-blue-500/20"
            >
              Learn more →
            </Link>
          </div>
        )}

        {related.length > 0 && (
          <section aria-label="Related questions" className="mt-16">
            <h2 className="text-lg font-semibold text-white">
              Related questions
            </h2>
            <ul className="mt-4 space-y-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={r.route}
                    className="text-slate-300 hover:text-blue-200"
                  >
                    {r.question}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-16 mb-24">
          <Link href="/faq" className="text-sm text-blue-300 hover:text-blue-200">
            ← All questions
          </Link>
        </div>
      </article>

      <SiteFooter />
    </main>
  );
}
