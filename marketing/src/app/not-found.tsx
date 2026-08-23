import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-24 text-slate-100">
      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">
        NodeTool 404
      </p>
      <h1 className="text-4xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-6 text-lg leading-8 text-slate-300">
        This path does not exist. Agents can discover NodeTool from the{" "}
        <Link className="text-sky-300 underline" href="/sitemap.xml">
          sitemap
        </Link>
        ,{" "}
        <Link className="text-sky-300 underline" href="/llms.txt">
          llms.txt
        </Link>
        , or the{" "}
        <a className="text-sky-300 underline" href="https://docs.nodetool.ai/llms.txt">
          documentation index
        </a>
        .
      </p>
      <p className="mt-8 font-mono text-sm text-slate-400">
        # NodeTool resource links: /sitemap.xml · /llms.txt
      </p>
      <Link className="mt-10 w-fit text-sky-300 underline" href="/">
        Return to NodeTool
      </Link>
    </main>
  );
}
