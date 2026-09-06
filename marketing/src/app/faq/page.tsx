import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import FaqBlock from "@/components/FaqBlock";
import { breadcrumbSchema, faqPageSchema } from "@/lib/jsonld";
import { faqByCategory, faqEntries } from "@/data/faqEntries";

export const metadata: Metadata = {
  title: "NodeTool FAQ — the open creative AI workspace",
  description:
    "Answers about NodeTool: how pricing with your own API keys works, Studio compared with Cloud, which models are supported, how it compares with other tools, and a short glossary of common terms.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "NodeTool FAQ",
    description:
      "Pricing with your own keys, Studio compared with Cloud, supported models, comparisons, and a short glossary.",
    url: "https://nodetool.ai/faq",
    type: "website",
  },
};

const breadcrumb = breadcrumbSchema([{ name: "FAQ", url: "/faq" }]);

// FAQPage for the hub: every row here is rendered below, answer and all.
const faqPage = faqPageSchema(
  faqEntries.map((e) => ({
    question: e.question,
    answer: e.answerMd,
    url: e.route,
  }))
);

/** Mirrors the "Studio or Cloud" answer, in the shape answer engines quote. */
const editionRows: { label: string; studio: string; cloud: string }[] = [
  { label: "Price", studio: "Free, open source", cloud: "Subscription (alpha)" },
  { label: "Where it runs", studio: "Your machine", cloud: "Your browser" },
  { label: "Local models", studio: "MLX, Ollama, llama.cpp", cloud: "Cloud providers" },
  { label: "Your own API keys", studio: "Yes", cloud: "Yes" },
  { label: "Setup", studio: "Download and install", cloud: "Nothing to install" },
];

export default function FaqHubPage() {
  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={breadcrumb} />
      <JsonLd data={faqPage} />

      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-[120px]" />
        <div className="absolute top-1/2 -right-24 h-[24rem] w-[24rem] rounded-full bg-fuchsia-500/10 blur-[120px]" />
      </div>

      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        <section className="mx-auto max-w-3xl px-6 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
            Frequently asked questions
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            NodeTool is the open-source creative AI workspace: one
            canvas for image, video, audio, and text, where every editor is a
            tool an agent can drive. You bring your own API keys and pay each
            provider directly. Studio runs on your machine; Cloud runs the same
            code in the browser.
          </p>
        </section>

        {/* Studio vs Cloud, at a glance */}
        <section
          aria-labelledby="editions-title"
          className="mx-auto mt-14 max-w-3xl px-6"
        >
          <h2
            id="editions-title"
            className="text-2xl font-semibold tracking-tight text-white"
          >
            Studio or Cloud, at a glance
          </h2>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-800/70">
            <table className="w-full min-w-[32rem] border-collapse text-left">
              <thead>
                <tr className="bg-slate-900/60 text-sm">
                  <th scope="col" className="px-5 py-3 font-medium text-slate-400">
                    &nbsp;
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold text-white">
                    Studio
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold text-white">
                    Cloud
                  </th>
                </tr>
              </thead>
              <tbody>
                {editionRows.map((row, i) => (
                  <tr
                    key={row.label}
                    className={i % 2 ? "bg-slate-950/40" : "bg-slate-900/20"}
                  >
                    <th
                      scope="row"
                      className="px-5 py-3 text-sm font-medium text-slate-300"
                    >
                      {row.label}
                    </th>
                    <td className="px-5 py-3 text-sm text-slate-300">{row.studio}</td>
                    <td className="px-5 py-3 text-sm text-slate-300">{row.cloud}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-16 space-y-14 pb-8">
          {faqByCategory.map((group) => (
            <FaqBlock
              key={group.category}
              items={group.items}
              heading={group.label}
              linkToStandalone
            />
          ))}
        </div>

        <section className="mx-auto my-20 max-w-2xl px-6 text-center">
          <p className="text-lg text-slate-300">
            Still curious? Explore{" "}
            <Link href="/ideas" className="text-blue-300 hover:text-blue-200">
              workflow ideas
            </Link>{" "}
            or read the{" "}
            <a
              href="https://docs.nodetool.ai"
              className="text-blue-300 hover:text-blue-200"
            >
              documentation
            </a>
            .
          </p>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
