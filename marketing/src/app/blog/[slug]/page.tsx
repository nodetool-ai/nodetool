import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Download } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import BlogMarkdown from "@/components/BlogMarkdown";
import { SmartDownloadButton } from "@/app/SmartDownloadButton";
import {
  BLOG_BASE,
  blogPosts,
  formatDate,
  getPost,
  readingMinutes,
  siblingPosts,
  type BlogTag,
} from "@/data/blogEntries";
import {
  blogPostingSchema,
  breadcrumbSchema,
  faqPageSchema,
} from "@/lib/jsonld";

const BASE_URL = "https://nodetool.ai";

const TAG_CHIP: Record<BlogTag, string> = {
  Guide: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  Cost: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  Roundup: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  Tutorial: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  Comparison: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  "Deep dive": "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

const GLOW: Record<BlogTag, string> = {
  Guide: "bg-cyan-500/15",
  Cost: "bg-amber-500/15",
  Roundup: "bg-rose-500/15",
  Tutorial: "bg-emerald-500/15",
  Comparison: "bg-blue-500/15",
  "Deep dive": "bg-violet-500/15",
};

export function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: `${post.title} — NodeTool`,
    description: post.description,
    alternates: { canonical: post.route },
    openGraph: {
      title: post.headline,
      description: post.description,
      url: `${BASE_URL}${post.route}`,
      type: "article",
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
      authors: [post.author],
      tags: [post.tag],
    },
    twitter: {
      card: "summary_large_image",
      title: post.headline,
      description: post.description,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const minutes = readingMinutes(post);
  const siblings = siblingPosts(post.slug);

  // H2s in reading order, for the in-page contents list.
  const sections = [...post.bodyMd.matchAll(/^## (.+)$/gm)].map((m) => {
    const text = m[1].trim();
    return {
      text,
      id: text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    };
  });

  const articleLd = blogPostingSchema({
    headline: post.headline,
    description: post.description,
    url: post.route,
    image: `${post.route}/opengraph-image`,
    datePublished: post.date,
    dateModified: post.updated,
    author: post.author,
    keywords: [post.tag, "NodeTool", "AI workflows"],
    wordCount: post.bodyMd.trim().split(/\s+/).length,
  });

  const breadcrumb = breadcrumbSchema([
    { name: "Blog", url: BLOG_BASE },
    { name: post.headline, url: post.route },
  ]);

  const faqLd = faqPageSchema(post.faqs);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={articleLd} />
      <JsonLd data={breadcrumb} />
      <JsonLd data={faqLd} />

      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div
          className={`absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full ${GLOW[post.tag]} blur-[120px]`}
        />
      </div>

      <SiteHeader />

      <article className="relative isolate pt-28 sm:pt-36">
        <header className="mx-auto max-w-3xl px-6">
          <nav className="text-sm text-slate-400" aria-label="Breadcrumb">
            <Link href={BLOG_BASE} className="hover:text-slate-200 focus-ring rounded">
              Blog
            </Link>
            <span className="mx-2">/</span>
            <span className="text-slate-500">{post.tag}</span>
          </nav>

          <h1 className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl">
            {post.headline}
          </h1>

          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            {post.excerpt}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 font-semibold uppercase tracking-[0.14em] ${TAG_CHIP[post.tag]}`}
            >
              {post.tag}
            </span>
            <span>{post.author}</span>
            <span aria-hidden>·</span>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span aria-hidden>·</span>
            <span>{minutes} min read</span>
          </div>
        </header>

        {sections.length > 2 && (
          <nav
            aria-label="On this page"
            className="mx-auto mt-10 max-w-3xl px-6"
          >
            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                On this page
              </h2>
              <ul className="mt-3 space-y-2">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-sm text-slate-300 transition-colors hover:text-white focus-ring rounded"
                    >
                      {section.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        )}

        <div className="mx-auto mt-10 max-w-3xl px-6">
          <BlogMarkdown body={post.bodyMd} />
        </div>

        {/* Visible FAQ — the same rows the FAQPage schema above declares. */}
        <section
          aria-labelledby="post-faq"
          className="mx-auto mt-16 max-w-3xl px-6"
        >
          <h2
            id="post-faq"
            className="text-2xl font-semibold tracking-tight text-white md:text-3xl"
          >
            Frequently asked questions
          </h2>
          <dl className="mt-6 space-y-4">
            {post.faqs.map((item) => (
              <div
                key={item.question}
                className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-6"
              >
                <dt className="font-semibold text-white">{item.question}</dt>
                <dd className="mt-2 text-sm leading-7 text-slate-300">
                  {item.answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Curated internal links */}
        <section aria-label="Related pages" className="mx-auto mt-16 max-w-3xl px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Related
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {post.related.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl border border-slate-800/70 bg-slate-900/40 p-5 transition-colors hover:border-slate-700 focus-ring"
              >
                <span className="text-sm font-semibold text-white">
                  {item.label}
                </span>
                <span className="mt-1 block text-sm text-slate-400">
                  {item.note}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {siblings.length > 0 && (
          <section aria-label="More posts" className="mx-auto mt-16 max-w-3xl px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Read next
            </h2>
            <ul className="mt-6 space-y-3">
              {siblings.map((sibling) => (
                <li key={sibling.slug}>
                  <Link
                    href={sibling.route}
                    className="group flex items-center justify-between gap-4 rounded-xl border border-slate-800/60 bg-slate-950/40 px-5 py-4 transition-colors hover:border-slate-700 focus-ring"
                  >
                    <span>
                      <span className="block text-sm font-medium text-white">
                        {sibling.headline}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {sibling.tag} · {readingMinutes(sibling)} min read
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mx-auto my-24 max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Build it on your own keys.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            NodeTool Studio is free, open source, and runs on macOS, Windows,
            and Linux.
          </p>
          <div className="mt-8 flex justify-center">
            <SmartDownloadButton
              icon={<Download className="h-5 w-5" />}
              classNameOverride="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 focus-ring"
            />
          </div>
        </section>
      </article>

      <SiteFooter />
    </main>
  );
}
