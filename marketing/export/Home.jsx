import React from "react";
import {
  Download,
  Play,
  Code2,
  KeyRound,
  Layers,
  Boxes,
  Workflow,
  Rocket,
  Github,
  Image as ImageIcon,
  Video,
  AudioLines,
  MessageSquare,
} from "lucide-react";

// NodeTool — Home page. Single-file export for Claude Design.
// Design system: "The Midnight Studio" — near-black slate canvas, glass surfaces,
// blue action color, fuchsia/amber as atmospheric light. Self-contained: no
// external assets, no Next.js. Tailwind + lucide-react only.

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020617] font-sans text-white antialiased">
      <AmbientGlows />
      <Header />
      <main className="relative z-10 mx-auto max-w-6xl px-6">
        <Hero />
        <ProviderStrip />
        <BuildRunDeploy />
        <Features />
        <CommunityCTA />
      </main>
      <Footer />
    </div>
  );
}

/* ---------------------------------------------------------------- atmosphere */

function AmbientGlows() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -top-40 left-1/4 h-[32rem] w-[32rem] rounded-full bg-blue-500/15 blur-[140px]" />
      <div className="absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/10 blur-[140px]" />
      <div className="absolute bottom-0 left-0 h-[26rem] w-[26rem] rounded-full bg-amber-500/10 blur-[140px]" />
    </div>
  );
}

/* -------------------------------------------------------------------- header */

const NAV = ["Studio", "Cloud", "Agents", "Developers", "Features", "Docs"];

function Header() {
  return (
    <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
      <a href="#" className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 shadow-[0_8px_24px_-8px_rgba(30,58,138,0.7)]">
          <Boxes className="h-5 w-5 text-white" />
        </span>
        <span className="text-lg font-bold tracking-tight">NodeTool</span>
      </a>

      <nav className="hidden items-center gap-7 md:flex">
        {NAV.map((item) => (
          <a
            key={item}
            href="#"
            className="rounded text-[0.95rem] font-medium text-slate-200 transition-colors hover:text-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400"
          >
            {item}
          </a>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <a
          href="#"
          aria-label="GitHub"
          className="rounded-lg p-2 text-slate-400 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
        >
          <Github className="h-5 w-5" />
        </a>
        <a
          href="#"
          className="hidden rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(30,58,138,0.5)] transition-all hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 sm:inline-block"
        >
          Download
        </a>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------------- hero */

function Hero() {
  return (
    <section className="grid grid-cols-1 items-center gap-12 py-16 lg:grid-cols-12 lg:py-24">
      <div className="lg:col-span-5">
        <Badge />
        <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
          The open creative
          <br />
          <span className="bg-gradient-to-r from-rose-400 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
            AI workspace.
          </span>
        </h1>
        <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-slate-400 md:text-lg">
          One canvas. Every major model from every major provider, called with
          your own keys. Pay providers what they charge: no credits, no markup,
          no curated roster. When the next model ships, swap one node and
          you&apos;re on it the same day.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <PrimaryButton icon={<Download className="h-5 w-5" />}>Download free</PrimaryButton>
          <GhostButton icon={<Play className="h-4 w-4" />}>See it in action</GhostButton>
        </div>

        <ul className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-400">
          <Bullet icon={<Layers className="h-3.5 w-3.5 text-fuchsia-400" />}>Every model. Your keys.</Bullet>
          <Dot />
          <Bullet icon={<KeyRound className="h-3.5 w-3.5 text-emerald-400" />}>Pay providers directly</Bullet>
          <Dot />
          <Bullet icon={<Code2 className="h-3.5 w-3.5 text-blue-400" />}>Open source, runs anywhere</Bullet>
        </ul>
      </div>

      <div className="lg:col-span-7">
        <CanvasMock />
      </div>
    </section>
  );
}

function Badge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
      Open Source
      <span className="text-blue-500/60">•</span>
      BYOK
    </span>
  );
}

function Bullet({ icon, children }) {
  return <li className="flex items-center gap-1.5">{icon}{children}</li>;
}
function Dot() {
  return <li className="text-slate-700">•</li>;
}

/* The signature "glow-backed hero media" — drawn as a live node graph so the
   export stays self-contained (no screenshot files). */
function CanvasMock() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-[2rem] opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(168,85,247,0.35), transparent 60%), radial-gradient(50% 60% at 100% 100%, rgba(244,114,182,0.25), transparent 60%), radial-gradient(50% 60% at 0% 100%, rgba(59,130,246,0.3), transparent 60%)",
        }}
      />
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-2 shadow-[0_30px_90px_-32px_rgba(0,0,0,0.7)] ring-1 ring-white/5 backdrop-blur">
        <div className="rounded-xl border border-slate-800/80 bg-[#0b1120] p-5">
          <div className="mb-4 flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
            <span className="ml-3 font-mono text-[11px] text-slate-500">untitled-workflow.canvas</span>
          </div>

          <div className="relative h-[19rem]">
            {/* connectors */}
            <svg className="absolute inset-0 h-full w-full" aria-hidden>
              <defs>
                <linearGradient id="wire" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#e879f9" />
                </linearGradient>
              </defs>
              <path d="M150 78 C 230 78, 230 150, 310 150" fill="none" stroke="url(#wire)" strokeWidth="2" />
              <path d="M150 232 C 230 232, 230 150, 310 150" fill="none" stroke="url(#wire)" strokeWidth="2" />
              <path d="M452 150 C 510 150, 510 150, 560 150" fill="none" stroke="url(#wire)" strokeWidth="2" />
            </svg>

            <Node className="left-0 top-12" tint="text-blue-400" icon={<MessageSquare className="h-4 w-4" />} title="Prompt" sub="text input" />
            <Node className="left-0 top-44" tint="text-emerald-400" icon={<ImageIcon className="h-4 w-4" />} title="Reference" sub="image" />
            <Node className="left-[19.5rem] top-28" tint="text-fuchsia-400" icon={<Workflow className="h-4 w-4" />} title="FLUX.1" sub="image model" running />
            <Node className="right-0 top-28" tint="text-amber-300" icon={<Video className="h-4 w-4" />} title="Output" sub="video" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Node({ className = "", icon, title, sub, tint, running }) {
  return (
    <div
      className={`absolute w-[8.5rem] rounded-xl border border-slate-700/70 bg-slate-900/90 p-3 shadow-[0_12px_30px_-16px_rgba(0,0,0,0.8)] ring-1 ring-white/5 backdrop-blur ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className={tint}>{icon}</span>
        <span className="text-[13px] font-semibold text-white">{title}</span>
      </div>
      <p className="mt-1 font-mono text-[10px] text-slate-500">{sub}</p>
      {running && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-blue-500 to-fuchsia-500" />
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- provider strip */

const PROVIDERS = ["OpenAI", "Anthropic", "Gemini", "Mistral", "Ollama", "FLUX", "Replicate", "Groq"];

function ProviderStrip() {
  return (
    <section className="border-y border-slate-800/50 py-8">
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Every provider, called with your keys
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
        {PROVIDERS.map((p) => (
          <span key={p} className="text-sm font-medium text-slate-400">{p}</span>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------- build / run / deploy */

const STEPS = [
  { icon: <Workflow className="h-5 w-5" />, title: "Build", body: "Wire models together on an infinite canvas. Image, video, audio, text, agents, all as nodes." },
  { icon: <Play className="h-5 w-5" />, title: "Run", body: "Execute locally or in the cloud. Stream results back into the graph as they generate." },
  { icon: <Rocket className="h-5 w-5" />, title: "Deploy", body: "Ship any workflow as an API or app. Self-host it, or run it anywhere you like." },
];

function BuildRunDeploy() {
  return (
    <section className="py-20">
      <SectionHead eyebrow="Workflow" title="Build it, run it, ship it." />
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <article key={s.title} className="group relative">
            <div className="flex h-full flex-col rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6 shadow-[0_20px_60px_-28px_rgba(2,6,23,0.7)] ring-1 ring-white/5 backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-500/50">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
                  {s.icon}
                </span>
                <span className="font-mono text-xs text-slate-600">0{i + 1}</span>
              </div>
              <h3 className="mt-5 text-xl font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{s.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ features */

function Features() {
  return (
    <section className="py-20">
      <SectionHead eyebrow="Why NodeTool" title="Your models. Your keys. Your canvas." />
      <div className="mt-12 grid gap-5 lg:grid-cols-6">
        {/* wide feature */}
        <article className="lg:col-span-4 rounded-2xl border border-slate-800/60 bg-slate-900/60 p-8 shadow-[0_20px_60px_-28px_rgba(2,6,23,0.7)] ring-1 ring-white/5 backdrop-blur-md">
          <KeyRound className="h-6 w-6 text-emerald-400" />
          <h3 className="mt-4 text-2xl font-semibold text-white">No credits. No markup. No roster.</h3>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-slate-400">
            Bring your own API keys and pay each provider exactly what they
            charge. NodeTool never sits between you and the model, so there is
            nothing to mark up and no curated list deciding what you can use.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: <ImageIcon className="h-4 w-4" />, label: "Image" },
              { icon: <Video className="h-4 w-4" />, label: "Video" },
              { icon: <AudioLines className="h-4 w-4" />, label: "Audio" },
              { icon: <MessageSquare className="h-4 w-4" />, label: "Text" },
            ].map((m) => (
              <div key={m.label} className="flex items-center gap-2 rounded-lg border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-300">
                <span className="text-blue-400">{m.icon}</span>
                {m.label}
              </div>
            ))}
          </div>
        </article>

        {/* tall feature */}
        <article className="lg:col-span-2 flex flex-col justify-between rounded-2xl border border-slate-800/60 bg-slate-900/60 p-8 shadow-[0_20px_60px_-28px_rgba(2,6,23,0.7)] ring-1 ring-white/5 backdrop-blur-md">
          <div>
            <Code2 className="h-6 w-6 text-blue-400" />
            <h3 className="mt-4 text-2xl font-semibold text-white">Open source, runs anywhere</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-400">
              Local-first or self-hosted. Your workflows and your data stay
              yours.
            </p>
          </div>
          <div className="mt-6 rounded-xl border border-slate-800/70 bg-slate-950/60 p-4 font-mono text-[12px] leading-relaxed text-slate-400">
            <span className="text-slate-600">$</span> <span className="text-emerald-400">npx</span> nodetool start
            <br />
            <span className="text-slate-600"># canvas live at :3000</span>
          </div>
        </article>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- community cta */

function CommunityCTA() {
  return (
    <section className="py-20">
      <div className="relative overflow-hidden rounded-3xl border border-slate-800/60 bg-slate-900/60 px-8 py-16 text-center ring-1 ring-white/5 backdrop-blur-md">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-80 blur-2xl"
          style={{
            background:
              "radial-gradient(40% 60% at 50% 0%, rgba(59,130,246,0.3), transparent 70%), radial-gradient(40% 60% at 80% 100%, rgba(232,121,249,0.22), transparent 70%)",
          }}
        />
        <h2 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight md:text-5xl">
          Start building on your own terms.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[1.0625rem] text-slate-400">
          Free and open source. Download it, wire your first workflow in minutes,
          and keep every key, every output, and every dollar.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryButton icon={<Download className="h-5 w-5" />}>Download free</PrimaryButton>
          <GhostButton icon={<Github className="h-4 w-4" />}>Star on GitHub</GhostButton>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- footer */

function Footer() {
  return (
    <footer className="relative z-10 mt-10 border-t border-slate-800/50 bg-slate-950/80">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600">
            <Boxes className="h-4 w-4 text-white" />
          </span>
          <span className="font-semibold">NodeTool</span>
        </div>
        <p className="text-sm text-slate-500">Open source · BYOK · Runs anywhere</p>
        <div className="flex items-center gap-5 text-sm text-slate-400">
          <a href="#" className="transition-colors hover:text-white">Docs</a>
          <a href="#" className="transition-colors hover:text-white">GitHub</a>
          <a href="#" className="transition-colors hover:text-white">Community</a>
        </div>
      </div>
    </footer>
  );
}

/* --------------------------------------------------------- shared primitives */

function SectionHead({ eyebrow, title }) {
  return (
    <div className="max-w-2xl">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">{eyebrow}</span>
      <h2 className="mt-3 text-4xl font-normal leading-tight tracking-tight text-white md:text-5xl">{title}</h2>
    </div>
  );
}

function PrimaryButton({ icon, children }) {
  return (
    <a
      href="#"
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(30,58,138,0.5)] transition-all hover:bg-blue-500 hover:shadow-[0_12px_36px_-10px_rgba(30,58,138,0.7)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
    >
      {icon}
      {children}
    </a>
  );
}

function GhostButton({ icon, children }) {
  return (
    <a
      href="#"
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-3.5 text-sm font-semibold text-slate-100 backdrop-blur transition-all hover:border-slate-500 hover:bg-slate-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
    >
      {icon}
      {children}
    </a>
  );
}
