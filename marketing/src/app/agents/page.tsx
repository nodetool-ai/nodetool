"use client";
import { useGridParallax, usePrefersReducedMotion } from "../../lib/useGridParallax";
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import FaqBlock from "../../components/FaqBlock";

const AgentsGraphHero = dynamic(() => import("../../components/agents/AgentsGraphHero"), {
  ssr: true,
});
const AgentBuildRunDeploy = dynamic(
  () => import("../../components/agents/AgentBuildRunDeploy"),
  { ssr: true }
);
const AgentFeaturesSection = dynamic(
  () => import("../../components/agents/AgentFeaturesSection"),
  { ssr: true }
);
const AgentUseCasesSection = dynamic(
  () => import("../../components/agents/AgentUseCasesSection"),
  { ssr: true }
);
const AgentIntegrationsSection = dynamic(
  () => import("../../components/agents/AgentIntegrationsSection"),
  { ssr: true }
);
const ModelSupportSection = dynamic(
  () => import("../../components/ModelSupportSection"),
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
export default function AgentsPage() {
  const [stars, setStars] = useState<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const parallaxRef = useGridParallax();

  // Fetch GitHub stars
  useEffect(() => {
    fetch("https://api.github.com/repos/nodetool-ai/nodetool")
      .then((r) => r.json())
      .then((j) => setStars(j.stargazers_count))
      .catch(() => { });
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      {/* Background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/* Soft radial glows */}
        {/*
          Static, not animated. These are 448px and 416px circles under
          `blur(64px)`; drifting them 10px on an infinite framer-motion loop
          made Safari re-rasterize both blurred layers every frame and held the
          whole page at ~4fps for as long as it stayed open, so a tap on the
          menu waited up to a frame and the panel took over a second to paint.
          Chrome composited the same animation and stayed at 60fps, which is
          why it went unnoticed. Measured with
          `marketing/tests/e2e/idle-animation.spec.ts`.
        */}
        <div
          className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-teal-500/20 blur-3xl"
          style={{
            WebkitMaskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
            maskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-48 right-8 h-[26rem] w-[26rem] rounded-full bg-blue-500/20 blur-3xl"
          style={{
            WebkitMaskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
            maskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
          }}
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
            <AgentsGraphHero />
          </div>
        </section>

        {/* How it works: Build, Run Deploy (Agentic) */}
        <section aria-labelledby="workflow-title" className="rhythm-section">
          <div className={`${sectionContainer}`}>
            <AgentBuildRunDeploy />
          </div>
        </section>

        {/* Features */}
        <AgentFeaturesSection reducedMotion={reducedMotion} />

        {/* Models - Important for Agents */}
        <div id="models">
          <ModelSupportSection reducedMotion={reducedMotion} />
        </div>

        {/* Use Cases */}
        <AgentUseCasesSection reducedMotion={reducedMotion} />

        {/* Integrations */}
        <AgentIntegrationsSection reducedMotion={reducedMotion} />

        {/* FAQ — same rows as /faq, pinned to the "agents" surface */}
        <section aria-label="Frequently asked questions" className="rhythm-section">
          <FaqBlock surface="agents" linkToStandalone emitSchema />
        </section>

        {/* Community */}
        <CommunitySection stars={stars} />

        {/* Divider */}
        <div className="mx-auto my-16 h-px max-w-6xl bg-gradient-to-r from-transparent via-teal-800/20 to-transparent" />

        {/* Contact */}
        <ContactSection />
      </div>

      <SiteFooter />
    </main>
  );
}
