import React from "react";
import { ArrowUpRight } from "lucide-react";
import CloudWaitlist from "../../components/CloudWaitlist";
import FaqBlock from "../../components/FaqBlock";
import HeroDemoPlayer from "../../components/HeroDemoPlayer";
import MarketingClosingAction from "../../components/MarketingClosingAction";
import MarketingFacts, {
  type MarketingFact,
} from "../../components/MarketingFacts";
import MarketingHero from "../../components/MarketingHero";
import MarketingPageShell from "../../components/MarketingPageShell";
import ProductImage from "../../components/ProductImage";
import { EDITIONS } from "../../data/editions";

const hostedFacts: MarketingFact[] = [
  {
    term: "Workspace",
    description:
      "The hosted alpha opens in a browser and keeps the agent, canvas, and editors together. No desktop installation is required.",
  },
  {
    term: "Project storage",
    description:
      "Cloud uses hosted storage. Check the current alpha terms before using sensitive or regulated material.",
  },
  {
    term: "Provider execution",
    description:
      "Remote image, video, audio, and language models run through the provider accounts you connect. Provider charges remain separate from NodeTool.",
  },
  {
    term: "Local models",
    description:
      "Cloud cannot use models running through Ollama, MLX, llama.cpp, or other runtimes on your computer. Use Studio for local inference.",
  },
  {
    term: "Connection",
    description:
      "Cloud needs an internet connection. Studio can keep local work available without one when every step uses local files and supported local models.",
  },
];

const primaryButtonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition-colors hover:bg-blue-500 focus-ring";

function CloudPrimaryAction() {
  return (
    <a
      href={EDITIONS.cloud.appUrl}
      className={primaryButtonClass}
      aria-label={EDITIONS.cloud.primaryAction}
    >
      {EDITIONS.cloud.primaryAction}
      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}

export default function CloudPage() {
  return (
    <MarketingPageShell>
      <MarketingHero
        eyebrow={EDITIONS.cloud.eyebrow}
        title="The NodeTool workspace. In your browser."
        body="Try NodeTool without installing it. Work with agents and editors in the same creative workspace, with hosted storage and your own provider accounts. Cloud is an alpha preview for evaluation and lightweight access."
        primaryAction={<CloudPrimaryAction />}
        secondaryAction={{ href: "/studio", label: "Download Studio" }}
        trustLine="Alpha preview · Internet connection required · Remote providers only"
        recommendation="For paid production work, use Studio."
        headingId="cloud-hero-title"
        media={
          <ProductImage
            src="/surface-storyboard-poster.webp"
            alt="NodeTool storyboard editor with generated shots and the agent tool record"
            width={1920}
            height={1080}
            priority
            caption="The storyboard remains an editable project surface. This capture shows the product interface, not a claim about a specific hosted run."
          />
        }
      />

      <section
        id="editable-project"
        aria-labelledby="cloud-editable-title"
        className="rhythm-section"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <header className="mx-auto mb-10 max-w-5xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              Editable by design
            </p>
            <h2
              id="cloud-editable-title"
              className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl"
            >
              See what stays editable.
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-300">
              The agent changes the same storyboard, workflow, and timeline you
              can open yourself. The recorded demonstration below shows that
              project structure. Alpha availability for each model or action
              depends on the current hosted deployment.
            </p>
          </header>
          <div className="mx-auto max-w-5xl">
            <HeroDemoPlayer
              mediaBase="/conversation-project"
              priority={false}
              alt="A conversation becomes a storyboard, generated shots, an editable cut, and a saved project"
              caption="Recorded NodeTool project demonstration: the agent builds a storyboard and cut that remain open for revision."
            />
          </div>
        </div>
      </section>

      <section
        id="hosted-boundaries"
        aria-labelledby="hosted-boundaries-title"
        className="rhythm-section"
      >
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
          <header className="lg:col-span-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              Hosted boundaries
            </p>
            <h2
              id="hosted-boundaries-title"
              className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl"
            >
              Know what runs where.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-300">
              Cloud removes the desktop install. It does not turn local models
              into hosted ones or include provider generation charges.
            </p>
          </header>
          <div className="lg:col-span-7">
            <MarketingFacts items={hostedFacts} />
          </div>
        </div>
      </section>

      <section
        id="cloud-alpha-faq"
        aria-labelledby="cloud-alpha-title"
        className="rhythm-section"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <header className="mx-auto max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              Alpha preview
            </p>
            <h2
              id="cloud-alpha-title"
              className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl"
            >
              Before you try the alpha.
            </h2>
          </header>
          <FaqBlock
            surface="cloud"
            heading={null}
            linkToStandalone
            emitSchema
            className="mt-8 px-0"
          />
          <div className="mx-auto mt-12 max-w-3xl border-t border-slate-800 pt-8">
            <h3 className="text-xl font-semibold text-white">Cloud updates</h3>
            <p className="mb-4 mt-2 text-sm leading-relaxed text-slate-300">
              Join the update list if you want release and access changes by
              email.
            </p>
            <CloudWaitlist />
          </div>
        </div>
      </section>

      <MarketingClosingAction
        headingId="cloud-closing-title"
        title="Try the workspace without installing it."
        body="Use Cloud for evaluation and lightweight access while it is in alpha. Download Studio for production work."
        primaryAction={<CloudPrimaryAction />}
        secondaryAction={{ href: "/studio", label: "Download Studio" }}
      />
    </MarketingPageShell>
  );
}
