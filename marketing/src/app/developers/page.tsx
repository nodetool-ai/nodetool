"use client";
import { useGridParallax, usePrefersReducedMotion } from "../../lib/useGridParallax";
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";

const DevelopersHero = dynamic(
  () => import("../../components/developers/DevelopersHero"),
  { ssr: true }
);
const SandboxSection = dynamic(
  () => import("../../components/developers/SandboxSection"),
  { ssr: true }
);
const SandboxPacksSection = dynamic(
  () => import("../../components/developers/SandboxPacksSection"),
  { ssr: true }
);
const SandboxDslSection = dynamic(
  () => import("../../components/developers/SandboxDslSection"),
  { ssr: true }
);
const AgentSandboxSection = dynamic(
  () => import("../../components/developers/AgentSandboxSection"),
  { ssr: true }
);
const SandboxGrantSection = dynamic(
  () => import("../../components/developers/SandboxGrantSection"),
  { ssr: true }
);
const SandboxAuthoringSection = dynamic(
  () => import("../../components/developers/SandboxAuthoringSection"),
  { ssr: true }
);
const DeveloperPlatformSection = dynamic(
  () => import("../../components/developers/DeveloperPlatformSection"),
  { ssr: true }
);
const CommunitySection = dynamic(
  () => import("../../components/CommunitySection"),
  { ssr: true }
);
const ContactSection = dynamic(
  () => import("../../components/ContactSection"),
  { ssr: true }
);


const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

// Prefer reduced motion hook
export default function DevelopersPage() {
  const [stars, setStars] = useState<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const parallaxRef = useGridParallax();

  // Fetch GitHub stars
  useEffect(() => {
    fetch("https://api.github.com/repos/nodetool-ai/nodetool")
      .then((r) => r.json())
      .then((j) => setStars(j.stargazers_count))
      .catch(() => {});
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      {/* Background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/* Soft radial glows */}
        <motion.div
          className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-violet-500/20 blur-3xl"
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
          style={{ background: "rgba(0,0,0,0.7)" }}
        />
        {/* Grid overlay */}
        <div
          ref={parallaxRef}
          aria-hidden="true"
          className="fixed inset-0 bg-grid-pattern"
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

      <SiteHeader />

      <div
        id="content"
        className="relative isolate overflow-hidden pt-24 sm:pt-36 md:pt-24"
      >
        {/* Hero */}
        <section aria-labelledby="hero-title" className="pt-2 relative">
          <div className={`${sectionContainer}`}>
            <DevelopersHero />
          </div>
        </section>

        {/* The sandbox */}
        <SandboxSection />

        {/* Libraries as imports */}
        <SandboxPacksSection />

        {/* The DSL inside the sandbox */}
        <SandboxDslSection />

        {/* Agents driving NodeTool from the sandbox */}
        <AgentSandboxSection />

        {/* Limits and the security model */}
        <SandboxGrantSection />

        {/* Validate, run, test */}
        <SandboxAuthoringSection />

        {/* Custom nodes, MCP, self-hosting */}
        <DeveloperPlatformSection />

        {/* Community */}
        <CommunitySection stars={stars} />

        {/* Divider */}
        <div className="mx-auto my-16 h-px max-w-6xl bg-gradient-to-r from-transparent via-violet-800/20 to-transparent" />

        {/* Contact */}
        <ContactSection />
      </div>

      <SiteFooter />
    </main>
  );
}
