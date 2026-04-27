"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import dynamic from "next/dynamic";
import SeoHeroContent from "../components/SeoHeroContent";
const NodeToolHero = dynamic(() => import("../components/NodeToolHero"), {
  ssr: false,
});
const BuildRunDeploy = dynamic(() => import("../components/BuildRunDeploy"), {
  ssr: false,
});
const OwnershipSection = dynamic(
  () => import("../components/OwnershipSection"),
  { ssr: false }
);
const UseCasesSection = dynamic(() => import("../components/UseCasesSection"), {
  ssr: false,
});
const DeploySection = dynamic(() => import("../components/DeploySection"), {
  ssr: false,
});
const ModelSupportSection = dynamic(
  () => import("../components/ModelSupportSection"),
  { ssr: false }
);
const ModelManagerSection = dynamic(
  () => import("../components/ModelManagerSection"),
  { ssr: false }
);
const VideoGenerationSection = dynamic(
  () => import("../components/VideoGenerationSection"),
  { ssr: false }
);
const FeaturesSection = dynamic(() => import("../components/FeaturesSection"), {
  ssr: false,
});
const NodeMenuSection = dynamic(() => import("../components/NodeMenuSection"), {
  ssr: false,
});
const ChatUISection = dynamic(() => import("../components/ChatUISection"), {
  ssr: false,
});
const AssetManagerSection = dynamic(
  () => import("../components/AssetManagerSection"),
  { ssr: false }
);
const CommunitySection = dynamic(
  () => import("../components/CommunitySection"),
  { ssr: false }
);
const ContactSection = dynamic(() => import("../components/ContactSection"), {
  ssr: false,
});
const ComparisonSection = dynamic(
  () => import("../components/ComparisonSection"),
  { ssr: false }
);
import { XMarkIcon, Bars3Icon } from "@heroicons/react/24/outline";

import { Feature, features } from "./features";

export const runtime = "edge";

const navigation = [
  { name: "Agents", href: "/agents" },
  { name: "Creatives", href: "/creatives" },
  { name: "Developers", href: "/developers" },
  { name: "Features", href: "#features" },
  // { name: "Templates", href: "#templates" },
  { name: "Community", href: "#contact" },
  { name: "Docs", href: "https://docs.nodetool.ai" },
] as const;


// Utility: common classes
// Add a semantic `card` class so we can style shared card media globally
const cardBase =
  "card relative rounded-2xl bg-slate-900/60 border border-slate-800/60 ring-1 ring-white/5 backdrop-blur-md shadow-soft";
const cardHoverUnified = "lift hover:border-blue-500/50 hover:shadow-strong";
const cardInnerGlow =
  "pointer-events-none absolute inset-0 rounded-2xl opacity-0 motion-safe:transition-opacity motion-safe:duration-300 group-hover:opacity-100";
const cardInnerGlowStyle = {
  background:
    "radial-gradient(120% 120% at 50% 0%, rgba(37,99,235,0.08), transparent 55%)",
};
const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";
const sectionNarrow = "mx-auto max-w-2xl px-6";
const subtleShadow = "shadow-soft";
const strongShadow = "shadow-strong";
const focusRing = "focus-ring";
const focusRingStrong = "focus-ring";
const motionSafe = "motion-safe:transition-all motion-safe:duration-300";
const ctaBase =
  "inline-flex items-center rounded-lg px-6 py-3 text-white bg-blue-600 hover:bg-blue-500 lift shadow-lg shadow-blue-900/40";

// Accent glow variants to add visual variety across cards/sections
const accentGlows = [
  {
    background:
      "radial-gradient(120% 120% at 50% 0%, rgba(37,99,235,0.10), transparent 55%)",
  }, // blue
  {
    background:
      "radial-gradient(120% 120% at 50% 0%, rgba(168,85,247,0.10), transparent 55%)",
  }, // purple
  {
    background:
      "radial-gradient(120% 120% at 50% 0%, rgba(16,185,129,0.10), transparent 55%)",
  }, // emerald
  {
    background:
      "radial-gradient(120% 120% at 50% 0%, rgba(244,63,94,0.10), transparent 55%)",
  }, // rose
  {
    background:
      "radial-gradient(120% 120% at 50% 0%, rgba(245,158,11,0.10), transparent 55%)",
  }, // amber
];

// Color rotations for Providers section (BYOP)
const providerCardTitleColors = [
  "text-blue-200",
  "text-purple-200",
  "text-emerald-200",
];

const providerCardDotColors = [
  "bg-blue-400",
  "bg-purple-400",
  "bg-emerald-400",
];

// Color rotations for provider badges
const providerBadgeBgColors = [
  "bg-blue-900/30",
  "bg-purple-900/30",
  "bg-emerald-900/30",
  "bg-rose-900/30",
  "bg-amber-900/30",
];
const providerBadgeBorderColors = [
  "border-blue-700/40",
  "border-purple-700/40",
  "border-emerald-700/40",
  "border-rose-700/40",
  "border-amber-700/40",
];

// Prefer reduced motion hook
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

// Legacy reveal hook for backward compatibility
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    el.style.willChange = "transform, opacity";
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.style.transition = "opacity 600ms ease, transform 600ms ease";
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
            obs.disconnect();
          }
        });
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

export default function Home() {
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [hash, setHash] = useState<string>("");
  const [stars, setStars] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const parallaxRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const heroRevealRef = useReveal();

  // Avoid background scroll while the mobile menu is open.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileMenuOpen]);

  // Global section fly-in using IntersectionObserver + CSS transitions
  useEffect(() => {
    if (reducedMotion) return;
    const root = document.getElementById("content");
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("section"));
    // Initialize base class + slight stagger via CSS var
    sections.forEach((el, i) => {
      el.classList.add("fly-in");
      const delay = Math.min(i * 60, 300);
      el.style.setProperty("--fly-delay", `${delay}ms`);
    });
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.classList.add("is-visible");
            obs.unobserve(el);
          }
        });
      },
      { root: null, threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
    );
    sections.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [reducedMotion]);

  // Track hash for navigation
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update, { passive: true } as any);
    return () => window.removeEventListener("hashchange", update as any);
  }, []);

  // Fetch GitHub stars
  useEffect(() => {
    fetch("https://api.github.com/repos/nodetool-ai/nodetool")
      .then((r) => r.json())
      .then((j) => setStars(j.stargazers_count))
      .catch(() => { });
  }, []);

  // Parallax with reduced-motion guard and passive scroll
  useEffect(() => {
    if (reducedMotion) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (parallaxRef.current) {
          const scrollPosition = window.scrollY;
          const yOffset = scrollPosition * 0.5; // slower background
          parallaxRef.current.style.transform = `translate3d(0, ${yOffset}px, 0)`;
        }
        ticking = false;
      });
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [reducedMotion]);

  // Close modal via ESC and manage focus
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") setSelectedFeature(null);
  }, []);

  // Focus management for modal
  useEffect(() => {
    if (selectedFeature) {
      const el = document.getElementById("feature-close");
      el?.focus();
    }
  }, [selectedFeature]);

  return (
    <main
      className="relative min-h-screen overflow-hidden text-white"
      onKeyDown={onKeyDown}
    >
      {/* Background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/* Soft radial glows (BackgroundFX) */}
        <motion.div
          className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl"
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
          className="pointer-events-none absolute -bottom-48 right-8 h-[26rem] w-[26rem] rounded-full bg-teal-500/20 blur-3xl"
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
        {/* Global subtle grid overlay */}
        <div
          ref={parallaxRef}
          aria-hidden="true"
          className="h-full w-full will-change-transform bg-grid-pattern"
          style={{ transform: "translate3d(0,0,0)" }}
        />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[.28]"
          shapeRendering="crispEdges"
        >
          <defs>
            <pattern
              id="page-grid"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="0.33"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#page-grid)" />
        </svg>
      </div>
      {/* Nav */}
      <header>
        <nav
          className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800/60 bg-glass supports-[backdrop-filter]:bg-glass shadow-[0_1px_0_0_rgba(59,130,246,0.08)]"
          aria-label="Primary"
        >
          <div className={`${sectionContainer} py-4 sm:py-4 lg:py-2`}>
            <div className="relative flex items-center justify-center gap-6 w-full min-h-[56px] sm:min-h-[64px]">
              {/* Logo: absolutely left */}
              <div className="absolute left-0 flex items-center h-12 sm:h-10">
                <a href="/" className={`group flex items-center gap-2 rounded`}>
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
                    nodetool
                  </span>
                </a>
              </div>
              {/* Navigation: centered */}
              <ul className="hidden md:flex items-center gap-2 lg:gap-4 mx-auto rounded-full bg-slate-900/40 ring-1 ring-white/5 px-2 py-1 border border-slate-800/50">
                {navigation.map((item) => {
                  const active = hash === item.href;
                  return (
                    <li key={item.name} className="list-none">
                      <a
                        href={item.href}
                        className={`px-3 py-1.5 text-sm font-medium rounded-full lift ${active
                          ? "bg-blue-600/25 text-blue-200 border border-blue-500/40"
                          : "text-slate-300 hover:text-blue-200 hover:bg-slate-800/60"
                          }`}
                        aria-current={active ? "page" : undefined}
                      >
                        {item.name}
                      </a>
                    </li>
                  );
                })}
              </ul>
              {/* GitHub: absolutely right */}
              <div className="absolute right-0 flex items-center gap-2 h-full">
                {/* Mobile menu button */}
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
                  className="rounded-lg p-1.5 transition-all duration-200 hover:bg-slate-800/60 hover:scale-110 opacity-70 hover:opacity-100"
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
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
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
                    nodetool
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
        className="relative isolate overflow-hidden pt-16 sm:pt-20 lg:pt-24"
      >
        {/* Hero */}
        <section aria-labelledby="hero-title" className="pt-2 relative">
          {/* Server-rendered SEO content for search engines */}
          <SeoHeroContent />
          <div className={`${sectionContainer}`}>
            <div ref={heroRevealRef}>
              <NodeToolHero />
            </div>
          </div>
        </section>

        {/* Main Interface Showcase */}
        <section aria-label="NodeTool Interface" className="rhythm-section relative">
          <div className={`${sectionContainer}`}>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              className="relative group"
            >
              {/* Glow effect behind the image */}
              <div
                className="absolute -inset-4 rounded-3xl opacity-60 blur-3xl transition-opacity duration-500 group-hover:opacity-80"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(139, 92, 246, 0.3) 0%, rgba(59, 130, 246, 0.2) 40%, transparent 70%)",
                }}
              />
              {/* Image container with border and shadow */}
              <div className="relative rounded-2xl border border-slate-700/60 bg-slate-900/80 p-2 shadow-2xl shadow-amber-900/20 backdrop-blur-sm ring-1 ring-white/5 overflow-hidden">
                <video
                  src="/demo.mp4"
                  className="w-full h-auto rounded-xl"
                  controls
                  playsInline
                />
                {/* Subtle inner gradient overlay */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-xl"
                  style={{
                    background:
                      "linear-gradient(to bottom, transparent 70%, rgba(15, 23, 42, 0.4) 100%)",
                  }}
                />
              </div>
            </motion.div>
          </div>
        </section>

        {/* How it works */}
        <section aria-labelledby="how-title" className="rhythm-section">
          <div className={`${sectionContainer}`}>
            <BuildRunDeploy />
          </div>
        </section>

        {/* Comparisons with alternatives */}
        <ComparisonSection reducedMotion={reducedMotion} />

        {/* Your tools, your data, your way */}
        <OwnershipSection reducedMotion={reducedMotion} />

        {/* Use Cases */}
        <UseCasesSection reducedMotion={reducedMotion} />

        {/* Local Model Support - MLX & GGML/GGUF */}
        <ModelSupportSection reducedMotion={reducedMotion} />

        {/* Model Manager */}
        <ModelManagerSection />

        {/* Video Generation */}
        <VideoGenerationSection reducedMotion={reducedMotion} />

        {/* Templates Gallery */}
        {/* <ExamplesGrid /> */}

        {/* Features */}
        <FeaturesSection />

        {/* Node Menu */}
        <NodeMenuSection />

        {/* Chat UI */}
        <ChatUISection />

        {/* Asset Manager */}
        <AssetManagerSection />

        {/* Deploy */}
        <DeploySection reducedMotion={reducedMotion} />

        {/* Feature Modal (accessible) */}
        {selectedFeature && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label={selectedFeature.name}
            onClick={() => setSelectedFeature(null)}
          >
            <div
              className="relative mx-auto max-w-4xl rounded-lg border border-blue-800/50 bg-slate-900 p-4 shadow-2xl shadow-blue-900/30"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                id="feature-close"
                className={`absolute right-4 top-4 rounded text-slate-300 transition-colors hover:text-white ${focusRingStrong}`}
                onClick={() => setSelectedFeature(null)}
                aria-label="Close"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>

              {selectedFeature.gif ? (
                // If animated GIF, keep img to preserve animation frames
                // Otherwise you can switch to next/image for static or video for mp4/webm
                <img
                  src={selectedFeature.gif}
                  alt={selectedFeature.name}
                  width={selectedFeature.width}
                  height={selectedFeature.height}
                  className="h-auto w-full rounded-lg"
                />
              ) : (
                <div className="p-10 text-center text-slate-300">
                  No preview available
                </div>
              )}
            </div>
          </div>
        )}

        {/* Community / Discord */}
        <CommunitySection stars={stars} />

        {/* Divider */}
        <div className="mx-auto my-16 h-px max-w-6xl bg-gradient-to-r from-transparent via-blue-800/20 to-transparent" />

        {/* Contact */}
        <ContactSection />
      </div>

      {/* Footer */}
      <footer className="relative border-t border-slate-800/50 bg-slate-950 py-10">
        <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-blue-800/40 to-transparent" />
        <div className={`${sectionContainer}`}>
          <div className="mt-4 flex justify-center gap-6 text-xs text-slate-500">
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
          </div>
        </div>
      </footer>
    </main>
  );
}
