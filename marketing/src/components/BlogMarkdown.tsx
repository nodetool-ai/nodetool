import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders a blog post body from GitHub-flavored Markdown.
 *
 * Server component, same `react-markdown` + `remark-gfm` pair `FaqBlock` uses —
 * no MDX pipeline and no new dependency. Element styling is explicit rather
 * than a typography plugin, so the body matches the dark surfaces the rest of
 * the site paints.
 *
 * Headings get slug ids so the in-page contents list can link to them.
 */

function slugify(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => (typeof child === "string" ? child : ""))
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type NodeProps = { children?: React.ReactNode };

const components = {
  h2: ({ children }: NodeProps) => (
    <h2
      id={slugify(children)}
      className="mt-14 scroll-mt-28 text-2xl font-semibold tracking-tight text-white md:text-3xl"
    >
      {children}
    </h2>
  ),
  h3: ({ children }: NodeProps) => (
    <h3
      id={slugify(children)}
      className="mt-10 scroll-mt-28 text-xl font-semibold tracking-tight text-white"
    >
      {children}
    </h3>
  ),
  p: ({ children }: NodeProps) => (
    <p className="mt-5 text-[17px] leading-8 text-slate-300">{children}</p>
  ),
  ul: ({ children }: NodeProps) => (
    <ul className="mt-5 list-disc space-y-2 pl-6 text-[17px] leading-8 text-slate-300 marker:text-slate-600">
      {children}
    </ul>
  ),
  ol: ({ children }: NodeProps) => (
    <ol className="mt-5 list-decimal space-y-2 pl-6 text-[17px] leading-8 text-slate-300 marker:text-slate-500">
      {children}
    </ol>
  ),
  li: ({ children }: NodeProps) => <li className="pl-1">{children}</li>,
  strong: ({ children }: NodeProps) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }: NodeProps) => (
    <em className="italic text-slate-200">{children}</em>
  ),
  blockquote: ({ children }: NodeProps) => (
    <blockquote className="mt-6 border-l-2 border-blue-500/50 bg-slate-900/40 px-5 py-3 text-slate-300">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="mt-12 border-slate-800/70" />,
  a: ({ href, children }: NodeProps & { href?: string }) => {
    const external = !!href && /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        className="text-blue-300 underline decoration-blue-300/40 underline-offset-2 transition-colors hover:text-blue-200 focus-ring rounded"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
  code: ({ children, className }: NodeProps & { className?: string }) => {
    // Fenced blocks arrive with a `language-*` class; inline code has none.
    if (className) {
      return (
        <code className="block font-mono text-[13px] leading-6 text-slate-200">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-200">
        {children}
      </code>
    );
  },
  pre: ({ children }: NodeProps) => (
    <pre className="mt-6 overflow-x-auto rounded-2xl border border-slate-800/70 bg-slate-950/70 p-5">
      {children}
    </pre>
  ),
  table: ({ children }: NodeProps) => (
    <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-800/70 ring-1 ring-white/5">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  ),
  thead: ({ children }: NodeProps) => (
    <thead className="bg-slate-900/60">{children}</thead>
  ),
  th: ({ children }: NodeProps) => (
    <th className="px-4 py-3 text-sm font-semibold text-white">{children}</th>
  ),
  td: ({ children }: NodeProps) => (
    <td className="border-t border-slate-800/60 px-4 py-3 align-top text-sm leading-6 text-slate-300">
      {children}
    </td>
  ),
};

export default function BlogMarkdown({ body }: { body: string }) {
  return (
    <div className="max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
