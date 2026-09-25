import React from "react";
import { Download } from "lucide-react";
import { SmartDownloadButton } from "../SmartDownloadButton";
import FaqBlock from "../../components/FaqBlock";
import HeroDemoPlayer from "../../components/HeroDemoPlayer";
import MarketingClosingAction from "../../components/MarketingClosingAction";
import MarketingFacts, {
  type MarketingFact,
} from "../../components/MarketingFacts";
import MarketingHero from "../../components/MarketingHero";
import MarketingPageShell from "../../components/MarketingPageShell";
import ProductImage from "../../components/ProductImage";
import SurfaceShowcase from "../../components/SurfaceShowcase";
import { EDITIONS } from "../../data/editions";

const ownershipFacts: MarketingFact[] = [
  {
    term: "Project files",
    description:
      "Studio stores the workspace, workflows, and media on your machine. You choose where those files live and when to move them.",
  },
  {
    term: "Supported local models",
    description:
      "Use supported language and image models through Ollama, MLX, llama.cpp, vLLM, or LM Studio. Local capability depends on the model and your hardware.",
  },
  {
    term: "Remote providers",
    description:
      "Connect your own provider accounts when a hosted model fits the job. Those requests need a network connection and are handled under the provider's terms.",
  },
  {
    term: "Offline work",
    description:
      "Studio can work without a network when the project uses local files and supported local models. Remote providers, downloads, and online services still need a connection.",
  },
];

const setupFacts: MarketingFact[] = [
  {
    term: "Desktop platforms",
    description: "Studio is available for macOS, Windows, and Linux.",
  },
  {
    term: "Graphics hardware",
    description:
      "A dedicated GPU is optional when you use hosted providers. It matters when you choose to run larger models locally.",
  },
  {
    term: "Model downloads",
    description:
      "The desktop app does not require a local model collection. Download only the supported models you plan to run on your machine.",
  },
];

const primaryButtonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition-colors hover:bg-blue-500 focus-ring";

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
      <MarketingHero
        eyebrow={EDITIONS.studio.eyebrow}
        title="Make the work. Keep the project."
        body="Create images, video, audio, and text with agents that work in NodeTool's editors. Revise the storyboard, script, layers, and timeline yourself, and keep the project for the next job."
        primaryAction={<StudioPrimaryAction />}
        secondaryAction={{
          href: "#editable-project",
          label: "See an editable project",
        }}
        trustLine="Free and open source · AGPL-3.0 · macOS, Windows, Linux"
        recommendation={EDITIONS.studio.recommendation}
        headingId="studio-hero-title"
        media={
          <ProductImage
            src="/surface-timeline-poster.webp"
            alt="NodeTool timeline editor with video and audio tracks"
            width={1600}
            height={900}
            priority
            caption="The timeline is part of the saved project. Clips, audio, and timing remain open for revision."
          />
        }
      />

      <section
        id="editable-project"
        aria-labelledby="studio-project-title"
        className="rhythm-section scroll-mt-24"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <header className="mx-auto mb-10 max-w-5xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              One saved project
            </p>
            <h2
              id="studio-project-title"
              className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl"
            >
              A brief becomes a project you can reopen.
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-300">
              The agent can draft the board and assemble a cut. The result is
              still a NodeTool project, so the next change can happen in an
              editor or through another agent action.
            </p>
          </header>
          <div className="mx-auto max-w-5xl">
            <HeroDemoPlayer
              mediaBase="/conversation-project"
              priority={false}
              alt="A conversation becomes a storyboard, generated shots, an editable cut, and a saved project"
              caption="Recorded in NodeTool: a brief becomes a storyboard and an editable cut inside the saved project."
            />
          </div>
        </div>
      </section>

      <SurfaceShowcase
        surfaceIds={["storyboard", "script", "timeline"]}
        heading="Direct the details."
        intro="Open the same project in the editor that fits the change. Revise a shot, another line reading, or the timing of the cut without starting over."
      />

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
              caption="The model manager is optional setup for supported local inference. Studio also works with hosted providers on your own accounts."
            />
          </div>
          <div className="lg:col-span-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              Local-first, with a clear boundary
            </p>
            <h2
              id="studio-ownership-title"
              className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl"
            >
              Your files. Your models. Your keys.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-300">
              Studio keeps the project on your machine. Network use depends on
              the models and services you choose for each run.
            </p>
            <div className="mt-8">
              <MarketingFacts items={ownershipFacts} />
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
              Local inference is a choice, not an eligibility requirement for
              the desktop edition.
            </p>
          </header>
          <div className="lg:col-span-7">
            <MarketingFacts items={setupFacts} />
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

      <MarketingClosingAction
        headingId="studio-closing-title"
        title="Start your next project in Studio."
        body="Download the production edition for macOS, Windows, or Linux. The app and source are available under AGPL-3.0."
        primaryAction={<StudioPrimaryAction />}
        secondaryAction={{ href: "/cloud", label: "Try Cloud (alpha)" }}
      />
    </MarketingPageShell>
  );
}
