import React from "react";
import { Download } from "lucide-react";
import { SmartDownloadButton } from "../SmartDownloadButton";
import FaqBlock from "../../components/FaqBlock";
import MarketingClosingAction from "../../components/MarketingClosingAction";
import MarketingFacts from "../../components/MarketingFacts";
import MarketingPageShell from "../../components/MarketingPageShell";
import ProductImage from "../../components/ProductImage";
import StudioHero from "../../components/StudioHero";
import SpecStrip from "../../components/SpecStrip";
import SurfaceShowcase from "../../components/SurfaceShowcase";
import TimelineShowcase from "../../components/TimelineShowcase";
import { EDITIONS } from "../../data/editions";
import PageUpdated from "@/components/PageUpdated";
import { OWNERSHIP_FACTS, SETUP_FACTS } from "@/data/studioPage";

const primaryButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition-colors hover:bg-blue-500 focus-ring sm:w-auto";

function StudioPrimaryAction() {
  return (
    <SmartDownloadButton
      labelPrefix={EDITIONS.studio.primaryAction}
      icon={<Download className="h-5 w-5" />}
      classNameOverride={primaryButtonClass}
    />
  );
}

export default function StudioPage() {
  return (
    <MarketingPageShell>
      <StudioHero
        headingId="studio-hero-title"
        primaryAction={<StudioPrimaryAction />}
      />

      <SurfaceShowcase
        heading="Direct the details."
        intro="Open the same project in the editor that fits the change. Revise a shot, a line reading, a layer, or the timing of the cut without starting over."
      />

      {/* Finished films whose editable timelines open in Studio */}
      <TimelineShowcase />

      <section
        id="ownership"
        aria-labelledby="studio-ownership-title"
        className="rhythm-section"
      >
        <div className="mx-auto grid max-w-7xl items-start gap-10 px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
          <div className="lg:col-span-7">
            <ProductImage
              src="/screen_model_manager.webp"
              alt="NodeTool model manager showing locally available models"
              width={1600}
              height={1089}
              caption="Use the model manager to download local models, or connect your provider accounts."
            />
          </div>
          <div className="lg:col-span-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              Runs on your computer
            </p>
            <h2
              id="studio-ownership-title"
              className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl"
            >
              Your projects stay on your computer.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-300">
              Studio keeps the project on your computer. It only goes online
              when you use an online AI provider or service.
            </p>
            <div className="mt-8">
              <MarketingFacts items={OWNERSHIP_FACTS} />
            </div>
          </div>
        </div>
      </section>

      <section
        id="studio-setup"
        aria-labelledby="studio-setup-title"
        className="rhythm-section"
      >
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
          <header className="lg:col-span-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              Setup
            </p>
            <h2
              id="studio-setup-title"
              className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl"
            >
              Start with the setup you have.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-300">
              You do not need a powerful computer. Running AI models on your own
              machine is optional.
            </p>
          </header>
          <div className="lg:col-span-7">
            <MarketingFacts items={SETUP_FACTS} />
          </div>
        </div>
        <FaqBlock
          surface="studio"
          heading="Studio questions"
          linkToStandalone
          emitSchema
          className="mt-16"
        />
      </section>

      <SpecStrip items={["plan", "cost", "access"]} className="rhythm-section" />

      <MarketingClosingAction
        headingId="studio-closing-title"
        title="Start your next project in Studio."
        body="Download the free desktop app for macOS, Windows, or Linux. The app and its source code are open under AGPL-3.0."
        primaryAction={<StudioPrimaryAction />}
        secondaryAction={{ href: "/cloud", label: "Try Cloud (alpha)" }}
      />
    <div className="mx-auto max-w-7xl px-6 pb-12 lg:px-8">
      <PageUpdated route="/studio" className="text-sm text-slate-400" />
    </div>
    </MarketingPageShell>
  );
}
