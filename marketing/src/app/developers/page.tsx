import React from "react";
import {
  AudioLines,
  BookOpen,
  Boxes,
  Captions,
  Cpu,
  Film,
  Image as ImageIcon,
  Server,
  Terminal,
  Workflow,
} from "lucide-react";
import FaqBlock from "../../components/FaqBlock";
import MarketingClosingAction from "../../components/MarketingClosingAction";
import MarketingFacts, {
  type MarketingFact,
} from "../../components/MarketingFacts";
import MarketingPageShell from "../../components/MarketingPageShell";
import ProductImage from "../../components/ProductImage";
import McpInstallCommand from "../../components/agents/McpInstallCommand";
import TrackedLink from "../../components/TrackedLink";
import AgentSessionMock from "../../components/developers/AgentSessionMock";
import HeroDemoPlayer from "../../components/HeroDemoPlayer";
import CodeBlock from "../../components/developers/CodeBlock";

const container = "mx-auto max-w-7xl px-6 lg:px-8";
const eyebrowClass =
  "text-xs font-semibold uppercase tracking-[0.18em] text-blue-300";
const h2Class =
  "mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl";
const leadClass = "mt-4 text-lg leading-relaxed text-slate-300";
const primaryLinkClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition-colors hover:bg-blue-500 focus-ring";

const agents = ["Claude Code", "Codex", "OpenCode", "Cursor", "Claude Desktop"];

const asks = [
  {
    icon: ImageIcon,
    kind: "Images",
    prompt:
      "Make three app-icon options for a habit tracker and put them in public/icons.",
    result: "Files in your repo, and a copy of each in the asset library.",
  },
  {
    icon: Film,
    kind: "Video",
    prompt:
      "Animate the hero image into a 5-second silent loop for the page background.",
    result: "A clip from the video model you choose, such as Kling, Veo, or Seedance.",
  },
  {
    icon: AudioLines,
    kind: "Speech",
    prompt: "Voice the onboarding script in docs/onboarding.md with a calm narrator.",
    result: "An audio file for each paragraph, ready to drop into the app.",
  },
  {
    icon: Captions,
    kind: "Transcripts",
    prompt: "Transcribe the demo recording and add chapter markers to the README.",
    result: "Timestamped text that the agent edits into your docs.",
  },
  {
    icon: Workflow,
    kind: "Workflows",
    prompt:
      "Build a workflow that turns any product photo into three lifestyle shots.",
    result: "A saved graph you can open in Studio, change, and run again.",
  },
  {
    icon: Cpu,
    kind: "Models",
    prompt: "Which image models can I use with my keys? Pick one for product photos.",
    result: "A model list from your configured providers, with the agent's pick.",
  },
];

const workflowFacts: MarketingFact[] = [
  {
    term: "Saved, not lost",
    description:
      "Ask the agent to save the steps as a workflow. The prompt, the model, and every setting stay in the graph.",
  },
  {
    term: "Same graph, two editors",
    description:
      "When Studio is open, the agent's edits appear in the canvas as they happen. Change a node by hand and the agent sees it on the next call.",
  },
  {
    term: "Run it again",
    description:
      "Feed the workflow a new input from the canvas, the CLI, or an HTTP call. You do not describe the job again.",
  },
];

const setupSteps = [
  {
    title: "Run the install command",
    body: "It finds Claude Code, Codex, and OpenCode, starts NodeTool once to check it, and writes each config. It needs Node.js 22.",
  },
  {
    title: "Restart your agent",
    body: "Then ask it: \"Use NodeTool to list my workflows.\"",
  },
  {
    title: "Add your provider keys",
    body: "Generation calls your own provider accounts at their list price. Store each key once, for example nodetool secrets store FAL_API_KEY.",
  },
];

const runWorkflowCode = `curl -X POST http://localhost:7777/api/workflows/<id>/run \\
  -H "Authorization: Bearer $NODETOOL_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"params": {"photo": "https://example.com/shoe.jpg"}}'`;

const shipFacts: MarketingFact[] = [
  {
    term: "HTTP",
    description:
      "POST to a workflow's run endpoint and get its outputs back as JSON. Use the WebSocket API to stream progress.",
  },
  {
    term: "CLI",
    description:
      "nodetool run executes a workflow file in a script or a CI job, with no editor open.",
  },
  {
    term: "Your server",
    description:
      "The whole stack is open source under AGPL-3.0. Run it with Docker Compose on your own machine or cloud account.",
  },
];

const deeperLinks = [
  {
    icon: Terminal,
    title: "MCP setup guide",
    body: "Clients, config files, keys, and troubleshooting.",
    href: "https://docs.nodetool.ai/mcp-server",
  },
  {
    icon: Boxes,
    title: "JavaScript sandbox",
    body: "The QuickJS isolate where agent actions and Code nodes run.",
    href: "https://docs.nodetool.ai/javascript-sandbox",
  },
  {
    icon: Workflow,
    title: "Workflow API",
    body: "Run, list, and export workflows over HTTP and WebSocket.",
    href: "https://docs.nodetool.ai/workflow-api",
  },
  {
    icon: BookOpen,
    title: "Custom nodes",
    body: "Write a TypeScript node and use it on the canvas and from code.",
    href: "https://docs.nodetool.ai/developer/",
  },
  {
    icon: Server,
    title: "Self-hosting",
    body: "Deploy the container image on your own infrastructure.",
    href: "https://docs.nodetool.ai/self-hosted-deployment",
  },
];

function NumberedSteps({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="border-y border-slate-800">
      {items.map((item, index) => (
        <li
          key={item.title}
          className="grid grid-cols-[2rem_1fr] gap-4 border-b border-slate-800 py-5 last:border-b-0"
        >
          <span className="font-jetbrains text-sm text-blue-300">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div>
            <h3 className="font-semibold text-white">{item.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">
              {item.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function DevelopersPage() {
  return (
    <MarketingPageShell>
      <section
        aria-labelledby="developers-hero-title"
        className="pb-16 pt-8 md:pb-24 md:pt-12"
      >
        <div className={container}>
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-6">
              <p className={eyebrowClass}>
                NodeTool for developers · MCP server
              </p>
              <h1
                id="developers-hero-title"
                className="mt-4 text-balance text-4xl font-semibold leading-tight tracking-tight text-slate-50 sm:text-5xl lg:text-6xl"
              >
                Your coding agent writes the app. Now it makes the media too.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
                Connect NodeTool to the agent you already use. Ask for images,
                video, speech, or a whole media workflow in plain words. The
                files land in your repo, and the steps stay saved for the next
                run.
              </p>
              <div className="mt-8 max-w-xl">
                <McpInstallCommand placement="hero" />
              </div>
              <ul
                aria-label="Supported agents"
                className="mt-2 flex flex-wrap gap-2"
              >
                {agents.map((agent) => (
                  <li
                    key={agent}
                    className="rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-xs font-medium text-slate-300"
                  >
                    {agent}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm leading-relaxed text-slate-400">
                Open source · Your provider keys at list price · Studio is
                optional
              </p>
            </div>
            <div className="min-w-0 lg:col-span-6">
              <AgentSessionMock />
            </div>
          </div>
        </div>
      </section>

      <section
        id="game-session"
        aria-labelledby="game-session-title"
        className="rhythm-section"
      >
        <div className={container}>
          <header className="mb-10 max-w-3xl">
            <p className={eyebrowClass}>One session</p>
            <h2 id="game-session-title" className={h2Class}>
              A game&apos;s assets, start to finish.
            </h2>
            <p className={leadClass}>
              An agent makes the sprites, backdrops, music, and sound effects
              for Kindle, a 2D platformer. Then it wires them into a level you
              can play in the browser.
            </p>
          </header>
          <div className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/80 p-1.5 shadow-2xl shadow-black/40 ring-1 ring-white/5">
            <HeroDemoPlayer
              mediaBase="/vibe-race"
              priority={false}
              hasSound
              alt="Motion-graphics cut of an agent session that generates the art, music, and sound effects for the Kindle platformer"
              caption="A 36-second motion-graphics cut. Turn the sound on to hear the music and effects. The sprites, backdrops, music, sound effects, and gameplay capture are the files from Kindle's build. The session is sped up."
            />
          </div>
        </div>
      </section>

      <section
        id="what-to-ask"
        aria-labelledby="what-to-ask-title"
        className="rhythm-section"
      >
        <div className={container}>
          <header className="mb-10 max-w-3xl">
            <p className={eyebrowClass}>What to ask</p>
            <h2 id="what-to-ask-title" className={h2Class}>
              Describe the result. The agent picks the tools.
            </h2>
            <p className={leadClass}>
              You do not learn a new API first. These are requests you can type
              into your agent after the install.
            </p>
          </header>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {asks.map((ask) => (
              <li
                key={ask.kind}
                className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-950">
                    <ask.icon className="h-4 w-4 text-blue-300" aria-hidden="true" />
                  </span>
                  <h3 className="text-sm font-semibold text-white">{ask.kind}</h3>
                </div>
                <p className="mt-5 flex-1 text-base leading-relaxed text-slate-100">
                  &ldquo;{ask.prompt}&rdquo;
                </p>
                <p className="mt-5 border-t border-slate-800 pt-4 text-sm leading-relaxed text-slate-400">
                  {ask.result}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="workflows"
        aria-labelledby="workflows-title"
        className="rhythm-section"
      >
        <div className={container}>
          <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-16">
            <header className="lg:col-span-5">
              <p className={eyebrowClass}>Repeatable</p>
              <h2 id="workflows-title" className={h2Class}>
                The prompt that worked stays saved.
              </h2>
              <p className={leadClass}>
                One chat session makes one asset. A workflow makes the next
                hundred. The agent builds the same node graph you can open and
                edit yourself.
              </p>
              <div className="mt-8">
                <MarketingFacts items={workflowFacts} />
              </div>
            </header>
            <div className="lg:col-span-7">
              <ProductImage
                src="/screen_workflow.webp"
                alt="A NodeTool workflow: text inputs and a product photo feed a prompt and an agent node, which drive an image-to-video node"
                width={1600}
                height={1019}
                caption="A product-video workflow in the canvas. The brief, the prompt template, and the model call are nodes you can change and run again."
              />
            </div>
          </div>
        </div>
      </section>

      <section
        id="connect-agent"
        aria-labelledby="connect-agent-title"
        className="rhythm-section scroll-mt-28"
      >
        <div className={`${container} grid gap-10 lg:grid-cols-12 lg:gap-16`}>
          <header className="lg:col-span-5">
            <p className={eyebrowClass}>Setup</p>
            <h2 id="connect-agent-title" className={h2Class}>
              Connected in about a minute.
            </h2>
            <p className={leadClass}>
              NodeTool runs as a local MCP server. You do not need the desktop
              app, a GPU, or an account with us.
            </p>
          </header>
          <div className="min-w-0 lg:col-span-7">
            <McpInstallCommand placement="setup" />
            <div className="mt-4">
              <NumberedSteps items={setupSteps} />
            </div>
            <p className="mt-6 text-sm leading-relaxed text-slate-300">
              Cursor, Claude Desktop, or another MCP client: run{" "}
              <code className="font-jetbrains text-slate-100">
                nodetool mcp config
              </code>{" "}
              and paste the block it prints into the client config.
            </p>
          </div>
        </div>
      </section>

      <section
        id="ship-it"
        aria-labelledby="ship-it-title"
        className="rhythm-section"
      >
        <div className={`${container} grid items-start gap-10 lg:grid-cols-12 lg:gap-16`}>
          <header className="lg:col-span-5">
            <p className={eyebrowClass}>Ship it</p>
            <h2 id="ship-it-title" className={h2Class}>
              Call the workflow from your app.
            </h2>
            <p className={leadClass}>
              A workflow the agent built is also an endpoint. Your app sends
              the input and gets the image, audio, or video back.
            </p>
          </header>
          <div className="min-w-0 lg:col-span-7">
            <div className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950">
              <CodeBlock code={runWorkflowCode} language="bash" />
            </div>
            <div className="mt-6">
              <MarketingFacts items={shipFacts} />
            </div>
          </div>
        </div>
      </section>

      <section
        id="go-deeper"
        aria-labelledby="go-deeper-title"
        className="rhythm-section"
      >
        <div className={container}>
          <header className="mb-10 max-w-3xl">
            <p className={eyebrowClass}>Reference</p>
            <h2 id="go-deeper-title" className={h2Class}>
              When you want to see under the hood.
            </h2>
          </header>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {deeperLinks.map((link) => (
              <li key={link.title}>
                <TrackedLink
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  event="Open Docs"
                  eventProps={{ placement: "developer-guides" }}
                  className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/50 p-5 transition-colors hover:border-slate-600 hover:bg-slate-900 focus-ring"
                >
                  <link.icon className="h-5 w-5 text-blue-300" aria-hidden="true" />
                  <span className="mt-4 font-semibold text-white">
                    {link.title}
                  </span>
                  <span className="mt-1 text-sm leading-relaxed text-slate-400">
                    {link.body}
                  </span>
                </TrackedLink>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rhythm-section" aria-label="Questions before you connect">
        <FaqBlock
          surface="developers"
          heading="Questions before you connect."
          linkToStandalone
          emitSchema
        />
      </section>

      <MarketingClosingAction
        headingId="developers-closing-title"
        title="Give your agent a studio."
        body="One command connects NodeTool to Claude Code, Codex, and OpenCode. Everything it makes stays editable."
        primaryAction={
          <a href="#connect-agent" className={primaryLinkClass}>
            Get the install command
          </a>
        }
        secondaryAction={{
          href: "https://github.com/nodetool-ai/nodetool",
          label: "View on GitHub",
          external: true,
          event: "Star GitHub",
          eventProps: { placement: "closing" },
        }}
      />
    </MarketingPageShell>
  );
}
