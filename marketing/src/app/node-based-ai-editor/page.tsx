import Image from "next/image";
import { Download, Check, ArrowRight, Github, KeyRound, Layers, Cpu, Monitor } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import JsonLd from "../../components/JsonLd";
import { SmartDownloadButton } from "../SmartDownloadButton";

const GITHUB_URL = "https://github.com/nodetool-ai/nodetool";

const reasons = [
  {
    title: "Open source, AGPL-3.0",
    description:
      "The full editor is on GitHub under AGPL-3.0. No seat license, no feature paywall, no telemetry you can't see in the source.",
    icon: Github,
  },
  {
    title: "BYOK, at provider prices",
    description:
      "Connect your own OpenAI, Anthropic, Gemini, fal.ai, or Replicate key. You pay the provider's list price — NodeTool doesn't mark up a single call.",
    icon: KeyRound,
  },
  {
    title: "Image, video, audio, and text — one canvas",
    description:
      "Flux, Seedance, Kling, Veo, Suno, ElevenLabs, and every major LLM sit as nodes on the same graph. No exporting between separate tools per medium.",
    icon: Layers,
  },
  {
    title: "Local models: Ollama, MLX, llama.cpp",
    description:
      "Run a local model for a private step and a cloud model for a step that needs more compute, in the same workflow. The graph doesn't care which is which.",
    icon: Cpu,
  },
  {
    title: "Desktop and browser",
    description:
      "Studio is a free desktop app for macOS, Windows, and Linux. Cloud runs the same node graphs in a browser tab, no install.",
    icon: Monitor,
  },
];

const comparisons = [
  {
    name: "ComfyUI",
    href: "/vs/comfyui",
    blurb:
      "Diffusion-only and image/video-first, with a UI built around Stable Diffusion internals. NodeTool adds audio, text, and agents to the same canvas.",
  },
  {
    name: "Figma Weave",
    href: "/vs/figma-weave",
    blurb:
      "A closed, credit-metered SaaS canvas since the Figma acquisition. NodeTool is open source, runs on your machine, and bills through your own provider keys.",
  },
  {
    name: "Langflow",
    href: "/vs/langflow",
    blurb:
      "Built for LLM and agent pipelines, with no native image, video, or audio nodes. NodeTool covers agents and every media type in one workflow.",
  },
];

const faqs = [
  {
    q: "What is a node-based AI editor?",
    a: "A node-based AI editor represents an AI workflow as a graph instead of a script. Each node is one step — a prompt, a model call, an image edit, a piece of logic — and the connections between nodes carry data from one step to the next. You build the pipeline by wiring nodes on a canvas, and you can inspect, rerun, or swap any single step without touching the rest. It's the same idea behind node-based tools in VFX and audio (Nuke, TouchDesigner, modular synth patching), applied to AI models.",
  },
  {
    q: "Is NodeTool open source?",
    a: "Yes. NodeTool is licensed under AGPL-3.0 and developed in the open on GitHub. The desktop app is free to download and run, with no seat license or feature paywall.",
  },
  {
    q: "Can NodeTool run AI models locally?",
    a: "Yes. NodeTool runs local models through Ollama, MLX on Apple Silicon, and llama.cpp, alongside cloud providers, on the same canvas. A workflow can mix a local model for a private step with a cloud model for a step that needs more compute.",
  },
  {
    q: "How does NodeTool compare to ComfyUI, Figma Weave, and Langflow?",
    a: "ComfyUI is diffusion-only and image/video-first. Figma Weave is a closed, credit-metered SaaS canvas. Langflow targets LLM and agent pipelines without native image, video, or audio nodes. NodeTool covers image, video, audio, and text/agents on one open-source, BYOK canvas — see the detailed comparisons at /vs/comfyui, /vs/figma-weave, and /vs/langflow.",
  },
];

export default function NodeBasedAiEditorPage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden text-white bg-[#040408]">
      <JsonLd data={faqLd} />

      {/* Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[24%] -left-40 h-[520px] w-[520px] rounded-full bg-blue-600/20 blur-[140px]" />
        <div className="absolute top-[24%] -right-40 h-[480px] w-[480px] rounded-full bg-cyan-500/15 blur-[140px]" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
            backgroundSize: "120px 120px",
          }}
        />
      </div>

      <SiteHeader />

      <div className="relative pt-28">
        {/* Hero */}
        <section className="relative pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full border border-blue-500/30 bg-gradient-to-r from-blue-500/[0.08] via-cyan-500/[0.05] to-blue-500/[0.08] mb-10">
                <span className="text-sm font-medium text-white tracking-wide">
                  Node-based AI editor
                </span>
              </div>

              <h1 className="text-4xl md:text-6xl lg:text-[4.25rem] font-bold tracking-tight leading-[1.08] mb-8">
                <span className="text-white">A node-based AI editor</span>{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-400">
                  for image, video, audio, and text.
                </span>
              </h1>

              <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-3xl mx-auto leading-relaxed">
                NodeTool is an open source AI node editor: wire prompts, models,
                and logic into a node-based AI workflow you can see, rerun, and
                share. Bring your own API keys and pay providers directly — no
                credit packs, no markup.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
                <SmartDownloadButton
                  icon={<Download className="w-5 h-5" />}
                  classNameOverride="group inline-flex items-center gap-2.5 px-9 py-4 rounded-full bg-blue-500 text-white font-semibold transition-all shadow-[0_10px_30px_-10px_rgba(59,130,246,0.6)] hover:bg-blue-400 hover:shadow-[0_14px_40px_-10px_rgba(59,130,246,0.75)]"
                />
                <a
                  href="#what-is-a-node-based-ai-editor"
                  className="inline-flex items-center gap-2.5 px-9 py-4 rounded-full border border-white/15 bg-[#0a0a14]/70 backdrop-blur-sm text-white font-semibold hover:bg-white/5 hover:border-white/25 transition-all"
                >
                  What is a node-based AI editor?
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>

              <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-slate-300">
                <li className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10">
                    <Github className="w-4 h-4 text-blue-300" />
                  </span>
                  Open source, AGPL-3.0
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
                    <KeyRound className="w-4 h-4 text-cyan-300" />
                  </span>
                  BYOK, provider prices
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10">
                    <Cpu className="w-4 h-4 text-blue-300" />
                  </span>
                  Local or cloud models
                </li>
              </ul>
            </div>

            <div className="mt-16 relative">
              <div className="absolute inset-0 bg-gradient-to-t from-[#040408] via-transparent to-transparent z-10 pointer-events-none" />
              <div className="relative rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl shadow-blue-500/10 max-w-5xl mx-auto">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/80">
                  <div className="w-3 h-3 rounded-full bg-rose-500/50" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
                  <span className="ml-4 text-xs text-slate-400 font-medium">
                    Node-based AI editor
                  </span>
                </div>
                <Image
                  src="/connect-nodes.png"
                  alt="Nodes wired together on NodeTool's canvas, passing data from a prompt through a model node to an output"
                  width={1418}
                  height={1114}
                  className="w-full h-auto"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* What is a node-based AI editor? */}
        <section id="what-is-a-node-based-ai-editor" className="scroll-mt-28 py-16 relative">
          <div className="mx-auto max-w-4xl px-6 lg:px-8">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 tracking-tight">
              What is a node-based AI editor?
            </h2>
            <p className="text-lg text-slate-400 leading-relaxed mb-4">
              A node-based AI editor represents an AI workflow as a graph
              instead of a script. Each node is one step — a prompt, a model
              call, an image edit, a piece of logic — and the connections
              between nodes carry data from one step to the next. You build
              the pipeline by wiring nodes on a canvas, not by writing glue
              code, and you can inspect, rerun, or swap any single step without
              touching the rest.
            </p>
            <p className="text-lg text-slate-400 leading-relaxed">
              It&rsquo;s the same idea behind node-based tools in VFX and audio —
              Nuke&rsquo;s compositing graphs, TouchDesigner&rsquo;s operators, modular
              synth patching — applied to AI models. A node-based AI workflow
              in NodeTool can start with a text prompt, run it through an
              agent, generate an image, upscale it, and hand the result to a
              video model, all as one graph you can see end to end.
            </p>
          </div>
        </section>

        {/* Why NodeTool */}
        <section className="py-20 relative">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="text-center mb-16 max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                Why NodeTool is the{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                  node-based AI editor
                </span>{" "}
                to build on
              </h2>
              <p className="text-lg text-slate-400 leading-relaxed">
                Most node-based AI tools pick one lane: diffusion models, or
                LLM pipelines, or a closed SaaS canvas. NodeTool is the one
                that&rsquo;s open source, covers every media type, and runs the same
                graph on your own machine or in a browser.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {reasons.map((reason) => (
                <div
                  key={reason.title}
                  className="rounded-2xl border border-white/10 bg-[#0a0a14]/70 backdrop-blur-sm p-8"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6">
                    <reason.icon className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-3">
                    {reason.title}
                  </h3>
                  <p className="text-slate-400 leading-relaxed text-[0.95rem]">
                    {reason.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparisons */}
        <section className="py-20 relative">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="text-center mb-12 max-w-2xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                How it compares
              </h2>
              <p className="text-lg text-slate-400 leading-relaxed">
                Three tools people put in the same bucket as NodeTool — and
                where each one actually differs.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {comparisons.map((c) => (
                <a
                  key={c.name}
                  href={c.href}
                  className="group flex flex-col rounded-2xl border border-white/10 bg-[#0a0a14]/70 backdrop-blur-sm p-6 hover:border-white/25 hover:bg-white/5 transition-all"
                >
                  <h3 className="text-base font-semibold text-white mb-2">
                    NodeTool vs {c.name}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed mb-4">
                    {c.blurb}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-blue-300 group-hover:text-blue-200">
                    Compare in detail
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 relative">
          <div className="mx-auto max-w-3xl px-6 lg:px-8">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-10 tracking-tight text-center">
              Frequently asked questions
            </h2>
            <div className="space-y-4">
              {faqs.map((f) => (
                <div
                  key={f.q}
                  className="rounded-2xl border border-white/10 bg-[#0a0a14]/70 backdrop-blur-sm p-6"
                >
                  <h3 className="text-base font-semibold text-white mb-2">
                    {f.q}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-400">
                    {f.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 relative">
          <div className="mx-auto max-w-4xl px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Open source. Every model. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400">
                One canvas.
              </span>
            </h2>
            <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
              Download NodeTool, plug in the providers you already pay for,
              and build your first node-based AI workflow.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <SmartDownloadButton
                icon={<Download className="w-6 h-6" />}
                classNameOverride="group inline-flex items-center gap-2 px-10 py-5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 text-white text-lg font-semibold hover:from-blue-400 hover:to-cyan-500 transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
              />
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-10 py-5 rounded-xl border border-white/15 bg-[#0a0a14]/70 backdrop-blur-sm text-white text-lg font-semibold hover:bg-white/5 hover:border-white/25 transition-all"
              >
                <Check className="w-5 h-5 text-emerald-400" />
                Star on GitHub
              </a>
            </div>
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
