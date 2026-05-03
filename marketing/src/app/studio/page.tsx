"use client";
import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  Cpu,
  Shield,
  WifiOff,
  Code2,
  HardDrive,
  Zap,
  Github,
  Download,
} from "lucide-react";
import { SmartDownloadButton } from "../SmartDownloadButton";

const ModelSupportSection = dynamic(
  () => import("../../components/ModelSupportSection"),
  { ssr: false }
);
const ModelManagerSection = dynamic(
  () => import("../../components/ModelManagerSection"),
  { ssr: false }
);
const FeaturesSection = dynamic(
  () => import("../../components/FeaturesSection"),
  { ssr: false }
);
const EditionsCompareSection = dynamic(
  () => import("../../components/EditionsCompareSection"),
  { ssr: false }
);
const CommunitySection = dynamic(
  () => import("../../components/CommunitySection"),
  { ssr: false }
);
const ContactSection = dynamic(
  () => import("../../components/ContactSection"),
  { ssr: false }
);

const navigation = [
  { name: "Home", href: "/" },
  { name: "Cloud", href: "/cloud" },
  { name: "Why Local", href: "#why-local" },
  { name: "Models", href: "#models" },
  { name: "Compare", href: "#editions" },
  { name: "Docs", href: "https://docs.nodetool.ai" },
] as const;

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

const proPoints = [
  {
    icon: WifiOff,
    title: "Works fully offline",
    body: "Once your local models are downloaded, you can disconnect the internet and keep building. Perfect for travel, secure environments, or air-gapped machines.",
  },
  {
    icon: Shield,
    title: "Your data never leaves the device",
    body: "Workflows, assets, prompts, and model outputs stay on your disk. No telemetry, no opt-out — there is no cloud round-trip unless you explicitly call a remote API.",
  },
  {
    icon: Cpu,
    title: "Run open-weight models locally",
    body: "Ollama, MLX (Apple Silicon), GGUF/GGML, HuggingFace Transformers — all wired into the same nodes. Pick any open model with zero API cost.",
  },
  {
    icon: Zap,
    title: "Use your GPU to the fullest",
    body: "NVIDIA CUDA on Windows/Linux, Metal on Apple Silicon. Image, video, and audio nodes go straight to the metal.",
  },
  {
    icon: HardDrive,
    title: "Own your model library",
    body: "Built-in Model Manager downloads, organizes, and shares model files across workflows. Curate the exact stack you want.",
  },
  {
    icon: Code2,
    title: "Custom Python and TypeScript nodes",
    body: "Drop in your own code, install Python packages in the bundled environment, or sandbox untrusted code in Docker. Studio is your full local AI lab.",
  },
];

const consPoints = [
  {
    title: "Hardware matters",
    body: "Local LLMs need RAM and ideally a GPU. We recommend 16GB+ RAM and 4GB+ VRAM for serious local-model work.",
  },
  {
    title: "You manage updates",
    body: "When a new release ships, you install it. We sign and notarize builds for macOS/Windows so updates stay easy.",
  },
  {
    title: "Disk space",
    body: "Local models are large — plan ~20GB for a small starter set, much more for video/image weights.",
  },
];

export default function StudioPage() {
  const [hash, setHash] = useState<string>("");
  const [stars, setStars] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const parallaxRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update, { passive: true } as any);
    return () => window.removeEventListener("hashchange", update as any);
  }, []);

  useEffect(() => {
    fetch("https://api.github.com/repos/nodetool-ai/nodetool")
      .then((r) => r.json())
      .then((j) => setStars(j.stargazers_count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (parallaxRef.current) {
          const yOffset = window.scrollY * 0.5;
          parallaxRef.current.style.transform = `translate3d(0, ${yOffset}px, 0)`;
        }
        ticking = false;
      });
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [reducedMotion]);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      {/* Background — warm amber/orange tones to differentiate from Cloud */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-amber-500/20 blur-3xl"
          style={{
            WebkitMaskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
            maskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
          }}
          animate={reducedMotion ? undefined : { y: [0, 10, 0] }}
          transition={
            reducedMotion
              ? undefined
              : { duration: 18, repeat: Infinity, ease: "easeInOut" }
          }
        />
        <motion.div
          className="pointer-events-none absolute -bottom-48 right-8 h-[26rem] w-[26rem] rounded-full bg-orange-500/20 blur-3xl"
          style={{
            WebkitMaskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
            maskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
          }}
          animate={reducedMotion ? undefined : { x: [0, -12, 0], y: [0, 4, 0] }}
          transition={
            reducedMotion
              ? undefined
              : { duration: 22, repeat: Infinity, ease: "easeInOut" }
          }
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(2px)" }}
        />
        <div
          ref={parallaxRef}
          aria-hidden="true"
          className="h-full w-full will-change-transform bg-grid-pattern"
          style={{ transform: "translate3d(0,0,0)" }}
        />
      </div>

      {/* Nav */}
      <header>
        <nav
          className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800/60 bg-glass supports-[backdrop-filter]:bg-glass shadow-[0_1px_0_0_rgba(245,158,11,0.08)]"
          aria-label="Primary"
        >
          <div className={`${sectionContainer} py-2 sm:py-4 lg:py-2`}>
            <div className="relative flex items-center justify-center gap-6 w-full min-h-[44px] sm:min-h-[64px]">
              <div className="absolute left-0 flex items-center h-12 sm:h-10">
                <a href="/" className="group flex items-center gap-2 rounded">
                  <Image
                    src="/logo_small.png"
                    alt="NodeTool"
                    width={48}
                    height={48}
                    priority
                    sizes="180px"
                    className="brightness-0 invert transition-all duration-300 group-hover:brightness-100 group-hover:invert-0"
                  />
                  <span className="text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-300">
                    nodetool <span className="text-sm font-normal opacity-70">/ studio</span>
                  </span>
                </a>
              </div>
              <ul className="hidden md:flex items-center gap-2 lg:gap-4 mx-auto rounded-full bg-slate-900/40 ring-1 ring-white/5 px-2 py-1 border border-slate-800/50">
                {navigation.map((item) => {
                  const active = hash === item.href;
                  return (
                    <li key={item.name} className="list-none">
                      <a
                        href={item.href}
                        className={`px-3 py-1.5 text-sm font-medium rounded-full lift ${
                          active
                            ? "bg-amber-600/25 text-amber-200 border border-amber-500/40"
                            : "text-slate-300 hover:text-amber-200 hover:bg-slate-800/60"
                        }`}
                        aria-current={active ? "page" : undefined}
                      >
                        {item.name}
                      </a>
                    </li>
                  );
                })}
              </ul>
              <div className="absolute right-0 flex items-center gap-2 h-full">
                <button
                  type="button"
                  className="md:hidden rounded-md p-2 text-slate-300 hover:bg-slate-800/60 transition-colors"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Open menu"
                >
                  <Bars3Icon className="h-6 w-6" aria-hidden="true" />
                </button>
                <a
                  href="https://github.com/nodetool-ai/nodetool"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-1 transition-colors hover:bg-amber-900/20"
                  aria-label="NodeTool on GitHub"
                >
                  <Image
                    src="/github-mark-white.svg"
                    alt=""
                    width={24}
                    height={24}
                    role="presentation"
                  />
                </a>
              </div>
            </div>
          </div>
        </nav>
        {mobileMenuOpen && (
          <div
            className="md:hidden fixed inset-0 z-50"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/90"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            />
            <div className="absolute inset-y-0 right-0 w-full overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950 px-6 py-6 sm:max-w-sm border-l border-slate-800/60">
              <div className="flex items-center justify-between">
                <a href="/" className="flex items-center gap-2">
                  <Image
                    src="/logo_small.png"
                    alt="NodeTool"
                    width={40}
                    height={40}
                    className="brightness-0 invert"
                  />
                  <span className="text-lg font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-300">
                    nodetool / studio
                  </span>
                </a>
                <button
                  type="button"
                  className="rounded-md p-2 text-slate-300 hover:bg-slate-800/60 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close menu"
                >
                  <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-6 flow-root">
                <div className="space-y-2 py-6">
                  {navigation.map((item) => (
                    <a
                      key={item.name}
                      href={item.href}
                      className="block px-3 py-3 text-base font-medium text-slate-200 hover:bg-slate-800/60 hover:text-white rounded-lg transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {item.name}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      <div
        id="content"
        className="relative isolate overflow-hidden pt-24 sm:pt-36 md:pt-24"
      >
        {/* Hero */}
        <section aria-labelledby="studio-hero-title" className="pt-2 relative">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -top-32 left-1/3 h-[28rem] w-[28rem] rounded-full bg-amber-500/15 blur-[120px]" />
            <div className="absolute -bottom-40 right-0 h-[26rem] w-[26rem] rounded-full bg-orange-500/10 blur-[120px]" />
            <div className="absolute top-1/2 -right-20 h-[20rem] w-[20rem] rounded-full bg-rose-500/10 blur-[120px]" />
          </div>
          <div className={sectionContainer}>
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12 py-12 md:py-20">
              <div className="lg:col-span-5">
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
                  <Cpu className="h-3.5 w-3.5" />
                  Studio · Desktop · Open source
                </span>
                <h1
                  id="studio-hero-title"
                  className="mt-6 text-4xl md:text-6xl font-bold tracking-tight text-white leading-[1.05]"
                >
                  Build AI workflows that
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-300">
                    run on your machine.
                  </span>
                </h1>
                <p className="mt-6 text-lg text-slate-300 leading-relaxed max-w-xl">
                  NodeTool Studio is the desktop app for builders who want their
                  models, data, and outputs to stay local. Use Ollama, MLX, and
                  GGUF models with zero per-token cost — and bring your own keys
                  for any cloud provider when you need them.
                </p>
                <div className="mt-8 flex flex-col gap-3">
                  <SmartDownloadButton
                    icon={<Download className="h-5 w-5" />}
                    classNameOverride="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-900/40 transition-all hover:bg-amber-400 hover:shadow-amber-900/60"
                  />
                  <p className="text-xs text-slate-400">
                    Free · AGPL-3.0 · macOS, Windows, Linux · No account
                    required ·{" "}
                    <a
                      href="https://github.com/nodetool-ai/nodetool/releases/latest"
                      className="underline underline-offset-2 hover:text-slate-200"
                    >
                      All downloads
                    </a>
                  </p>
                </div>
                <div className="mt-6 inline-flex items-center gap-2 text-sm text-slate-400">
                  <span>Prefer the browser?</span>
                  <a
                    href="/cloud"
                    className="text-blue-300 hover:text-blue-200 underline underline-offset-2 font-medium"
                  >
                    Try NodeTool Cloud →
                  </a>
                </div>
              </div>
              <div className="relative lg:col-span-7">
                <div
                  aria-hidden
                  className="absolute -inset-6 -z-10 rounded-[2rem] opacity-70 blur-3xl"
                  style={{
                    background:
                      "radial-gradient(60% 60% at 50% 0%, rgba(251,191,36,0.30), transparent 60%), radial-gradient(50% 60% at 100% 100%, rgba(244,114,182,0.22), transparent 60%), radial-gradient(50% 60% at 0% 100%, rgba(249,115,22,0.22), transparent 60%)",
                  }}
                />
                <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-1.5 shadow-2xl shadow-black/60 ring-1 ring-white/5 backdrop-blur">
                  <img
                    src="/screen_canvas.png"
                    alt="NodeTool Studio workflow editor"
                    className="block w-full rounded-xl"
                    loading="eager"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why Studio (Pros) */}
        <section
          id="why-local"
          aria-labelledby="why-studio-title"
          className="rhythm-section py-20 scroll-mt-24"
        >
          <div className={sectionContainer}>
            <header className="mb-12 max-w-3xl">
              <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
                <span className="h-px w-8 bg-amber-300/60" />
                Why run locally
              </div>
              <h2
                id="why-studio-title"
                className="text-3xl md:text-5xl font-bold tracking-tight text-white"
              >
                Privacy, speed, and zero per-token cost.
              </h2>
              <p className="mt-4 text-lg text-slate-400 leading-relaxed max-w-2xl">
                Everything Studio does, it can do without a network connection.
                Your prompts, your files, and your models — all on your hardware.
              </p>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px rounded-2xl overflow-hidden bg-white/5 ring-1 ring-white/5">
              {proPoints.map((p) => (
                <div
                  key={p.title}
                  className="group relative h-full flex flex-col p-7 bg-slate-950 hover:bg-slate-900/60 transition-colors"
                >
                  <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-amber-300">
                    <p.icon className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <h3 className="mb-2 text-base font-semibold tracking-tight text-white">
                    {p.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-400">
                    {p.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Honest tradeoffs */}
        <section
          aria-labelledby="studio-tradeoffs-title"
          className="rhythm-section py-20"
        >
          <div className={sectionContainer}>
            <header className="mb-10 max-w-3xl">
              <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                <span className="h-px w-8 bg-slate-500/60" />
                Honest tradeoffs
              </div>
              <h2
                id="studio-tradeoffs-title"
                className="text-3xl md:text-4xl font-bold tracking-tight text-white"
              >
                What Studio asks of you.
              </h2>
              <p className="mt-4 text-base text-slate-400 leading-relaxed max-w-2xl">
                Local-first means you take on a few things the cloud would
                otherwise handle. If any of these feel heavy,{" "}
                <a
                  href="/cloud"
                  className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                >
                  NodeTool Cloud
                </a>{" "}
                runs the same workflows in your browser.
              </p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {consPoints.map((c) => (
                <div
                  key={c.title}
                  className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-6"
                >
                  <h3 className="text-base font-semibold text-white mb-2">
                    {c.title}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {c.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Local model support */}
        <div id="models">
          <ModelSupportSection reducedMotion={reducedMotion} />
        </div>

        {/* Model manager */}
        <ModelManagerSection />

        {/* Generic features (still relevant for Studio) */}
        <FeaturesSection />

        {/* Editions compare — Studio highlighted */}
        <EditionsCompareSection
          reducedMotion={reducedMotion}
          highlight="studio"
        />

        {/* Open source reassurance */}
        <section className="rhythm-section py-16">
          <div className={sectionContainer}>
            <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800/80 bg-slate-950/60 p-8 text-center">
              <Github className="mx-auto h-8 w-8 text-slate-300 mb-4" />
              <h2 className="text-2xl md:text-3xl font-bold text-white">
                100% open source. Always.
              </h2>
              <p className="mt-4 text-slate-400 leading-relaxed">
                Studio is released under AGPL-3.0. Every node, every provider,
                every line of the runtime is on GitHub. Audit it, fork it,
                self-host it — there is no separate &ldquo;pro&rdquo; codebase.
              </p>
              <a
                href="https://github.com/nodetool-ai/nodetool"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-slate-500 hover:bg-slate-800 transition-colors"
              >
                <Github className="h-4 w-4" />
                View source on GitHub
              </a>
            </div>
          </div>
        </section>

        {/* Community */}
        <CommunitySection stars={stars} />

        <div className="mx-auto my-16 h-px max-w-6xl bg-gradient-to-r from-transparent via-amber-800/20 to-transparent" />

        <ContactSection />
      </div>

      <footer className="relative border-t border-slate-800/50 bg-slate-950 py-10">
        <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-amber-800/40 to-transparent" />
        <div className={sectionContainer}>
          <p className="text-center text-sm text-slate-500">
            <span className="text-amber-400">
              Open source today. The future is yours to build.
            </span>
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-500">
            <a href="/" className="hover:text-slate-300 transition-colors">
              Home
            </a>
            <a href="/cloud" className="hover:text-slate-300 transition-colors">
              Cloud
            </a>
            <a
              href="https://github.com/nodetool-ai/nodetool"
              className="hover:text-slate-300 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <a
              href="https://discord.gg/WmQTWZRcYE"
              className="hover:text-slate-300 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Discord
            </a>
            <a href="/privacy" className="hover:text-slate-300 transition-colors">
              Privacy
            </a>
            <a href="/terms" className="hover:text-slate-300 transition-colors">
              Terms
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
