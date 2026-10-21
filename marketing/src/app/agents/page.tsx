import React from "react";
import { Cpu, Download, Hand, KeyRound, ScrollText } from "lucide-react";
import { SmartDownloadButton } from "../SmartDownloadButton";
import FaqBlock from "../../components/FaqBlock";
import HeroDemoPlayer from "../../components/HeroDemoPlayer";
import MarketingClosingAction from "../../components/MarketingClosingAction";
import MarketingPageShell from "../../components/MarketingPageShell";
import ProductImage from "../../components/ProductImage";
import SubscriptionSection from "../../components/SubscriptionSection";
import AgentRunHero from "../../components/agents/AgentRunHero";
import AgentSurfaceGrid from "../../components/agents/AgentSurfaceGrid";
import McpInstallCommand from "../../components/agents/McpInstallCommand";
import TrackedLink from "../../components/TrackedLink";
import PageUpdated from "@/components/PageUpdated";
import {
  AGENTS_LEAD,
  APPROVAL_MODES,
  APPROVAL_MODES_INTRO,
  CONTROLS,
  LOOP_STAGES,
  MCP_STEPS,
} from "@/data/agentsPage";

const CONTROL_ICONS = {
  "Your models": Cpu,
  "Your keys": KeyRound,
  "A full record": ScrollText,
  "Your hands": Hand,
} as const;

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

function SectionHeader({
  id,
  eyebrow,
  title,
  body,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <header className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
        {eyebrow}
      </p>
      <h2
        id={id}
        className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl"
      >
        {title}
      </h2>
      <p className="mt-4 text-lg leading-relaxed text-slate-300">{body}</p>
    </header>
  );
}

export default function AgentsPage() {
  return (
    <MarketingPageShell>
      <section
        aria-labelledby="agents-hero-title"
        className="pb-16 pt-8 md:pb-24 md:pt-14"
      >
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-12 lg:gap-14 lg:px-8">
          <div className="min-w-0 lg:col-span-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              Open-source creative harness
            </p>
            <h1
              id="agents-hero-title"
              className="mt-4 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-slate-50 sm:text-5xl xl:text-[3.5rem]"
            >
              The open-source creative harness for your agent.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              {AGENTS_LEAD}
            </p>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <AgentsPrimaryAction />
              <a
                href="#connect-agent"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-3 text-sm font-semibold text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-800/70 focus-ring"
              >
                Connect your agent
              </a>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Open source under AGPL-3.0 · Your models and keys · MCP, CLI, and
              API
            </p>
          </div>
          <div className="relative min-w-0 lg:col-span-7">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-blue-500/20 via-sky-500/5 to-transparent blur-3xl"
            />
            <AgentRunHero />
          </div>
        </div>
      </section>

      <SubscriptionSection className="rhythm-section" />

      <section
        id="agent-loop"
        aria-labelledby="agent-loop-title"
        className="rhythm-section"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <SectionHeader
            id="agent-loop-title"
            eyebrow="Inside the harness"
            title="Build. Run. Inspect. Repair."
            body="A chat assistant answers once and stops. Inside the harness, the agent works on a saved workflow, so it can see which step failed and fix that step."
          />
          <div className="mt-12 grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <HeroDemoPlayer
                mediaBase="/hero-flow"
                priority={false}
                alt="NodeTool: one sentence becomes a beat sheet, entities, a storyboard of stills and clips, and a finished cut"
                caption="One sentence becomes a short film. The storyboard and the cut stay open for revision."
              />
            </div>
            <ol className="relative lg:col-span-5">
              <span
                className="absolute bottom-6 left-[1.1875rem] top-6 w-px bg-gradient-to-b from-blue-400/60 via-slate-700 to-blue-400/60"
                aria-hidden
              />
              {LOOP_STAGES.map((stage, index) => (
                <li
                  key={stage.title}
                  className="relative grid grid-cols-[2.5rem_1fr] gap-5 pb-8 last:pb-0"
                >
                  <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-950 font-jetbrains text-sm text-blue-300">
                    {index + 1}
                  </span>
                  <div className="pt-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className="text-lg font-semibold text-white">
                        {stage.title}
                      </h3>
                      <code className="font-jetbrains text-xs text-slate-400">
                        {stage.tool}
                      </code>
                    </div>
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

      <section
        id="agent-surfaces"
        aria-labelledby="agent-surfaces-title"
        className="rhythm-section"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <SectionHeader
            id="agent-surfaces-title"
            eyebrow="What the harness gives the agent"
            title="Eight editors the agent can work in. No export step."
            body="The agent edits the same documents you open in Studio. When it stops, the work is already in the editor."
          />
          <div className="mt-12">
            <AgentSurfaceGrid />
          </div>
        </div>
      </section>

      <section
        id="agent-control"
        aria-labelledby="agent-control-title"
        className="rhythm-section"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <SectionHeader
            id="agent-control-title"
            eyebrow="Your limits"
            title="The harness runs on your models and your keys."
            body="You decide what the agent may use, and you can read everything it did."
          />
          <ul className="mt-12 grid overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 sm:grid-cols-2">
            {CONTROLS.map(({ title, body }) => {
              const Icon = CONTROL_ICONS[title as keyof typeof CONTROL_ICONS];
              return (
              <li
                key={title}
                className="border-slate-800 p-7 [&:not(:first-child)]:border-t sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(even)]:border-l lg:p-9"
              >
                <Icon className="h-5 w-5 text-blue-300" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold text-white">
                  {title}
                </h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-300">
                  {body}
                </p>
              </li>
              );
            })}
          </ul>
          <div className="mt-16">
            <h3
              id="approval-modes-title"
              className="text-2xl font-semibold tracking-tight text-white"
            >
              Choose how much the agent may do on its own.
            </h3>
            <p className="mt-3 max-w-2xl leading-relaxed text-slate-300">
              {APPROVAL_MODES_INTRO}
            </p>
            <dl
              aria-labelledby="approval-modes-title"
              className="mt-8 grid gap-6 sm:grid-cols-3"
            >
              {APPROVAL_MODES.map(({ title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6"
                >
                  <dt className="text-lg font-semibold text-white">{title}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-slate-300">
                    {body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section
        id="connect-agent"
        aria-labelledby="connect-agent-title"
        className="rhythm-section scroll-mt-28"
      >
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
          <header className="lg:col-span-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
              MCP server
            </p>
            <h2
              id="connect-agent-title"
              className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl"
            >
              Put the agent you already use in the harness.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-300">
              MCP is the standard way AI agents connect to outside tools. One
              command gives your coding agent NodeTool&apos;s workflows, image,
              video, and audio generation, and your saved media. You do not need
              Studio installed.
            </p>
          </header>
          <div className="min-w-0 lg:col-span-7">
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-700" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-700" aria-hidden />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-700" aria-hidden />
                <span className="ml-2 font-jetbrains text-xs text-slate-400">
                  terminal
                </span>
              </div>
              <div className="px-4 pt-4">
                <McpInstallCommand placement="terminal" />
              </div>
              <ol className="grid border-t border-slate-800 sm:grid-cols-3">
                {MCP_STEPS.map((step, index) => (
                  <li
                    key={step.title}
                    className="border-slate-800 p-5 [&:not(:first-child)]:border-t sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:border-t-0"
                  >
                    <span className="font-jetbrains text-xs text-blue-300">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-2 font-semibold text-white">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-300">
                      {step.body}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-slate-300">
              For Cursor, Claude Desktop, or another MCP client, run{" "}
              <code className="font-jetbrains text-slate-100">
                nodetool mcp config
              </code>{" "}
              and paste the block it prints.{" "}
              <TrackedLink
                href="https://docs.nodetool.ai/mcp-server"
                target="_blank"
                rel="noopener noreferrer"
                event="Open Docs"
                eventProps={{ placement: "mcp-setup" }}
                className="text-blue-300 underline decoration-blue-300/40 underline-offset-4 hover:text-blue-200 focus-ring"
              >
                Read the MCP setup guide
              </TrackedLink>{" "}
              or see{" "}
              <a
                href="/mcp"
                className="text-blue-300 underline decoration-blue-300/40 underline-offset-4 hover:text-blue-200 focus-ring"
              >
                every tool the MCP server gives your agent
              </a>
              .
            </p>
          </div>
        </div>
        <div className="mx-auto mt-14 max-w-7xl px-6 lg:px-8">
          <ProductImage
            src="/diagrams/mcp-architecture.svg"
            alt="Architecture diagram showing MCP clients connecting to NodeTool tools and editors"
            width={1600}
            height={900}
            caption="The MCP server and the in-app agent call the same tools."
            contain
          />
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
        title="Run your first brief through the harness."
        body="Download Studio and watch the agent build a workflow you can open, change, and run again."
        primaryAction={<AgentsPrimaryAction />}
        secondaryAction={{
          href: "https://docs.nodetool.ai",
          label: "Read the agent docs",
          external: true,
          event: "Open Docs",
          eventProps: { placement: "closing" },
        }}
      />
    <div className="mx-auto max-w-7xl px-6 pb-12 lg:px-8">
      <PageUpdated route="/agents" className="text-sm text-slate-400" />
    </div>
    </MarketingPageShell>
  );
}
