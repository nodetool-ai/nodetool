import type { Metadata } from "next";
import { Download, ArrowRight } from "lucide-react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import JsonLd from "../../components/JsonLd";
import FaqSection from "../../components/FaqSection";
import { breadcrumbSchema, itemListSchema } from "../../lib/jsonld";
import { SmartDownloadButton } from "../SmartDownloadButton";
import { competitors } from "../../data/competitorEntries";

/**
 * `/node-based-ai` — the entity page for the largest non-branded query cluster
 * the site has: 120 variants of "ai node" / "node ai" / "node based ai" /
 * "ai node editor" carrying 11,123 impressions, two thirds of all non-branded
 * impressions, stuck at weighted position 7.5 with 1.18% CTR
 * (docs/SEO_STRATEGY.md § 0.10, finding 2).
 *
 * Every one of those queries used to land on `/`, which has to serve every
 * intent at once and cannot match any single one of them. This page exists to
 * match: the query is the title, the H1, and the first paragraph.
 *
 * The cluster is also intent-ambiguous — searchers arrive meaning Node.js AI
 * libraries, ComfyUI-style graph editors, or "AI nodes" as a concept — so the
 * page disambiguates in its opening section rather than assuming. The internal
 * signal that shaped it: the more specific the variant, the better it converts
 * ("ai node editor" runs 3.87% against the cluster's 1.18%), so each section
 * targets a specific variant instead of restating the head term.
 */

// The brand suffix is the sitewide convention (there is no Metadata title
// template — every page owns its full title), and the smoke suite asserts it.
// The query leads, because early words carry the most weight in a title tag.
const TITLE = "Node-based AI: build AI workflows with nodes — NodeTool";
const DESCRIPTION =
  "What node-based AI is, what a node does, and how to build image, video, audio, and text workflows on a visual canvas. NodeTool is an open-source node-based AI editor that runs on your own keys.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "node based ai",
    "ai node editor",
    "ai nodes",
    "node based ai tools",
    "node based ai workflow",
    "node based ai image generator",
    "node based ai video generator",
    "visual ai workflow builder",
  ],
  alternates: { canonical: "/node-based-ai" },
  openGraph: {
    title: "Node-based AI — build AI workflows with nodes",
    description: DESCRIPTION,
    url: "https://nodetool.ai/node-based-ai",
    type: "website",
  },
};

/** Each entry targets a specific cluster variant, named in `query`. */
const buildables: { query: string; heading: string; body: string; href: string }[] =
  [
    {
      query: "node based ai image generator",
      heading: "Image generation",
      body: "Chain a prompt into a model, then into an upscaler, a background remover, and a compositor. Swap the model node without rebuilding the graph around it.",
      href: "/tasks/text-to-image",
    },
    {
      query: "node based ai video generator",
      heading: "Video generation",
      body: "Take a still into an image-to-video model, cut the result on a timeline, add a voice track, and render — as one graph rather than four tools.",
      href: "/tasks/image-to-video",
    },
    {
      query: "node based ai audio",
      heading: "Audio and voice",
      body: "Speech from text, transcription back out, music beds, and filters. Audio nodes carry real buffers between steps, so nothing round-trips through a file picker.",
      href: "/tasks/text-to-speech",
    },
    {
      query: "ai node workflow / agents",
      heading: "Agents and data",
      body: "Nodes are not only models. Fetch a page, query a database, run sandboxed code, or hand a step to a planning agent that writes its own actions.",
      href: "/agents",
    },
  ];

const faq = [
  {
    question: "What is node-based AI?",
    answer:
      "Node-based AI is a way of building AI work as a graph instead of a prompt. Each node does one job — load an image, call a model, cut a clip, run code — and edges carry data from one node to the next. You can see every step, change one of them, and re-run without redoing the rest.",
  },
  {
    question: "What is a node in AI?",
    answer:
      "A node is one operation with typed inputs and outputs. A text-to-image node takes a prompt and returns an image; an upscale node takes that image and returns a larger one. Because the types are declared, the editor can tell you which nodes fit together before you run anything.",
  },
  {
    question: "How is a node-based AI editor different from a chat assistant?",
    answer:
      "A chat assistant produces one answer per turn and the steps that made it are gone. A node graph keeps the steps: the same workflow re-runs on new inputs, in batch, or on a schedule, and you can change step three without touching steps one and two.",
  },
  {
    question: "Is there a free, open-source node-based AI tool?",
    answer:
      "Yes. NodeTool is open source (AGPL-3.0) and NodeTool Studio is free to run on your own machine. You bring your own provider keys and pay the providers directly, and local models run with no key and no per-image cost at all.",
  },
  {
    question: "Do I need to write code to use node-based AI?",
    answer:
      "No. Building a graph is picking nodes and connecting them. Code is available where it helps — a sandboxed JavaScript node, a TypeScript SDK for authoring workflows as files — but nothing requires it.",
  },
  {
    question: "Does node-based AI mean Node.js?",
    answer:
      "No, and the two get searched for interchangeably. Node-based refers to the graph — boxes and connections on a canvas. NodeTool's backend does happen to run on Node.js and ships a TypeScript SDK, so if you arrived looking for AI in Node.js, the developer docs cover that too.",
  },
];

export default function NodeBasedAiPage() {
  const breadcrumb = breadcrumbSchema([
    { name: "Node-based AI", url: "/node-based-ai" },
  ]);

  // The editors people weigh against each other, so this page answers "node
  // based ai tools" / "best node based ai" with a real list, then hands each
  // one to its own comparison page.
  const editors = competitors.filter((c) => !c.isNew).slice(0, 8);
  const itemList = itemListSchema(
    "Node-based AI editors",
    editors.map((c) => ({
      name: c.name,
      url: `/alternatives/${c.slug}`,
    }))
  );

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <JsonLd data={breadcrumb} />
      <JsonLd data={itemList} />

      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-blue-500/15 blur-[120px]" />
        <div className="absolute top-1/2 -right-24 h-[24rem] w-[24rem] rounded-full bg-fuchsia-500/10 blur-[120px]" />
      </div>

      <SiteHeader />

      <div className="relative isolate pt-28 sm:pt-36">
        {/* Hero — the query is the H1, and the answer is the first paragraph. */}
        <section
          aria-labelledby="nba-title"
          className="mx-auto max-w-3xl px-6 text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
            Node-based AI
          </span>
          <h1
            id="nba-title"
            className="mt-6 text-4xl font-bold tracking-tight text-white md:text-5xl"
          >
            Node-based AI: build workflows with nodes, not prompts.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-white">
            Node-based AI means building AI work as a graph: each node does one
            job, and edges carry data between them. Instead of one prompt and
            one answer, you get a workflow you can see, change a step of, and
            re-run on new inputs. NodeTool is an open-source node-based AI
            editor for image, video, audio, and text that runs on your own keys
            — or fully offline on local models.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <SmartDownloadButton
              icon={<Download className="h-5 w-5" />}
              classNameOverride="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-all hover:bg-blue-500 focus-ring"
            />
            <a
              href="/templates"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-6 py-3.5 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white focus-ring"
            >
              Browse workflow templates <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        {/* Disambiguation — the cluster mixes three different intents. */}
        <section
          aria-labelledby="nba-what-title"
          className="mx-auto mt-20 max-w-3xl px-6"
        >
          <h2
            id="nba-what-title"
            className="text-2xl font-semibold tracking-tight text-white"
          >
            What is a node, and what makes an editor node-based?
          </h2>
          <p className="mt-4 leading-relaxed text-slate-300">
            A node is one operation with typed inputs and outputs. A
            text-to-image node takes a prompt and returns an image. An upscale
            node takes an image and returns a larger one. Because the types are
            declared, the editor knows which nodes can connect before you run
            anything, and it can tell you what is wrong without a failed run.
          </p>
          <p className="mt-4 leading-relaxed text-slate-300">
            An editor is node-based when the graph is the document. The
            workflow is not a transcript of what you asked for — it is a file
            you keep, re-run, hand to someone else, or call as an API. That is
            the difference that matters in practice: a prompt gives you one
            result, a graph gives you a process.
          </p>
          <p className="mt-4 leading-relaxed text-slate-300">
            Three different things get searched for with the same words, so to
            be explicit: this page is about the visual graph. If you came
            looking for AI in Node.js, NodeTool&apos;s backend runs on Node and
            ships a TypeScript SDK — the{" "}
            <a
              href="/developers"
              className="text-blue-300 underline decoration-blue-500/40 underline-offset-2 transition-colors hover:text-blue-200"
            >
              developer pages
            </a>{" "}
            cover that. If you came from ComfyUI, the{" "}
            <a
              href="/alternatives/comfyui"
              className="text-blue-300 underline decoration-blue-500/40 underline-offset-2 transition-colors hover:text-blue-200"
            >
              ComfyUI comparison
            </a>{" "}
            is the direct answer. If you are comparing hosted creative canvases,
            see the{" "}
            <a
              href="/alternatives/figma-weave"
              className="text-blue-300 underline decoration-blue-500/40 underline-offset-2 transition-colors hover:text-blue-200"
            >
              Figma Weave alternative
            </a>{" "}
            or the original{" "}
            <a
              href="/alternatives/weavy"
              className="text-blue-300 underline decoration-blue-500/40 underline-offset-2 transition-colors hover:text-blue-200"
            >
              Weavy comparison
            </a>.
          </p>
        </section>

        {/* What you can build — one block per specific cluster variant. */}
        <section
          aria-labelledby="nba-build-title"
          className="mx-auto mt-20 max-w-5xl px-6"
        >
          <h2
            id="nba-build-title"
            className="text-center text-2xl font-semibold tracking-tight text-white"
          >
            What you can build with AI nodes
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {buildables.map((b) => (
              <a
                key={b.heading}
                href={b.href}
                className="group rounded-2xl border border-slate-800/70 bg-slate-900/40 p-8 transition-colors hover:border-slate-700 focus-ring"
              >
                <h3 className="text-lg font-semibold text-white">
                  {b.heading}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  {b.body}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm text-blue-300 transition-colors group-hover:text-blue-200">
                  See how <ArrowRight className="h-4 w-4" />
                </span>
              </a>
            ))}
          </div>
        </section>

        {/* Editor list — answers "node based ai tools" with the comparison mesh. */}
        <section
          aria-labelledby="nba-editors-title"
          className="mx-auto mt-20 max-w-5xl px-6"
        >
          <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-8 md:p-10">
            <h2
              id="nba-editors-title"
              className="text-2xl font-semibold tracking-tight text-white"
            >
              Node-based AI tools, compared
            </h2>
            <p className="mt-3 leading-relaxed text-slate-400">
              Node editors split into two camps: creative canvases built around
              image and video models, and LLM/agent builders built around text.
              NodeTool covers both, which is why it shows up in either search.
              Each comparison below is honest about where the other tool wins.
            </p>
            <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {editors.map((c) => (
                <li key={c.slug}>
                  <a
                    href={`/alternatives/${c.slug}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-900/40 px-4 py-3 text-sm text-slate-300 transition-colors hover:border-slate-700 hover:text-white focus-ring"
                  >
                    <span>{c.name} alternatives</span>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                      {c.category}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <FaqSection items={faq} />

        <section className="mx-auto my-24 max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Open the canvas and wire up a node.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            NodeTool Studio is free, open source, and runs on your own machine.
            Bring your own keys for hosted models, or run local ones and pay
            nothing per image.
          </p>
          <div className="mt-8 flex justify-center">
            <SmartDownloadButton
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
