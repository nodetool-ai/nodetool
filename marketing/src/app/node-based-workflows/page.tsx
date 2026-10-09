import type { Metadata } from "next";
import { Download, ArrowRight } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import JsonLd from "../../components/JsonLd";
import FaqSection from "../../components/FaqSection";
import HeroDemoPlayer from "../../components/HeroDemoPlayer";
import SearchStarter from "../../components/SearchStarter";
import { breadcrumbSchema } from "../../lib/jsonld";
import { SmartDownloadButton } from "../SmartDownloadButton";
import { competitors } from "../../data/competitorEntries";

/**
 * `/node-based-workflows` — the landing page for people searching for
 * "node based workflow", "node based workflow editor" and the tools that
 * offer one. `/node-based-ai` answers what node-based AI is. This page
 * answers why NodeTool's node graph can be trusted with real work, so every
 * section names a mechanism a reader can check.
 *
 * The hero reel (`/hero-nodes`) is rendered from `demo/src/nodeshero/`: one
 * real workflow built, type-checked, run and re-pointed at another model.
 * Every node title, type id, and model name in it, and in the node library
 * below, is a registry entry. Keep the two in step when either changes.
 */

const TITLE = "Node-based workflows for image, video, audio, and text — NodeTool";
const DESCRIPTION =
  "Build node-based AI workflows on a visual canvas. Typed ports, a check before every run, batches and control flow, any model on your own keys, and the same graph from the CLI, an HTTP call, or MCP. Open source.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "node based workflow",
    "node based workflows",
    "node based workflow editor",
    "node based workflow builder",
    "visual workflow editor",
    "node graph editor",
    "ai workflow nodes",
    "node based ai workflow",
  ],
  alternates: { canonical: "/node-based-workflows" },
  openGraph: {
    title: "Node-based workflows — NodeTool",
    description: DESCRIPTION,
    url: "https://nodetool.ai/node-based-workflows",
    type: "website",
  },
};

const linkClass =
  "text-blue-300 underline decoration-blue-500/40 underline-offset-2 transition-colors hover:text-blue-200";

/**
 * Each quality names the mechanism behind it. Sources: typed edges are
 * checked in `validateConnection` (web/src/stores/NodeStore.ts);
 * `nodetool validate` is documented in docs/cli.md; Text To Image routes by
 * the selected model's provider (packages/image-nodes); run surfaces match
 * the /developers page.
 */
const qualities: { heading: string; body: string }[] = [
  {
    heading: "Typed ports",
    body: "Every input and output declares its type: text, image, video, audio, list, and more. The editor checks the types before it accepts a wire, so a video can't land in a text prompt.",
  },
  {
    heading: "A check before you pay",
    body: "nodetool validate reads a graph without running it and reports unknown nodes, missing required fields, mis-typed edges, and model ids that don't exist. A run that costs money starts from a graph that passed.",
  },
  {
    heading: "Every step on screen",
    body: "Each node shows whether it is waiting, running, or done, and holds its own output. When a run goes wrong, you see which step did it and what it produced.",
  },
  {
    heading: "Swap the model, keep the graph",
    body: "Text To Image, Image To Video, and Text To Speech route to whichever provider serves the model you pick. Change Seedream for FLUX or Imagen in one field, and the wires stay where they are.",
  },
  {
    heading: "Batches and control flow",
    body: "For Each runs the steps after it once per item and Collect gathers the results. If, Switch, and Fallback branch. Subgraph folds a group of nodes into one.",
  },
  {
    heading: "Runs outside the canvas",
    body: "The graph you build is the graph you call. Run it with nodetool run, POST to its run endpoint and get JSON back, or hand it to Cursor or Claude Code through the MCP server.",
  },
];

/** The workflow in the hero, node by node. */
const walkthrough: { node: string; type: string; does: string }[] = [
  {
    node: "String List Input",
    type: "nodetool.input.StringListInput",
    does: "Holds the five shot prompts.",
  },
  {
    node: "For Each",
    type: "nodetool.control.ForEach",
    does: "Sends the prompts on one at a time, with an index.",
  },
  {
    node: "Text To Image",
    type: "nodetool.image.TextToImage",
    does: "Turns each prompt into a still with the image model you pick.",
  },
  {
    node: "Image To Video",
    type: "nodetool.video.ImageToVideo",
    does: "Animates each still with the video model you pick.",
  },
  {
    node: "Collect",
    type: "nodetool.control.Collect",
    does: "Waits for all five clips and passes them on as one list.",
  },
  {
    node: "Concatenate Video",
    type: "nodetool.video.Concat",
    does: "Joins the list into one video.",
  },
  {
    node: "Output",
    type: "nodetool.output.Output",
    does: "Returns the cut to the canvas, the CLI, or the API caller.",
  },
];

/** Real registry titles, grouped the way the node menu groups them. */
const library: { group: string; dot: string; nodes: string[] }[] = [
  {
    group: "Image",
    dot: "bg-fuchsia-400",
    nodes: ["Text To Image", "Image To Image", "Upscale Image", "Remove Background", "Segment Image", "Apply Mask", "Compare Images", "Image To 3D"],
  },
  {
    group: "Video",
    dot: "bg-violet-400",
    nodes: ["Text To Video", "Image To Video", "Concatenate Video", "Extract Video Frame", "Extract Audio", "Trim", "Overlay"],
  },
  {
    group: "Audio",
    dot: "bg-sky-400",
    nodes: ["Text To Speech", "Speech to Text", "Text To Music", "Overlay Audio", "Concatenate Audio", "Transcribe"],
  },
  {
    group: "Text and agents",
    dot: "bg-amber-400",
    nodes: ["Agent", "Summarizer", "Extractor", "Classifier", "Structured Output Generator", "Enhance Prompt", "Web Search"],
  },
  {
    group: "Logic, data, and code",
    dot: "bg-cyan-400",
    nodes: ["For Each", "Collect", "If", "Switch", "Fallback", "Subgraph", "Code", "Hybrid Search", "Webhook Trigger"],
  },
];

/** Node editors people compare NodeTool with, each linked to its comparison page. */
const EDITOR_SLUGS = ["comfyui", "n8n", "langflow", "flowise", "dify", "weavy", "figma-weave", "flora"];

const faq = [
  {
    question: "What is a node-based workflow?",
    answer:
      "A node-based workflow is a process drawn as a graph. Each node does one job, such as generating an image or joining clips, and wires carry each node's output into the next one's input. The graph is saved, so the same process runs again on new inputs.",
  },
  {
    question: "How is a node-based workflow different from a list of automation steps?",
    answer:
      "A list runs top to bottom. A graph can split one output into several branches, run a step once per item in a list, and merge results back together, and you can see all of that on one canvas. NodeTool also checks that each wire connects matching types.",
  },
  {
    question: "Do I need to code to build node-based workflows in NodeTool?",
    answer:
      "No. You add nodes from the menu and drag wires between them, or ask the built-in agent to build the graph for you. When you want code, the Code node runs sandboxed JavaScript, and workflows can also be written as TypeScript files.",
  },
  {
    question: "Can I run a node-based workflow without opening the app?",
    answer:
      "Yes. The same workflow runs from the command line with nodetool run, from an HTTP POST to its run endpoint, and from an MCP client such as Cursor or Claude Code.",
  },
  {
    question: "Which AI models can the nodes use?",
    answer:
      "Hosted models from providers such as fal, Replicate, Kie.ai, Together AI, OpenAI, Google, and ElevenLabs on your own keys at their list price, and local models through Ollama, MLX, or llama.cpp with no key.",
  },
  {
    question: "Is NodeTool free?",
    answer:
      "NodeTool is open source under AGPL-3.0, and NodeTool Studio is free to run on macOS, Windows, and Linux. You pay hosted providers directly for the generations you run, and local models cost nothing per run.",
  },
];

export default function NodeBasedWorkflowsPage() {
  const breadcrumb = breadcrumbSchema([
    { name: "Node-based workflows", url: "/node-based-workflows" },
  ]);
  const editors = EDITOR_SLUGS.map((slug) =>
    competitors.find((c) => c.slug === slug)
  ).filter((c): c is (typeof competitors)[number] => c !== undefined);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={breadcrumb} />

      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-[30rem] w-[30rem] rounded-full bg-blue-500/15 blur-[120px]" />
        <div className="absolute top-[30rem] -right-24 h-[26rem] w-[26rem] rounded-full bg-fuchsia-500/10 blur-[120px]" />
      </div>

      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        <section
          aria-labelledby="nbw-title"
          className="mx-auto max-w-4xl px-6 text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
            Node-based workflows
          </span>
          <h1
            id="nbw-title"
            className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-slate-50 sm:text-6xl"
          >
            Node-based workflows you can{" "}
            <span className="bg-gradient-to-r from-rose-400 via-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
              check, run, and rerun
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-slate-300">
            NodeTool is an open-source canvas for node-based AI workflows. Wire
            image, video, audio, and text models into one graph, watch each
            step run, and run the same graph again on new inputs. It works with
            the models you choose, on your own keys or on your own machine.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <SmartDownloadButton
              source="node-based-workflows"
              starter="movie-trailer-generator"
              placement="hero"
              icon={<Download className="h-5 w-5" />}
              classNameOverride="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 focus-ring sm:w-auto"
            />
            <a
              href="/templates"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-6 py-3.5 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white focus-ring sm:w-auto"
            >
              Browse workflow templates <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Free and open source, AGPL-3.0. macOS, Windows, and Linux.
          </p>
        </section>

        <div className="relative mx-auto mt-14 max-w-6xl px-6 sm:mt-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-8 -top-10 bottom-10 -z-10 rounded-[3rem] bg-gradient-to-b from-fuchsia-500/20 via-blue-500/10 to-transparent blur-3xl"
          />
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-2 shadow-2xl shadow-black/70">
            <HeroDemoPlayer
              mediaBase="/hero-nodes"
              alt="A NodeTool workflow is wired, a mismatched wire is refused, five shots run through For Each, Text To Image, Image To Video, Collect, and Concatenate Video into one cut, and the image model is swapped"
            />
          </div>
          <p className="mt-4 text-center text-sm text-slate-400">
            One workflow from wiring to a finished cut. The shots come from the{" "}
            <a href="/storyboards/under-the-bed" className={linkClass}>
              Under the Bed
            </a>{" "}
            example that ships with NodeTool.
          </p>
        </div>

        <section
          aria-labelledby="nbw-qualities-title"
          className="mx-auto mt-24 max-w-6xl px-6"
        >
          <div className="mx-auto max-w-3xl text-center">
            <h2
              id="nbw-qualities-title"
              className="text-3xl font-semibold tracking-tight text-white md:text-4xl"
            >
              A graph you can trust with paid runs
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-300">
              A workflow that touches paid models has to fail early and
              visibly. These are the parts of NodeTool that make that happen.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {qualities.map((q) => (
              <div
                key={q.heading}
                className="rounded-2xl border border-slate-800/70 bg-slate-900/40 p-7"
              >
                <h3 className="text-lg font-semibold text-white">{q.heading}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  {q.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="nbw-walk-title"
          className="mx-auto mt-24 max-w-4xl px-6"
        >
          <h2
            id="nbw-walk-title"
            className="text-2xl font-semibold tracking-tight text-white md:text-3xl"
          >
            The workflow in the video, node by node
          </h2>
          <p className="mt-4 leading-relaxed text-slate-300">
            Seven nodes turn a list of five shot prompts into one edited video.
            Add a sixth prompt and the same graph makes six shots. The{" "}
            <a href="/templates/batch-a-list" className={linkClass}>
              Batch a List
            </a>{" "}
            and{" "}
            <a href="/templates/movie-trailer-generator" className={linkClass}>
              Movie Trailer Generator
            </a>{" "}
            templates are built on the same pattern.
          </p>
          <ol className="mt-8 space-y-3">
            {walkthrough.map((step, i) => (
              <li
                key={step.type}
                className="flex flex-col gap-1 rounded-xl border border-slate-800/70 bg-slate-950/40 px-5 py-4 sm:flex-row sm:items-center sm:gap-5"
              >
                <span className="text-sm font-semibold tabular-nums text-slate-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 sm:w-64">
                  <div className="font-semibold text-white">{step.node}</div>
                  <code className="block truncate text-xs text-slate-500">
                    {step.type}
                  </code>
                </div>
                <p className="text-sm leading-relaxed text-slate-300">
                  {step.does}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <SearchStarter
          starter="movie-trailer-generator"
          source="node-based-workflows"
          heading="Build along: a trailer workflow"
        />

        <section
          aria-labelledby="nbw-library-title"
          className="mx-auto mt-24 max-w-6xl px-6"
        >
          <div className="mx-auto max-w-3xl text-center">
            <h2
              id="nbw-library-title"
              className="text-3xl font-semibold tracking-tight text-white md:text-4xl"
            >
              Hundreds of nodes, one canvas
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-300">
              Ready-made nodes for models, media, data, and files, plus one for
              every model on Replicate, FAL, and Kie.ai. A sample:
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {library.map((g) => (
              <div
                key={g.group}
                className="rounded-2xl border border-slate-800/70 bg-slate-900/40 p-6"
              >
                <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                  <span className={`h-2.5 w-2.5 rounded-full ${g.dot}`} aria-hidden />
                  {g.group}
                </h3>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {g.nodes.map((n) => (
                    <li
                      key={n}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-xs text-slate-300"
                    >
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-6">
              <h3 className="text-base font-semibold text-white">
                Let the agent wire it
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Describe the workflow in a sentence. The built-in agent picks
                the nodes, connects them on the same canvas, and runs them.
                Every node it places stays editable.
              </p>
              <a
                href="/agents"
                className="mt-4 inline-flex items-center gap-1 text-sm text-blue-300 transition-colors hover:text-blue-200"
              >
                How the agent works <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="nbw-compare-title"
          className="mx-auto mt-24 max-w-5xl px-6"
        >
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-8 md:p-10">
            <h2
              id="nbw-compare-title"
              className="text-2xl font-semibold tracking-tight text-white"
            >
              Other node-based workflow tools
            </h2>
            <p className="mt-3 leading-relaxed text-slate-400">
              Node editors are built either around media models or around text
              and automation. NodeTool covers both on one canvas. Each
              comparison says where the other tool is the better fit. New to
              graphs? Start with{" "}
              <a href="/node-based-ai" className={linkClass}>
                what node-based AI is
              </a>
              .
            </p>
            <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {editors.map((c) => (
                <li key={c.slug}>
                  <a
                    href={`/alternatives/${c.slug}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-3 text-sm text-slate-300 transition-colors hover:border-slate-700 hover:text-white focus-ring"
                  >
                    <span>NodeTool vs {c.name}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <FaqSection items={faq} />

        <section className="mx-auto my-24 max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Wire your first workflow.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            NodeTool Studio is free and open source. Start from a template or
            an empty canvas, and bring your own keys or local models.
          </p>
          <div className="mt-8 flex justify-center">
            <SmartDownloadButton
              source="node-based-workflows"
              starter="movie-trailer-generator"
              placement="closing"
              icon={<Download className="h-5 w-5" />}
              classNameOverride="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 focus-ring"
            />
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
