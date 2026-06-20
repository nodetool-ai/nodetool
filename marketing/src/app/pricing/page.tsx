import type { Metadata } from "next";
import { Check, Minus, Download } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import JsonLd from "../../components/JsonLd";
import { SmartDownloadButton } from "../SmartDownloadButton";

export const metadata: Metadata = {
  title: "Pricing — free Studio, BYOK, pay providers directly | NodeTool",
  description:
    "NodeTool Studio is free and open source. NodeTool Cloud is a subscription for managed hosting. In both, you bring your own API keys and pay providers their list prices — no credits, no markup.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "NodeTool Pricing — free Studio, BYOK to every provider",
    description:
      "Studio is free and open source. Cloud is managed hosting. Both are BYOK: pay providers directly at their list prices, no credits, no markup.",
    url: "https://nodetool.ai/pricing",
    type: "website",
  },
};

const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://nodetool.ai" },
    { "@type": "ListItem", position: 2, name: "Pricing", item: "https://nodetool.ai/pricing" },
  ],
};

const offers = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "NodeTool",
  description:
    "The open creative AI workspace. Studio (desktop) is free; Cloud is a managed subscription. Both are BYOK.",
  brand: { "@type": "Brand", name: "NodeTool" },
  offers: [
    {
      "@type": "Offer",
      name: "NodeTool Studio",
      price: "0",
      priceCurrency: "USD",
      description: "Free, open-source desktop app. BYOK to every provider.",
      url: "https://nodetool.ai/studio",
    },
    {
      "@type": "Offer",
      name: "NodeTool Cloud",
      description:
        "Managed hosting subscription (currently in alpha). BYOK to every provider.",
      url: "https://nodetool.ai/cloud",
      availability: "https://schema.org/PreOrder",
    },
  ],
};

const editionRows: { label: string; studio: string | boolean; cloud: string | boolean }[] = [
  { label: "Price", studio: "Free", cloud: "Subscription (alpha)" },
  { label: "Where it runs", studio: "Your machine (macOS, Windows, Linux)", cloud: "Your browser, hosted by us" },
  { label: "Bring your own API keys", studio: true, cloud: true },
  { label: "Pay providers directly (no markup)", studio: true, cloud: true },
  { label: "Local models (Ollama, MLX, llama.cpp)", studio: true, cloud: false },
  { label: "Zero setup / no GPU needed", studio: false, cloud: true },
  { label: "Open source (AGPL-3.0)", studio: true, cloud: true },
  { label: "Self-host any time", studio: true, cloud: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true)
    return <Check className="mx-auto h-5 w-5 text-emerald-400" aria-label="Yes" />;
  if (value === false)
    return <Minus className="mx-auto h-5 w-5 text-slate-600" aria-label="No" />;
  return <span className="text-sm text-slate-300">{value}</span>;
}

export default function PricingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={breadcrumb} />
      <JsonLd data={offers} />

      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-[120px]" />
        <div className="absolute top-1/2 -right-24 h-[24rem] w-[24rem] rounded-full bg-fuchsia-500/10 blur-[120px]" />
      </div>

      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        {/* Hero */}
        <section aria-labelledby="pricing-title" className="mx-auto max-w-3xl px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
            Pricing
          </span>
          <h1
            id="pricing-title"
            className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
          >
            Free to download. You pay providers, not us.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">
            NodeTool Studio is free and open source. NodeTool Cloud is a
            subscription for managed hosting. In both editions you bring your own
            API keys and pay each provider their list price — no credits, no
            markup, no curated roster.
          </p>
        </section>

        {/* Edition cards */}
        <section aria-label="Editions" className="mx-auto mt-16 max-w-5xl px-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Studio */}
            <div className="relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 ring-1 ring-white/5 backdrop-blur-md">
              <h2 className="text-xl font-semibold text-white">NodeTool Studio</h2>
              <p className="mt-1 text-sm text-slate-400">Desktop app · local-first</p>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-white">Free</span>
                <span className="text-sm text-slate-400">forever · AGPL-3.0</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {[
                  "Runs on macOS, Windows, and Linux",
                  "Local models via Ollama, MLX, llama.cpp",
                  "BYOK to every cloud provider",
                  "Your workflows and files stay on your machine",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <SmartDownloadButton
                  icon={<Download className="h-5 w-5" />}
                  classNameOverride="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 focus-ring"
                />
              </div>
            </div>

            {/* Cloud */}
            <div className="relative flex flex-col rounded-2xl border border-slate-800/70 bg-slate-900/60 p-8 ring-1 ring-white/5 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">NodeTool Cloud</h2>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
                  Alpha
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-400">Hosted · zero setup</p>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-white">Subscription</span>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Managed hosting of the same open-source app. Pricing finalised at
                general availability.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {[
                  "Runs in your browser — no install, no GPU",
                  "BYOK to every cloud provider",
                  "Same AGPL-3.0 codebase you can self-host",
                  "Pay providers directly at provider prices",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <a
                  href="https://app.nodetool.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-3.5 text-sm font-semibold text-slate-100 transition-all hover:border-slate-500 hover:bg-slate-800/60 focus-ring"
                >
                  Try the Cloud alpha
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Edition comparison table */}
        <section aria-label="Compare editions" className="mx-auto mt-16 max-w-5xl px-6">
          <div className="overflow-hidden rounded-2xl border border-slate-800/70 ring-1 ring-white/5">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-900/60 text-sm">
                  <th className="px-5 py-4 font-medium text-slate-400">Feature</th>
                  <th className="px-5 py-4 text-center font-semibold text-white">Studio</th>
                  <th className="px-5 py-4 text-center font-semibold text-white">Cloud</th>
                </tr>
              </thead>
              <tbody>
                {editionRows.map((row, i) => (
                  <tr
                    key={row.label}
                    className={i % 2 ? "bg-slate-950/40" : "bg-slate-900/20"}
                  >
                    <td className="px-5 py-4 text-sm text-slate-300">{row.label}</td>
                    <td className="px-5 py-4 text-center"><Cell value={row.studio} /></td>
                    <td className="px-5 py-4 text-center"><Cell value={row.cloud} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* BYOK explainer */}
        <section aria-labelledby="byok-title" className="mx-auto mt-16 max-w-3xl px-6">
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-8 md:p-10">
            <h2 id="byok-title" className="text-2xl font-semibold tracking-tight text-white">
              How &ldquo;bring your own keys&rdquo; works
            </h2>
            <p className="mt-4 leading-relaxed text-slate-300">
              You add your own API keys for the providers you use — FAL, KIE,
              OpenAI, Anthropic, Gemini, Replicate, and the rest. Model calls go
              to those providers and you pay them their published list prices.
              NodeTool does not run inference on its own servers, does not issue
              proprietary credits, and does not mark up model calls. Your
              Cloud subscription pays for hosting the workspace, nothing more.
            </p>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto my-24 max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Start free, on your machine.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Download Studio and build your first workflow in minutes.
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
