import React from "react";
import { Download } from "lucide-react";
import { SmartDownloadButton } from "../SmartDownloadButton";
import FaqBlock from "../../components/FaqBlock";
import GraphToAppSplit from "../../components/GraphToAppSplit";
import HeroDemoPlayer from "../../components/HeroDemoPlayer";
import MarketingClosingAction from "../../components/MarketingClosingAction";
import MarketingFacts, {
  type MarketingFact,
} from "../../components/MarketingFacts";
import MarketingHero from "../../components/MarketingHero";
import MarketingPageShell from "../../components/MarketingPageShell";
import ProductImage from "../../components/ProductImage";

const runFacts: MarketingFact[] = [
  {
    term: "Model choice",
    description:
      "Workflows name the models and providers they call. Change the workflow when another model fits the job better.",
  },
  {
    term: "Provider accounts",
    description:
      "Studio uses the provider credentials you configure. Local models and remote providers keep their own execution boundaries.",
  },
  {
    term: "Recorded execution",
    description:
      "Inspect tool calls, results, errors, and interventions from the run. This is an execution record, not a claim to expose every internal model decision.",
  },
  {
    term: "Supervision",
    description:
      "Permissions, budgets, and approval points apply when they are configured for the run. Ordinary runs should not be described as automatically supervised.",
  },
];

const runStages = [
  {
    title: "Build",
    body: "The agent changes a workflow or project through the same tools available in the editor.",
  },
  {
    title: "Run",
    body: "The workflow calls the configured local models or provider accounts and records the result.",
  },
  {
    title: "Inspect",
    body: "Review tool calls, outputs, errors, and the artifact that changed.",
  },
  {
    title: "Repair",
    body: "Revise the workflow or project, then run the changed path again.",
  },
];

const primaryButtonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition-colors hover:bg-blue-500 focus-ring";

function AgentsPrimaryAction() {
  return (
    <SmartDownloadButton
      labelPrefix="Download Studio"
      icon={<Download className="h-5 w-5" />}
      classNameOverride={primaryButtonClass}
    />
  );
}

export default function AgentsPage() {
  return (
    <MarketingPageShell>
      <MarketingHero
        eyebrow="NodeTool Agents · For builders and operators"
        title="Agents that work in real editors."
        body="Build creative automation that produces editable workflows, apps, and projects. Inspect the execution, revise the work, and reuse the workflow for the next job. Agents work through NodeTool's tools, alongside the editors you use yourself."
        primaryAction={<AgentsPrimaryAction />}
        secondaryAction={{
          href: "https://docs.nodetool.ai",
          label: "Read agent docs",
          external: true,
        }}
        trustLine="Open source · Local or remote models · MCP, CLI, and API entry points"
        headingId="agents-hero-title"
        media={
          <ProductImage
            src="/surface-storyboard-poster.webp"
            alt="NodeTool storyboard with editable shots and the agent's tool actions"
            width={1920}
            height={1080}
            priority
            caption="The storyboard and agent tool record in the same workspace. The artifact stays editable after the action completes."
          />
        }
      />

      <section
        id="agent-loop"
        aria-labelledby="agent-loop-title"
        className="rhythm-section"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <header className="mb-10 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              One operating loop
            </p>
            <h2
              id="agent-loop-title"
              className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl"
            >
              Build. Run. Inspect. Repair.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-300">
              Follow the artifact and its recorded execution through one cycle.
              The editable project is the evidence, not an illustration of an
              unspecified agent.
            </p>
          </header>
          <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <HeroDemoPlayer
                mediaBase="/conversation-project"
                priority={false}
                alt="An agent builds a storyboard and editable project from a brief"
                caption="Recorded project sequence: an agent action produces a storyboard and cut that remain open for inspection and revision."
              />
            </div>
            <ol className="border-y border-slate-800 lg:col-span-5">
              {runStages.map((stage, index) => (
                <li
                  key={stage.title}
                  className="grid grid-cols-[2rem_1fr] gap-4 border-b border-slate-800 py-5 last:border-b-0"
                >
                  <span className="font-jetbrains text-sm text-blue-300">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-semibold text-white">{stage.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-300">
                      {stage.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <GraphToAppSplit />

      <section
        id="agent-control"
        aria-labelledby="agent-control-title"
        className="rhythm-section"
      >
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
          <header className="lg:col-span-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              Run boundaries
            </p>
            <h2
              id="agent-control-title"
              className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl"
            >
              Choose the models. Keep control of the run.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-300">
              The workflow, provider configuration, execution record, and
              resulting artifact remain separate things you can inspect.
            </p>
          </header>
          <div className="lg:col-span-7">
            <MarketingFacts items={runFacts} />
          </div>
        </div>
      </section>

      <section
        id="connect-agent"
        aria-labelledby="connect-agent-title"
        className="rhythm-section"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <header className="mb-10 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              MCP, CLI, and API
            </p>
            <h2
              id="connect-agent-title"
              className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl"
            >
              Connect your own agent.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-300">
              External agents can enter through NodeTool&apos;s documented
              interfaces and operate the same editor and workflow tools. The
              transport does not create a second implementation.
            </p>
          </header>
          <ProductImage
            src="/diagrams/mcp-architecture.svg"
            alt="Architecture diagram showing MCP clients connecting to NodeTool tools and editors"
            width={1600}
            height={900}
            caption="MCP clients connect through NodeTool's MCP server to the editor and workflow toolbelt. See the agent documentation for current setup and permission details."
            contain
          />
          <p className="mt-6 text-sm text-slate-300">
            <a
              href="https://docs.nodetool.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-300 underline decoration-blue-300/40 underline-offset-4 hover:text-blue-200 focus-ring"
            >
              Read the agent and MCP documentation
            </a>
          </p>
        </div>
      </section>

      <section className="rhythm-section" aria-label="Questions before you build">
        <FaqBlock
          surface="agents"
          heading="Questions before you build."
          linkToStandalone
          emitSchema
        />
      </section>

      <MarketingClosingAction
        headingId="agents-closing-title"
        title="Build your first reusable workflow."
        body="Download Studio to build, run, inspect, and reuse agent-operated workflows and projects."
        primaryAction={<AgentsPrimaryAction />}
        secondaryAction={{
          href: "https://docs.nodetool.ai",
          label: "Read agent docs",
          external: true,
        }}
      />
    </MarketingPageShell>
  );
}
