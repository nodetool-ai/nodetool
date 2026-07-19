"use client";
import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import FaqBlock from "../../components/FaqBlock";
import JsonLd from "../../components/JsonLd";
import { faqForSurface } from "../../data/faqEntries";

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

export default function AgentsPage() {
  const [stars, setStars] = useState<number | null>(null);
  const parallaxRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Fetch GitHub stars
  useEffect(() => {
    fetch("https://api.github.com/repos/nodetool-ai/nodetool")
      .then((r) => r.json())
      .then((j) => setStars(j.stargazers_count))
      .catch(() => { });
  }, []);

  // Parallax with reduced-motion guard
  useEffect(() => {
    if (reducedMotion) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (parallaxRef.current) {
          const scrollPosition = window.scrollY;
          const yOffset = scrollPosition * 0.5;
          parallaxRef.current.style.transform = `translate3d(0, ${yOffset}px, 0)`;
        }
        ticking = false;
      });
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [reducedMotion]);

  const agentFaqs = faqForSurface("agents");
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: agentFaqs.map((e) => ({
      "@type": "Question",
      name: e.question,
      url: `https://nodetool.ai${e.route}`,
      acceptedAnswer: { "@type": "Answer", text: e.description },
    })),
  };

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={faqSchema} />
      {/* Background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/* Soft radial glows */}
        <motion.div
          className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-teal-500/20 blur-3xl"
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
          className="pointer-events-none absolute -bottom-48 right-8 h-[26rem] w-[26rem] rounded-full bg-blue-500/20 blur-3xl"
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
        {/* Grid overlay */}
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
          <FaqBlock surface="agents" linkToStandalone />
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
