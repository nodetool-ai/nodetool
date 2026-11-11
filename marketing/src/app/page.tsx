"use client";
import React from "react";
import { useGridParallax } from "../lib/useGridParallax";
// Static imports so every section is server-rendered into the HTML (P1).
// These components are SSR-safe (no window/document at render, no ReactFlow);
// the hidden duplicate-H1 SEO block has been retired in favour of this.
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import NodeToolHero from "../components/NodeToolHero";
import ProjectSection from "../components/ProjectSection";
import SurfaceShowcase, {
  STORYBOARD_COST_COPY,
} from "../components/SurfaceShowcase";
import StoryboardTeaser from "../components/storyboards/StoryboardTeaser";
import FaqBlock from "../components/FaqBlock";
import { Download } from "lucide-react";
import { SmartDownloadButton } from "./SmartDownloadButton";
import { track } from "../lib/analytics";


const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";
const sectionNarrow = "mx-auto max-w-2xl px-6";

/*
 * Five blocks, in this order (marketing/site-editorial.spec.md § Homepage):
 * the overview, finished films, the mechanism, the cost behaviour, and the
 * way in.
 * Detail lives on the page that owns it: the ad library on /marketing, models
 * on /models, plans and keys on /pricing, the node canvas on
 * /node-based-workflows, editions on /studio and /cloud, the API, CLI and MCP
 * on /developers. Add a section here only by removing one.
 */

/** One film, one commercial, one animation, each with its storyboard page. */
const HOME_FILMS = ["mars-greenhouse", "bowl-time", "clay-monday"] as const;
/** Stable across renders, so SurfaceShowcase does not rebuild its panels. */
const HOME_SURFACE_COPY = { storyboard: STORYBOARD_COST_COPY };

export default function Home() {
  const parallaxRef = useGridParallax();

  return (
    <main className="relative min-h-screen overflow-clip-safe text-white">
      {/* Background */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/* Soft radial glows (BackgroundFX) */}
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
          className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl"
          style={{
            WebkitMaskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
            maskImage:
              "radial-gradient(circle at center, black 0%, transparent 65%)",
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-48 right-8 h-[26rem] w-[26rem] rounded-full bg-teal-500/20 blur-3xl"
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
        {/* Global subtle grid overlay */}
        <div
          ref={parallaxRef}
          aria-hidden="true"
          className="fixed inset-0 bg-grid-pattern"
        />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[.12]"
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
        className="relative isolate overflow-clip-safe pt-24 sm:pt-36 md:pt-24"
      >
        {/* 1. The overview: the promise, the plan sign-in by Download, the
            reel, and three linked cards */}
        <section aria-labelledby="hero-title" className="pt-2 relative">
          <div className={sectionContainer}>
            <NodeToolHero />
          </div>
        </section>

        {/* 2. Finished films, each with the brief it started from. The cards
            open the storyboard page, which leads with the film. */}
        <StoryboardTeaser
          slugs={HOME_FILMS}
          kicker="Made in NodeTool"
          heading="Finished films, with the brief behind each."
          body="Each film started as a short brief. Open one to watch it and see every shot with its camera and direction."
          showBrief
        />

        {/* 3. The mechanism: one note sends one shot back, and the cut keeps
            every other shot */}
        <ProjectSection />

        {/* 4. The cost behaviour: settle shots on stills before paying for
            video. Prices come from the calculator catalog (stageCosts.ts). */}
        <SurfaceShowcase
          surfaceIds={["storyboard"]}
          heading="Approve the still before you pay for the clip."
          intro="The storyboard holds one still per shot. Only the shots you approve become video."
          copy={HOME_SURFACE_COPY}
        />

        {/* 5. The way in. The FAQ rows also emit the page's FAQPage schema. */}
        <FaqBlock
          surface="landing"
          className="mt-16 sm:mt-24"
          linkToStandalone
          emitSchema
        />

        <p className="mx-auto mt-6 max-w-3xl px-6">
          <a href="/faq" className="rounded text-sm font-medium text-blue-300 hover:text-blue-200 focus-ring">
            See all FAQs →
          </a>
        </p>

        <section aria-labelledby="closing-cta-title" className="relative py-16 sm:py-24">
          <div className={`scroll-fade ${sectionNarrow} text-center`}>
            <h2
              id="closing-cta-title"
              className="text-3xl md:text-4xl font-bold tracking-tight text-white"
            >
              Start making with NodeTool.
            </h2>
            <p className="mt-4 text-lg text-slate-300">
              Download Studio, the free desktop app for macOS, Windows, and
              Linux. Sign in with your ChatGPT or Claude plan, add your own
              provider keys, or run supported models locally. Or try NodeTool
              in your browser, where it is still in alpha.
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
                onClick={() => track("Try Cloud", { placement: "closing" })}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-6 py-3.5 text-sm font-semibold text-blue-200 transition-all hover:border-blue-400 hover:bg-blue-500/20 focus-ring"
              >
                Try it in your browser
              </a>
            </div>
            <p className="mt-8 text-sm leading-relaxed text-slate-400">
              NodeTool is open source.{" "}
              <a
                href="https://github.com/nodetool-ai/nodetool"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("Star GitHub")}
                className="text-slate-200 underline decoration-slate-600 underline-offset-4 hover:text-white focus-ring"
              >
                Read the code on GitHub
              </a>
              ,{" "}
              <a
                href="https://discord.gg/WmQTWZRcYE"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("Join Discord")}
                className="text-slate-200 underline decoration-slate-600 underline-offset-4 hover:text-white focus-ring"
              >
                ask on Discord
              </a>
              , or write to{" "}
              <a
                href="mailto:hello@nodetool.ai"
                className="text-slate-200 underline decoration-slate-600 underline-offset-4 hover:text-white focus-ring"
              >
                hello@nodetool.ai
              </a>
              .
            </p>
          </div>
        </section>
      </div>

      {/* Shared site footer (P3) */}
      <SiteFooter />
    </main>
  );
}
