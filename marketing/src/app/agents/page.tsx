import React from "react";
import { Cpu, Download, Hand, KeyRound, ScrollText } from "lucide-react";
import { SmartDownloadButton } from "../SmartDownloadButton";
import FaqBlock from "../../components/FaqBlock";
import HeroDemoPlayer from "../../components/HeroDemoPlayer";
import MarketingClosingAction from "../../components/MarketingClosingAction";
import MarketingPageShell from "../../components/MarketingPageShell";
import ProductImage from "../../components/ProductImage";
import AgentRunHero from "../../components/agents/AgentRunHero";
import AgentSurfaceGrid from "../../components/agents/AgentSurfaceGrid";
import McpInstallCommand from "../../components/agents/McpInstallCommand";
import TrackedLink from "../../components/TrackedLink";

const loopStages = [
  {
    title: "Build",
    tool: "create_workflow",
    body: "The agent adds nodes, picks models, and wires the graph.",
  },
  {
    title: "Run",
    tool: "run_workflow",
    body: "The graph calls your local models and provider accounts.",
  },
  {
    title: "Inspect",
    tool: "get_job_logs",
    body: "Every tool call, output, and error is in the log.",
  },
  {
    title: "Repair",
    tool: "create_workflow_version",
    body: "The fix is a new version. The last good one stays.",
  },
];

const controls = [
  {
    icon: Cpu,
    title: "Your models",
    body: "Run the agent on Claude, GPT, Gemini, or a local model through Ollama. Each node names its own model.",
  },
  {
    icon: KeyRound,
    title: "Your keys",
    body: "Generation bills your provider accounts at their list price. NodeTool sells no credits.",
  },
  {
    icon: ScrollText,
    title: "A full record",
    body: "Read each tool call with its arguments, result, and error. Find the step that went wrong.",
  },
  {
    icon: Hand,
    title: "Your hands",
    body: "Stop the agent, change a node yourself, and hand the work back. It reads the graph as you left it.",
  },
];

const mcpSteps = [
  {
    title: "Install",
    body: "The command finds your agents and writes each config. It needs Node.js 22.",
  },
  {
    title: "Restart the agent",
    body: "Then ask it: “List my NodeTool workflows.”",
  },
  {
    title: "Store your keys",
    body: "Run nodetool secrets store once per provider, such as FAL_API_KEY.",
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
              NodeTool Agents
            </p>
            <h1
              id="agents-hero-title"
              className="mt-4 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-slate-50 sm:text-5xl xl:text-[3.5rem]"
            >
              Your agent builds the workflow. You keep it.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              Hand a brief to the built-in agent or your own coding agent. It
              builds a NodeTool workflow, runs it on your keys, and fixes the
              step that fails. The graph stays saved for you to change and run
              again.
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
              Open source · Your models and keys · MCP, CLI, and API
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
            eyebrow="The loop"
            title="Build. Run. Inspect. Repair."
            body="A chat reply ends when the model stops. An agent in NodeTool works on a graph, so it can read what failed and fix that step."
          />
          <div className="mt-12 grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <HeroDemoPlayer
                mediaBase="/conversation-project"
                priority={false}
                alt="An agent builds a storyboard and an editable project from a brief"
                caption="One brief becomes a storyboard and a cut. Both stay open for revision."
              />
            </div>
            <ol className="relative lg:col-span-5">
              <span
                className="absolute bottom-6 left-[1.1875rem] top-6 w-px bg-gradient-to-b from-blue-400/60 via-slate-700 to-blue-400/60"
                aria-hidden
              />
              {loopStages.map((stage, index) => (
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
            eyebrow="Every editor"
            title="One agent. Six editors. No export step."
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
            eyebrow="Control"
            title="You set the models. You hold the keys."
            body="The agent works inside the limits you give it, and you can read everything it did."
          />
          <ul className="mt-12 grid overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 sm:grid-cols-2">
            {controls.map(({ icon: Icon, title, body }) => (
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
            ))}
          </ul>
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
              Bring the agent you already use.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-300">
              One command gives your coding agent NodeTool&apos;s workflows,
              image, video, and audio generation, and your asset library.
              Studio is optional.
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
                {mcpSteps.map((step, index) => (
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
              </TrackedLink>
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
        title="Give your first brief to an agent."
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
    </MarketingPageShell>
  );
}
