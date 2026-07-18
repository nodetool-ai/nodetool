"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
// Static imports so every section is server-rendered into the HTML (P1).
// These components are SSR-safe (no window/document at render, no ReactFlow);
// the hidden duplicate-H1 SEO block has been retired in favour of this.
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import NodeToolHero from "../components/NodeToolHero";
import BuildRunDeploy from "../components/BuildRunDeploy";
import OwnershipSection from "../components/OwnershipSection";
import ModelSupportSection from "../components/ModelSupportSection";
import ModelManagerSection from "../components/ModelManagerSection";
import CostDashboardSection from "../components/CostDashboardSection";
import TimelineEditorSection from "../components/TimelineEditorSection";
import SketchEditorSection from "../components/SketchEditorSection";
import FeaturesSection from "../components/FeaturesSection";
import NodeMenuSection from "../components/NodeMenuSection";
import ChatUISection from "../components/ChatUISection";
import AssetManagerSection from "../components/AssetManagerSection";
import CommunitySection from "../components/CommunitySection";
import ContactSection from "../components/ContactSection";
import ComparisonSection from "../components/ComparisonSection";
import UseCasesShowcase from "../components/UseCasesShowcase";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Download } from "lucide-react";
import { SmartDownloadButton } from "./SmartDownloadButton";
import { track } from "../lib/analytics";
import { useGithubStars } from "../lib/useGithubStars";

import { Feature, features } from "./features";


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

export default function Home() {
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const stars = useGithubStars();
  const parallaxRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

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
      {/* Shared site header (P3) */}
      <SiteHeader />

      <div
        id="content"
        className="relative isolate overflow-hidden pt-24 sm:pt-36 md:pt-24"
      >
        {/* Hero */}
        <section aria-labelledby="hero-title" className="pt-2 relative">
          <div className={`${sectionContainer}`}>
            <div>
              <NodeToolHero />
            </div>
          </div>
        </section>

        {/* Demo video — surface the product immediately after the hero */}
        <section id="demo-video" aria-label="NodeTool Demo" className="rhythm-section relative scroll-mt-24">
          <div className={`${sectionContainer}`}>
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05, ease: "easeOut" }}
              className="relative group"
            >
              <div
                className="absolute -inset-4 rounded-3xl opacity-60 blur-3xl transition-opacity duration-500 group-hover:opacity-80"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(139, 92, 246, 0.3) 0%, rgba(59, 130, 246, 0.2) 40%, transparent 70%)",
                }}
              />
              <div className="relative rounded-2xl border border-slate-700/60 bg-slate-900/80 p-2 shadow-2xl shadow-amber-900/20 backdrop-blur-sm ring-1 ring-white/5 overflow-hidden">
                <video
                  src="/demo.mp4"
                  poster="/demo-poster-960.webp"
                  width={1500}
                  height={1000}
                  className="block aspect-[3/2] h-auto w-full rounded-xl"
                  controls
                  playsInline
                  preload="none"
                />
              </div>
              <p className="mt-4 text-center text-sm text-slate-400">
                A trailer generated end-to-end in NodeTool — script, key art,
                animation, and sound from one workflow on the canvas.
              </p>
            </motion.div>
          </div>
        </section>

        {/* How it works (Build / Run / Edit) — the 3-step mental model */}
        <section aria-labelledby="how-title" className="rhythm-section pt-4">
          <div className={`${sectionContainer}`}>
            <BuildRunDeploy />
          </div>
        </section>

        {/* Concrete proof right after the mental model: a complete, runnable workflow */}
        <UseCasesShowcase />

        {/* What the canvas does */}
        <FeaturesSection />

        {/* What's in the canvas */}
        <NodeMenuSection />

        {/* Assemble the generated clips — built-in timeline editor */}
        <TimelineEditorSection />

        {/* Paint and generate on one canvas — built-in sketch editor (sibling to the timeline editor) */}
        <SketchEditorSection />

        {/* Asset Manager — companion to the canvas story */}
        <AssetManagerSection />

        {/* Alternate interface: drive workflows by chat (payoff after canvas) */}
        <ChatUISection />

        {/* Position vs. the alternatives — sets up the BYOK / your-stack story that follows */}
        <ComparisonSection reducedMotion={reducedMotion} />

        {/* Ownership block — three adjacent sections that share the BYOK / your-stack story */}
        <OwnershipSection reducedMotion={reducedMotion} />
        <ModelSupportSection reducedMotion={reducedMotion} />
        <ModelManagerSection />

        {/* Cost transparency — the payoff of BYOK: pay providers directly, see every node's real cost */}
        <CostDashboardSection />

        {/* Templates Gallery */}
        {/* <ExamplesGrid /> */}

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

        {/* Closing CTA — end the page on the product, not the mailbox */}
        <section aria-labelledby="closing-cta-title" className="relative py-24">
          <div className={`${sectionNarrow} text-center`}>
            <h2
              id="closing-cta-title"
              className="text-3xl md:text-4xl font-bold tracking-tight text-white"
            >
              Put every model on one canvas.
            </h2>
            <p className="mt-4 text-lg text-slate-300">
              Free, open source, and yours to run. Download Studio — or try
              Cloud in the browser, nothing to install.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <SmartDownloadButton
                icon={<Download className="h-5 w-5" />}
                classNameOverride="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 hover:shadow-blue-900/60 focus-ring"
              />
              <a
                href="https://app.nodetool.ai"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("Try Cloud")}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-6 py-3.5 text-sm font-semibold text-blue-200 transition-all hover:border-blue-400 hover:bg-blue-500/20 focus-ring"
              >
                Try NodeTool Cloud
              </a>
              <a
                href="https://github.com/nodetool-ai/nodetool"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("Star GitHub")}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-3.5 text-sm font-semibold text-slate-100 transition-all hover:border-slate-500 hover:bg-slate-800/60 focus-ring"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </section>
      </div>

      {/* Shared site footer (P3) */}
      <SiteFooter />
    </main>
  );
}
