import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Download } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import { SmartDownloadButton } from "@/app/SmartDownloadButton";
import {
  BLOG_BASE,
  blogTags,
  formatDate,
  postsByDate,
  postsForTag,
  readingMinutes,
  type BlogPost,
  type BlogTag,
} from "@/data/blogEntries";
import { absoluteUrl, breadcrumbSchema, itemListSchema } from "@/lib/jsonld";

const BASE_URL = "https://nodetool.ai";

const TITLE = "Blog — guides, costs, model roundups, and tutorials";
const DESCRIPTION =
  "Guides, cost breakdowns, model roundups, tutorials, and comparisons on building AI workflows in NodeTool: what a run costs at provider rates, which model fits the job, and how to build it on your own keys.";

export const metadata: Metadata = {
  title: `${TITLE} — NodeTool`,
  description: DESCRIPTION,
  alternates: {
    canonical: BLOG_BASE,
    types: { "application/rss+xml": `${BASE_URL}${BLOG_BASE}/feed.xml` },
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${BASE_URL}${BLOG_BASE}`,
    type: "website",
  },
};

const TAG_CHIP: Record<BlogTag, string> = {
  Guide: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  Cost: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  Roundup: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  Tutorial: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  Comparison: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  "Deep dive": "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

function PostCard({ post, featured }: { post: BlogPost; featured?: boolean }) {
  return (
    <article
      className={`group rounded-2xl border border-slate-800/70 bg-slate-900/40 p-6 transition-colors hover:border-slate-700 ${
        featured ? "md:p-8" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 font-semibold uppercase tracking-[0.14em] ${
            TAG_CHIP[post.tag]
          }`}
        >
          {post.tag}
        </span>
        <time dateTime={post.date}>{formatDate(post.date)}</time>
        <span aria-hidden>·</span>
        <span>{readingMinutes(post)} min read</span>
      </div>

      <h2
        className={`mt-4 font-semibold tracking-tight text-white ${
          featured ? "text-2xl md:text-3xl" : "text-xl"
        }`}
      >
        <Link href={post.route} className="focus-ring rounded">
          {post.headline}
        </Link>
      </h2>

      <p className="mt-3 text-sm leading-7 text-slate-300">{post.excerpt}</p>

      <Link
        href={post.route}
        className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-blue-300 transition-colors hover:text-blue-200 focus-ring rounded"
      >
        Read the post
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </article>
  );
}

export default function BlogHub() {
  const [featured, ...rest] = postsByDate;

  const breadcrumb = breadcrumbSchema([{ name: "Blog", url: BLOG_BASE }]);

  const itemList = itemListSchema(
    "NodeTool blog posts",
    postsByDate.map((p) => ({ name: p.headline, url: p.route })),
  );

  const blogLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "NodeTool blog",
    description: DESCRIPTION,
    url: absoluteUrl(BLOG_BASE),
    blogPost: postsByDate.map((p) => ({
      "@type": "BlogPosting",
      headline: p.headline,
      description: p.description,
      url: absoluteUrl(p.route),
      datePublished: p.date,
      dateModified: p.updated ?? p.date,
      author: { "@type": "Organization", name: p.author, url: BASE_URL },
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={breadcrumb} />
      <JsonLd data={itemList} />
      <JsonLd data={blogLd} />

      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-[120px]" />
        <div className="absolute top-1/2 -right-24 h-[24rem] w-[24rem] rounded-full bg-violet-500/10 blur-[120px]" />
      </div>

      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        <section aria-labelledby="blog-title" className="mx-auto max-w-3xl px-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
            Resources
          </span>
          <h1
            id="blog-title"
            className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
          >
            Building with NodeTool
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            What a run costs at provider rates, which model fits the job,
            step-by-step workflow builds, and straight comparisons with the
            other node canvases. Everything runs on your own keys.
          </p>
          <p className="mt-3 text-sm text-slate-400">
            <a href={`${BLOG_BASE}/feed.xml`} className="hover:text-slate-200 focus-ring rounded">
              RSS feed
            </a>
          </p>
        </section>

        {/* Tag jump links — the hub groups by tag further down. */}
        <nav
          aria-label="Post categories"
          className="mx-auto mt-8 flex max-w-3xl flex-wrap gap-2 px-6"
        >
          {blogTags.map((tag) => (
            <a
              key={tag}
              href={`#${tag.toLowerCase().replace(/\s+/g, "-")}`}
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${TAG_CHIP[tag]} focus-ring`}
            >
              {tag}
              <span className="ml-2 font-normal opacity-70">
                {postsForTag(tag).length}
              </span>
            </a>
          ))}
        </nav>

        {featured && (
          <section aria-label="Latest post" className="mx-auto mt-12 max-w-3xl px-6">
            <PostCard post={featured} featured />
          </section>
        )}

        {rest.length > 0 && (
          <section aria-label="All posts" className="mx-auto mt-6 max-w-3xl px-6">
            <div className="grid gap-6">
              {rest.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </div>
          </section>
        )}

        {/* Grouped by category */}
        <section
          aria-label="Posts by category"
          className="mx-auto mt-20 max-w-3xl px-6"
        >
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Browse by category
          </h2>
          <div className="mt-8 space-y-10">
            {blogTags.map((tag) => {
              const posts = postsForTag(tag);
              if (posts.length === 0) return null;
              return (
                <div key={tag} id={tag.toLowerCase().replace(/\s+/g, "-")} className="scroll-mt-28">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {tag}
                  </h3>
                  <ul className="mt-4 space-y-3">
                    {posts.map((post) => (
                      <li key={post.slug}>
                        <Link
                          href={post.route}
                          className="flex flex-col gap-1 rounded-xl border border-slate-800/60 bg-slate-950/40 px-5 py-4 transition-colors hover:border-slate-700 focus-ring sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="text-sm font-medium text-white">
                            {post.headline}
                          </span>
                          <span className="shrink-0 text-xs text-slate-400">
                            {formatDate(post.date)} · {readingMinutes(post)} min
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* Where to go next */}
        <section aria-label="Elsewhere on the site" className="mx-auto mt-20 max-w-3xl px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Keep going
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              { href: "/templates", label: "Workflow templates", note: "Runnable graphs for image, video, audio, and agents." },
              { href: "/apps", label: "Mini apps", note: "Workflows wrapped in a focused interface." },
              { href: "/models", label: "Models & providers", note: "What the nodes can point at." },
              { href: "/pricing", label: "Pricing", note: "Free Studio, your keys, provider prices." },
            ].map((item) => (
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

        <section className="mx-auto my-24 max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Read it, then build it.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Every workflow in these posts runs in NodeTool Studio on your own
            keys.
          </p>
          <div className="mt-8 flex justify-center">
            <SmartDownloadButton
              icon={<Download className="h-5 w-5" />}
              classNameOverride="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 focus-ring"
            />
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
