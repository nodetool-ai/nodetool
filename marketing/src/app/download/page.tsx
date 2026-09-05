import React from "react";
import type { Metadata } from "next";
import { ArrowRight, HardDrive, KeyRound, ShieldCheck } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import JsonLd from "@/components/JsonLd";
import DownloadPanel from "@/components/DownloadPanel";
import { breadcrumbSchema } from "@/lib/jsonld";

const BASE_URL = "https://nodetool.ai";

export const metadata: Metadata = {
  title: "Download NodeTool Studio — free for macOS, Windows and Linux",
  description:
    "Get the NodeTool Studio installer for your machine, with what it needs to run and how to open it on each system. Free and open source under AGPL-3.0.",
  alternates: { canonical: `${BASE_URL}/download` },
  openGraph: {
    title: "Download NodeTool Studio",
    description:
      "The free, open-source AI film studio for macOS, Windows and Linux.",
    url: `${BASE_URL}/download`,
    type: "website",
  },
};

const requirements = [
  {
    icon: KeyRound,
    title: "An API key, or none at all",
    body: "Open the app, import a workflow, and read every node in it before you connect anything. Running a workflow that calls a hosted model needs a key for that provider, and you pay the provider directly.",
  },
  {
    icon: HardDrive,
    title: "Room for the app, and nothing else",
    body: "The installer size is on each button above. Open-weight models are an optional extra: download them only if you want to run inference on your own machine, and allow roughly 20 GB for a starter set. Nothing downloads on its own.",
  },
  {
    icon: ShieldCheck,
    title: "No graphics card required",
    body: "A GPU only matters for local models. If you work through hosted providers, a plain laptop is enough — the rendering happens at the provider you chose.",
  },
];

const install = [
  {
    system: "macOS",
    steps: [
      "Open the .dmg and drag NodeTool to Applications.",
      "The first launch goes through Gatekeeper: right-click the app and choose Open.",
    ],
  },
  {
    system: "Windows",
    steps: [
      "Run the .exe installer and pick where it goes.",
      "SmartScreen may warn on a new release — choose More info, then Run anyway.",
    ],
  },
  {
    system: "Linux",
    steps: [
      "Mark the AppImage executable: chmod +x Nodetool-*.AppImage",
      "Run it directly, or install the Flatpak from the same release.",
    ],
  },
];

export default function DownloadPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040408] text-white">
      <SiteHeader />
      <JsonLd data={breadcrumbSchema([{ name: "Download", url: "/download" }])} />

      <div className="relative pt-28">
        <section className="relative pt-10 pb-8">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight md:text-5xl">
              Download NodeTool Studio
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
              The desktop studio, free and open source under AGPL-3.0. Your
              projects, keys, and files stay on your machine.
            </p>
            <div className="mt-8 max-w-3xl">
              <DownloadPanel />
            </div>
            <p className="mt-6 max-w-3xl text-sm text-slate-400">
              Rather not install anything?{" "}
              <a
                href="/cloud"
                className="text-blue-300 underline underline-offset-2 hover:text-blue-200"
              >
                NodeTool Cloud
              </a>{" "}
              runs the same workspace in a browser tab. It is in alpha, so
              Studio is the one to use for work you are being paid for.
            </p>
          </div>
        </section>

        <section aria-labelledby="requirements-title" className="relative py-12">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <h2
              id="requirements-title"
              className="text-2xl font-bold tracking-tight md:text-3xl"
            >
              What it needs
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {requirements.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-slate-900/40 p-6"
                >
                  <item.icon className="h-5 w-5 text-blue-300" aria-hidden />
                  <h3 className="mt-4 text-base font-semibold text-white">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="install-title" className="relative py-12">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <h2
              id="install-title"
              className="text-2xl font-bold tracking-tight md:text-3xl"
            >
              Opening it the first time
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {install.map((block) => (
                <div
                  key={block.system}
                  className="rounded-2xl border border-white/10 bg-slate-900/40 p-6"
                >
                  <h3 className="text-base font-semibold text-white">
                    {block.system}
                  </h3>
                  <ol className="mt-3 space-y-2 text-sm leading-relaxed text-slate-400">
                    {block.steps.map((step) => (
                      <li key={step} className="flex gap-2">
                        <span className="text-slate-600">·</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative py-12 pb-24">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/40 p-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Installed it. Now what?
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
                  Each recipe is a chain of workflows you import as one file,
                  with the run it produced shown on the page. Import one, read
                  it, and add a key when you want to run it.
                </p>
              </div>
              <a
                href="/recipes"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-5 py-3 text-sm font-semibold text-blue-200 transition-colors hover:border-blue-400 hover:bg-blue-500/20 focus-ring"
              >
                Browse the recipes
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
