import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import FaqBlock from "@/components/FaqBlock";
import { faqByCategory, faqEntries } from "@/data/faqEntries";

export const metadata: Metadata = {
  title: "NodeTool FAQ — the open creative AI workspace",
  description:
    "Answers about NodeTool: BYOK pricing, Studio vs Cloud, supported models, how it compares to other tools, and a short glossary of terms like BYOK, RAG, and diffusion models.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "NodeTool FAQ",
    description:
      "BYOK pricing, Studio vs Cloud, supported models, comparisons, and a short glossary.",
    url: "https://nodetool.ai/faq",
    type: "website",
  },
};

const BASE_URL = "https://nodetool.ai";

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
    { "@type": "ListItem", position: 2, name: "FAQ", item: `${BASE_URL}/faq` },
  ],
};

// FAQPage structured data for the hub — the full set of questions and answers.
const faqPage = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqEntries.map((e) => ({
    "@type": "Question",
    name: e.question,
    url: `${BASE_URL}${e.route}`,
    acceptedAnswer: { "@type": "Answer", text: e.description },
  })),
};

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
            What NodeTool is, how BYOK pricing works, Studio vs Cloud, which
            models run, and a short glossary of the terms.
          </p>
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
