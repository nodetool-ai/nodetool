import React from "react";
import { Download, Hand, KeyRound, ScrollText, type LucideIcon } from "lucide-react";
import { SmartDownloadButton } from "../SmartDownloadButton";
import FaqBlock from "../../components/FaqBlock";
import MarketingClosingAction from "../../components/MarketingClosingAction";
import MarketingPageShell from "../../components/MarketingPageShell";
import SpecStrip from "../../components/SpecStrip";
import AgentRunHero from "../../components/agents/AgentRunHero";
import AgentSurfaceGrid from "../../components/agents/AgentSurfaceGrid";
import PageUpdated from "@/components/PageUpdated";
import {
  AGENTS_LEAD,
  APPROVAL_MODES,
  APPROVAL_MODES_INTRO,
  CONTROLS,
  LOOP_STAGES,
  VALIDATION_CHECKS,
  VALIDATION_NOTE,
} from "@/data/agentsPage";

const CONTROL_ICONS = {
  record: ScrollText,
  manual: Hand,
  keys: KeyRound,
} satisfies Record<(typeof CONTROLS)[number]["id"], LucideIcon>;

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
              Give Claude Code a creative harness.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              {AGENTS_LEAD}
            </p>
            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <AgentsPrimaryAction />
              <a
                href="/developers#connect-agent"
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

      <section
        id="agent-loop"
        aria-labelledby="agent-loop-title"
        className="rhythm-section"
      >
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <SectionHeader
            id="agent-loop-title"
            eyebrow="Inside the harness"
            title="Build. Validate. Run. Inspect. Repair."
            body="The agent works on a saved workflow. If a step fails, it can inspect the error and revise that step. The example above illustrates this process."
          />
          <div className="mt-12 max-w-3xl">
            <ol className="relative">
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
        id="agent-validation"
        aria-labelledby="agent-validation-title"
        className="rhythm-section"
      >
        <div className="mx-auto grid max-w-7xl gap-10 px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
          <div className="lg:col-span-5">
            <SectionHeader
              id="agent-validation-title"
              eyebrow="Before the paid call"
              title="The graph is checked before it runs."
              body={VALIDATION_NOTE}
            />
          </div>
          <div className="min-w-0 lg:col-span-7">
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-3">
                <code className="font-jetbrains text-xs text-blue-300">
                  validate_workflow
                </code>
                <span className="text-xs text-slate-400">reports</span>
              </div>
              <ul className="divide-y divide-slate-800">
                {VALIDATION_CHECKS.map((check) => (
                  <li
                    key={check}
                    className="px-5 py-4 text-sm leading-relaxed text-slate-200"
                  >
                    {check}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-slate-300">
              Connecting Claude Code, Codex, or Cursor is one command. The
              setup, the CLI, and the HTTP API are on the{" "}
              <a
                href="/developers#connect-agent"
                className="text-blue-300 underline decoration-blue-300/40 underline-offset-4 hover:text-blue-200 focus-ring"
              >
                developers page
              </a>
              .
            </p>
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
            title="You and the agent use the same editors."
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
            title="Every step is on the record."
            body="Read what the agent did, and take the work back at any point."
          />
          <ul className="mt-12 grid overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 md:grid-cols-3">
            {CONTROLS.map(({ id, title, body }) => {
              const Icon = CONTROL_ICONS[id];
              return (
              <li
                key={id}
                className="border-slate-800 p-7 [&:not(:first-child)]:border-t md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:border-t-0 lg:p-9"
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

      <SpecStrip items={["plan", "models", "cost", "source"]} className="rhythm-section" />

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
        title="Ask the agent to build your first workflow."
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
