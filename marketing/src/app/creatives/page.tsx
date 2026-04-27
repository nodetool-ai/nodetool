"use client";
import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  Sparkles,
  Play,
  Palette,
  Video,
  Music,
  Camera,
  Layers,
  Wand2,
  ArrowRight,
  Check,
  Github,
  MessageCircle,
  Star,
  Download,
  Zap,
  Shield,
  Command,
  Monitor,
} from "lucide-react";
import { XMarkIcon, Bars3Icon } from "@heroicons/react/24/outline";


type PersonaAccent = "rose" | "emerald" | "sky" | "amber";

const personaAccentMap: Record<
  PersonaAccent,
  {
    text: string;
    border: string;
    iconBg: string;
    glowRgba: string;
    topGlow: string;
  }
> = {
  rose: {
    text: "text-rose-300",
    border: "border-rose-500/40",
    iconBg: "bg-rose-500/10",
    glowRgba: "244, 63, 94",
    topGlow: "rgba(244, 63, 94, 0.18)",
  },
  emerald: {
    text: "text-emerald-300",
    border: "border-emerald-500/40",
    iconBg: "bg-emerald-500/10",
    glowRgba: "16, 185, 129",
    topGlow: "rgba(16, 185, 129, 0.18)",
  },
  sky: {
    text: "text-sky-300",
    border: "border-sky-500/40",
    iconBg: "bg-sky-500/10",
    glowRgba: "56, 189, 248",
    topGlow: "rgba(56, 189, 248, 0.18)",
  },
  amber: {
    text: "text-amber-300",
    border: "border-amber-500/40",
    iconBg: "bg-amber-500/10",
    glowRgba: "245, 158, 11",
    topGlow: "rgba(245, 158, 11, 0.18)",
  },
};

const creativePersonas: Array<{
  title: string;
  description: string;
  icon: typeof Video;
  accent: PersonaAccent;
}> = [
  {
    title: "Video Creators",
    description:
      "Automate editing workflows, generate B-roll, and create consistent visual styles across your content.",
    icon: Video,
    accent: "rose",
  },
  {
    title: "Graphic Designers",
    description:
      "Access Flux, Ideogram, and gpt-image-1.5. Generate variations and maintain brand consistency with world-class image models.",
    icon: Palette,
    accent: "emerald",
  },
  {
    title: "Music Producers",
    description:
      "Compose with Suno, generate speech with ElevenLabs, and experiment with audio processing in your pipeline.",
    icon: Music,
    accent: "sky",
  },
  {
    title: "Photographers",
    description:
      "Batch process images, upscale photos, and apply consistent edits across your entire catalog.",
    icon: Camera,
    accent: "amber",
  },
];

// Features for creative professionals
const creativeFeatures = [
  {
    title: "Visual Workflow Canvas",
    description:
      "Build complex creative pipelines by connecting nodes. See your entire process at a glance and iterate faster.",
    icon: Layers,
    image: "/screen_canvas.png",
    features: [
      "Infinite canvas",
      "Real-time execution graph",
      "Custom sub-graphs",
    ],
  },
  {
    title: "Image Generation",
    description:
      "Run Flux, Qwen-Image, Nano-Banana or Z-Image. Generate, upscale, and transform images with professional-grade command.",
    icon: Wand2,
    image: "/disaster_girl.mp4",
    features: ["GPU acceleration", "Multi-model support", "Batch processing"],
  },
  {
    title: "Video Processing",
    description:
      "Create with cinematic video models like Seedance 2.0, Kling 3.0, Veo, Runway and Sora 2. Edit and build automated video pipelines.",
    icon: Video,
    image: "/sora.mp4",
    features: [
      "Frame-accurate editing",
      "Temporal smoothing",
      "Format transcoding",
    ],
  },
  {
    title: "Audio Integration",
    description:
      "Compose music with Suno, generate voice with ElevenLabs, and integrate audio seamlessly into workflows.",
    icon: Music,
    image: "/suno.png",
    features: ["Stem separation", "Music generation", "Voice generation"],
  },
];

// Workflow examples
const workflowExamples = [
  {
    title: "Brand Asset Generator",
    description:
      "Generate consistent brand visuals, social media posts, and marketing materials with a single workflow.",
    tags: ["Image Generation", "Branding", "Automation"],
    gradient: "from-pink-500/20 to-rose-500/20",
  },
  {
    title: "Video Thumbnail Pipeline",
    description:
      "Automatically create eye-catching thumbnails for your videos using AI-powered image generation.",
    tags: ["Video", "Thumbnails", "YouTube"],
    gradient: "from-teal-500/20 to-purple-500/20",
  },
  {
    title: "Audio to Visual Sync",
    description:
      "Create reactive visuals that respond to audio input, perfect for music videos and visualizers.",
    tags: ["Audio", "Visual", "Sync"],
    gradient: "from-cyan-500/20 to-blue-500/20",
  },
  {
    title: "Photo Enhancement Suite",
    description:
      "Batch process photos with upscaling, color correction, and style transfer in one automated flow.",
    tags: ["Photography", "Enhancement", "Batch"],
    gradient: "from-amber-500/20 to-orange-500/20",
  },
];

const navigation = [
  { name: "Home", href: "/" },
  { name: "Features", href: "#features" },
  { name: "Workflows", href: "#workflows" },
  { name: "Community", href: "#community" },
  { name: "Docs", href: "https://docs.nodetool.ai" },
];

export default function CreativesPage() {
  const [stars, setStars] = useState<number | null>(null);
  const [hash, setHash] = useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Avoid background scroll while the mobile menu is open.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    fetch("https://api.github.com/repos/nodetool-ai/nodetool")
      .then((r) => r.json())
      .then((j) => setStars(j.stargazers_count))
      .catch(() => { });
  }, []);

  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update, { passive: true });
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden text-white bg-[#040408]">
      {/* Background — left rose flare + right cyan flare, faint star field */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute top-[28%] -left-40 h-[520px] w-[520px] rounded-full bg-rose-600/25 blur-[140px]"
          animate={{ opacity: [0.55, 0.85, 0.55] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-[20%] -right-40 h-[480px] w-[480px] rounded-full bg-cyan-500/20 blur-[140px]"
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
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

      {/* Navigation — floating pill */}
      <header>
        <nav
          className="fixed top-4 left-0 right-0 z-50"
          aria-label="Primary"
        >
          <div className="mx-auto max-w-6xl px-4 lg:px-6">
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center justify-between gap-4 rounded-full border border-white/10 bg-[#0a0a14]/85 backdrop-blur-xl px-3 sm:px-5 py-2.5 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)]">
                <Link href="/" className="flex items-center gap-2 group pl-1">
                  <Image
                    src="/logo_small.png"
                    alt="NodeTool"
                    width={32}
                    height={32}
                    className="brightness-0 invert"
                  />
                  <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-amber-400 to-cyan-400">
                    nodetool
                  </span>
                </Link>

                <ul className="hidden md:flex items-center gap-1">
                  {navigation.map((item) => {
                    const active = hash === item.href;
                    return (
                      <li key={item.name}>
                        <a
                          href={item.href}
                          className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all ${
                            active
                              ? "text-white"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          {item.name}
                        </a>
                      </li>
                    );
                  })}
                </ul>

                <button
                  type="button"
                  className="md:hidden rounded-md p-1.5 text-slate-300 hover:bg-white/5 transition-colors"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Open menu"
                >
                  <Bars3Icon className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <a
                href="https://github.com/nodetool-ai/nodetool"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#0a0a14]/85 backdrop-blur-xl hover:bg-white/5 transition-colors"
                aria-label="NodeTool on GitHub"
              >
                <Image
                  src="/github-mark-white.svg"
                  alt=""
                  width={20}
                  height={20}
                />
              </a>
            </div>
          </div>
        </nav>
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
            <button
              type="button"
              className="absolute inset-0 bg-[#050510]/95"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            />
            <div className="absolute inset-y-0 right-0 w-full overflow-y-auto bg-[#050510] px-6 py-6 sm:max-w-sm border-l border-white/10">
              <div className="flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                  <Image
                    src="/logo_small.png"
                    alt="NodeTool"
                    width={40}
                    height={40}
                    className="brightness-0 invert"
                  />
                  <span className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-amber-400 to-cyan-400">
                    nodetool
                  </span>
                </Link>
                <button
                  type="button"
                  className="rounded-md p-2 text-slate-300 hover:bg-white/5 transition-colors"
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
                      className="block px-3 py-3 text-base font-medium text-slate-200 hover:bg-white/5 hover:text-white rounded-lg transition-colors"
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

      <div className="relative pt-28">
        {/* Hero Section */}
        <section className="relative pt-16 pb-24 lg:pt-24 lg:pb-32 overflow-hidden">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-5xl text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="relative inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full border border-rose-500/30 bg-gradient-to-r from-rose-500/[0.08] via-amber-500/[0.05] to-cyan-500/[0.08] mb-10 shadow-[0_0_40px_-10px_rgba(244,63,94,0.35)]">
                  <Sparkles className="w-4 h-4 text-rose-400" />
                  <span className="text-sm font-medium text-white tracking-wide">
                    Built for Creative Professionals
                  </span>
                </div>

                <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.05] mb-10">
                  <span className="text-white">Your Creative Vision.</span>
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-amber-300 via-emerald-300 to-cyan-400">
                    Next-Gen Image, Music &amp; Video.
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed">
                  Build powerful creative pipelines with drag-and-drop simplicity.
                  Access all top-tier models for image, music, and video generation:
                  Seedance 2.0, Kling 3.0, Runway, Luma, Suno, Flux, and more.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
                  <a
                    href="https://github.com/nodetool-ai/nodetool/releases"
                    className="group relative inline-flex items-center gap-2.5 px-9 py-4 rounded-full bg-rose-500 text-white font-semibold transition-all shadow-[0_10px_30px_-10px_rgba(244,63,94,0.6)] hover:bg-rose-400 hover:shadow-[0_14px_40px_-10px_rgba(244,63,94,0.75)]"
                  >
                    <Download className="w-5 h-5" />
                    Download
                  </a>
                  <a
                    href="#features"
                    className="inline-flex items-center gap-2.5 px-9 py-4 rounded-full border border-white/15 bg-[#0a0a14]/70 backdrop-blur-sm text-white font-semibold hover:bg-white/5 hover:border-white/25 transition-all"
                  >
                    <Play className="w-5 h-5" />
                    See How It Works
                  </a>
                </div>

                <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-slate-300">
                  <li className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
                      <Command className="w-4 h-4 text-amber-300" />
                    </span>
                    Open Source
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                      <Shield className="w-4 h-4 text-emerald-300" />
                    </span>
                    Privacy-First
                  </li>
                  <li className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
                      <Monitor className="w-4 h-4 text-cyan-300" />
                    </span>
                    macOS &middot; Windows &middot; Linux
                  </li>
                </ul>
              </motion.div>
            </div>

            {/* Hero Visual */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="mt-20 relative"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-[#050510] via-transparent to-transparent z-10 pointer-events-none" />
              <div className="relative rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl overflow-hidden shadow-2xl shadow-rose-500/10">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/80">
                  <div className="w-3 h-3 rounded-full bg-rose-500/50" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
                  <span className="ml-4 text-xs text-slate-500 font-medium">
                    Creative Workflow Canvas
                  </span>
                </div>
                <video
                  src="/demo.mp4"
                  className="w-full"
                  controls
                  playsInline
                />
              </div>
            </motion.div>
          </div>
        </section>

        {/* Real Workflow Example */}
        <section className="py-20 relative">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12 max-w-3xl mx-auto"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-300/80 mb-3">
                A real workflow
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
                One product shot. Two scenes. A finished video.
              </h2>
              <p className="text-lg text-slate-400 leading-relaxed">
                A reference image and two prompts feed Nano Banana Edit, then Veo 3.1 turns
                the edits into a split-screen ad. Every step lives on the canvas, so you
                can swap models, tweak prompts, and re-run instantly.
              </p>
            </motion.div>

            <motion.figure
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <div className="relative rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur overflow-hidden shadow-2xl shadow-rose-500/10">
                <Image
                  src="/creatives_workflow.png"
                  alt="NodeTool canvas: a sneaker reference image plus two text prompts feeding two Nano Banana Edit nodes, then a Veo 3.1 Image-to-Video node producing a split-screen ad video"
                  width={1672}
                  height={941}
                  className="w-full h-auto"
                  priority
                />
              </div>
            </motion.figure>
          </div>
        </section>

        {/* Creative Personas Section */}
        <section className="py-24 relative">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6">
                Built for{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-amber-300 via-emerald-300 to-cyan-400">
                  Every Creator
                </span>
              </h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Whether you&apos;re editing videos, designing graphics, producing music,
                or processing photos, NodeTool adapts to your creative workflow.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-7">
              {creativePersonas.map((persona, index) => {
                const a = personaAccentMap[persona.accent];
                return (
                  <motion.div
                    key={persona.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.08 }}
                    className="group relative"
                  >
                    <div
                      className={`relative h-full min-h-[420px] rounded-2xl border ${a.border} bg-[#0a0a14]/70 backdrop-blur-sm p-7 flex flex-col transition-all duration-300 hover:-translate-y-1`}
                      style={{
                        boxShadow: `0 0 0 1px rgba(${a.glowRgba}, 0.10), 0 20px 60px -20px rgba(${a.glowRgba}, 0.45), 0 0 80px -20px rgba(${a.glowRgba}, 0.35)`,
                      }}
                    >
                      {/* Inner top glow */}
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-2xl"
                        style={{
                          background: `radial-gradient(120% 60% at 50% 0%, ${a.topGlow}, transparent 60%)`,
                        }}
                      />

                      <div className="relative flex flex-col h-full">
                        <div
                          className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${a.border} ${a.iconBg} mb-7`}
                          style={{
                            boxShadow: `0 0 24px -6px rgba(${a.glowRgba}, 0.55)`,
                          }}
                        >
                          <persona.icon className={`w-6 h-6 ${a.text}`} />
                        </div>

                        <h3 className="text-xl font-semibold text-white mb-3">
                          {persona.title}
                        </h3>
                        <p className="text-slate-400 leading-relaxed text-[0.95rem] flex-1">
                          {persona.description}
                        </p>

                        <div className="mt-6">
                          <span
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${a.border} text-slate-300 transition-colors group-hover:bg-white/5 group-hover:text-white`}
                          >
                            <ArrowRight className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/20 to-transparent pointer-events-none" />

          <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <div className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-teal-500/10 border border-teal-500/20">
                <Zap className="w-8 h-8 text-amber-400" />
              </div>
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                Powerful Tools for <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-cyan-400">
                  Creative Work
                </span>
              </h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Access the same elite models used by studios—Seedance 2.0, Kling 3.0, Luma, Suno,
                Flux—all within a visual, intuitive interface.
              </p>
            </motion.div>

            <div className="space-y-24">
              {creativeFeatures.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-100px" }}
                  transition={{ duration: 0.6 }}
                  className={`flex flex-col ${index % 2 === 0 ? "lg:flex-row" : "lg:flex-row-reverse"
                    } items-center gap-12`}
                >
                  <div className="flex-1">
                    <div className="w-14 h-14 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-6">
                      <feature.icon className="w-7 h-7 text-amber-400" />
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
                      {feature.title}
                    </h3>
                    <p className="text-lg text-slate-400 leading-relaxed mb-6">
                      {feature.description}
                    </p>
                    <ul className="space-y-3">
                      {feature.features.map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-3 text-slate-300"
                        >
                          <Check className="w-5 h-5 text-emerald-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex-1 w-full">
                    <div className="relative rounded-xl border border-white/10 bg-slate-900/50 backdrop-blur overflow-hidden shadow-2xl">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-slate-900/80">
                        <div className="w-3 h-3 rounded-full bg-rose-500/50" />
                        <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
                      </div>
                      {feature.image.endsWith(".mp4") ? (
                        <video
                          src={feature.image}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="w-full"
                        />
                      ) : (
                        <Image
                          src={feature.image}
                          alt={feature.title}
                          width={800}
                          height={500}
                          className="w-full"
                          loading="lazy"
                        />
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Workflow Examples Section */}
        <section id="workflows" className="py-24 relative">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                Creative Workflow{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
                  Templates
                </span>
              </h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Start with pre-built workflows designed for creative
                professionals. Customize them to fit your unique process.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {workflowExamples.map((workflow, index) => (
                <motion.div
                  key={workflow.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="group"
                >
                  <div
                    className={`relative h-full rounded-2xl border border-white/10 bg-gradient-to-br ${workflow.gradient} backdrop-blur-sm p-8 transition-all duration-300 hover:border-white/20 hover:shadow-2xl`}
                  >
                    <h3 className="text-xl font-semibold text-white mb-3">
                      {workflow.title}
                    </h3>
                    <p className="text-slate-400 mb-6">
                      {workflow.description}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {workflow.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-slate-300 border border-white/10"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="mt-12 text-center"
            >
              <a
                href="https://docs.nodetool.ai/workflows"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all"
              >
                Explore All Templates
                <ArrowRight className="w-4 h-4" />
              </a>
            </motion.div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-24 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-950/20 to-transparent pointer-events-none" />

          <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                Why Creatives{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                  Choose NodeTool
                </span>
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  title: "Your Data, Your Control",
                  description:
                    "Run everything locally. Your creative assets never leave your machine unless you choose to share them.",
                  icon: Shield,
                  color: "text-emerald-400",
                  bgColor: "bg-emerald-500/10",
                  borderColor: "border-emerald-500/20",
                },
                {
                  title: "No Subscription Required",
                  description:
                    "NodeTool is free and open-source. Use your own API keys or run models completely offline.",
                  icon: Sparkles,
                  color: "text-amber-400",
                  bgColor: "bg-amber-500/10",
                  borderColor: "border-amber-500/20",
                },
                {
                  title: "All Leading Models",
                  description:
                    "Access every top model in one place—Seedance 2.0, Kling 3.0, Luma, Runway, Suno, ElevenLabs, Flux, Ideogram, and more.",
                  icon: Zap,
                  color: "text-amber-400",
                  bgColor: "bg-teal-500/10",
                  borderColor: "border-teal-500/20",
                },
              ].map((benefit, index) => (
                <motion.div
                  key={benefit.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="text-center"
                >
                  <div
                    className={`w-16 h-16 mx-auto rounded-2xl ${benefit.bgColor} border ${benefit.borderColor} flex items-center justify-center mb-6`}
                  >
                    <benefit.icon className={`w-8 h-8 ${benefit.color}`} />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-3">
                    {benefit.title}
                  </h3>
                  <p className="text-slate-400 leading-relaxed">
                    {benefit.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Community Section */}
        <section id="community" className="py-24 relative">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-3xl border border-white/10 bg-gradient-to-br from-rose-500/10 via-teal-500/10 to-cyan-500/10 backdrop-blur-xl p-8 md:p-16 text-center overflow-hidden relative"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 via-teal-500 to-cyan-500 opacity-50" />

              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                Join the{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-amber-400">
                  Creative Community
                </span>
              </h2>
              <p className="text-lg text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
                Connect with other creative professionals, share workflows, and
                get help from the community. NodeTool is open-source under
                AGPL-3.0.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href="https://github.com/nodetool-ai/nodetool"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 rounded-xl bg-white text-slate-900 font-semibold hover:bg-slate-100 transition-colors shadow-lg group"
                >
                  <Github className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                  <span>Star on GitHub</span>
                  <div className="ml-3 pl-3 border-l border-slate-200 text-sm font-normal text-slate-500 flex items-center">
                    <Star className="w-3 h-3 mr-1 text-amber-500 fill-amber-500" />
                    <span>
                      {stars
                        ? stars > 1000
                          ? `${(stars / 1000).toFixed(1)}k`
                          : stars
                        : "2.4k"}
                    </span>
                  </div>
                </a>

                <a
                  href="https://discord.gg/WmQTWZRcYE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 rounded-xl bg-[#5865F2] text-white font-semibold hover:bg-[#4752C4] transition-colors shadow-lg group"
                >
                  <MessageCircle className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                  <span>Join Discord</span>
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 relative">
          <div className="mx-auto max-w-4xl px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                Ready to Transform Your <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-amber-400 to-cyan-400">
                  Creative Workflow?
                </span>
              </h2>
              <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
                Download NodeTool for free and start building AI-powered
                creative pipelines today.
              </p>
              <a
                href="https://github.com/nodetool-ai/nodetool/releases"
                className="group inline-flex items-center gap-2 px-10 py-5 rounded-xl bg-gradient-to-r from-rose-500 to-teal-600 text-white text-lg font-semibold hover:from-rose-400 hover:to-teal-500 transition-all shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40"
              >
                <Download className="w-6 h-6" />
                Download NodeTool
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </motion.div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="relative border-t border-white/5 bg-[#050510] py-10">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-500">
              <span className="text-rose-400">
                Built with ❤️ by the NodeTool team
              </span>
            </p>
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <Link href="/" className="hover:text-slate-300 transition-colors">
                Home
              </Link>
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
              <a
                href="https://docs.nodetool.ai"
                className="hover:text-slate-300 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                Docs
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
