import type { OgAccent } from "@/lib/og";
import type { PageEntry } from "./types";

/**
 * Blog / resource-hub page data.
 *
 * Long-form posts are stored the way the rest of the site stores page copy: a
 * typed data module, no MDX pipeline. `bodyMd` is GitHub-flavored Markdown
 * rendered by `react-markdown` + `remark-gfm` (the same pair `FaqBlock` uses),
 * so tables and links work without new dependencies.
 *
 * A `BlogPost` extends PR-1's `PageEntry`, so the hub and every post fold into
 * the sitemap and the smoke walk through `registry.ts` with no other edits.
 */

export const BLOG_BASE = "/blog";

/** Coarse grouping shown on the hub and as the post's chip. */
export type BlogTag = "Comparison" | "Tutorial" | "Deep dive";

export interface BlogPost extends PageEntry {
  slug: string;
  /** H1 on the post page and card title on the hub. */
  headline: string;
  /** Lead paragraph under the H1; also the card summary. */
  excerpt: string;
  tag: BlogTag;
  /** ISO date (YYYY-MM-DD) — drives `datePublished` and the visible byline. */
  date: string;
  /** ISO date of the last substantive edit, when it differs from `date`. */
  updated?: string;
  author: string;
  accent: OgAccent;
  /** Screenshot in `public/` composited into the OG card. */
  ogImage: string;
  /** GitHub-flavored Markdown body. Starts at H2 — the page owns the H1. */
  bodyMd: string;
  /** Rendered as a visible FAQ and emitted as FAQPage JSON-LD. */
  faqs: { question: string; answer: string }[];
  /** Curated "read next" links, rendered at the foot of the post. */
  related: { label: string; href: string; note: string }[];
}

const AUTHOR = "The NodeTool team";

/* ------------------------------------------------------------------ */
/* Posts                                                               */
/* ------------------------------------------------------------------ */

const comparison: BlogPost = {
  route: `${BLOG_BASE}/nodetool-vs-comfyui-vs-n8n-vs-flowise`,
  title:
    "NodeTool vs ComfyUI vs n8n vs Flowise — which node canvas fits the job",
  description:
    "Four node-based tools, four different jobs. Where ComfyUI, n8n, and Flowise are the right pick, where they run out, and what an agent-first creative workspace changes.",
  priority: 0.7,
  changeFrequency: "monthly",
  indexable: true,
  slug: "nodetool-vs-comfyui-vs-n8n-vs-flowise",
  headline: "NodeTool vs ComfyUI vs n8n vs Flowise",
  excerpt:
    "They all draw boxes and arrows, and that is where the similarity ends. A straight read on what each tool is built for, where it runs out, and how to pick.",
  tag: "Comparison",
  date: "2026-07-14",
  author: AUTHOR,
  accent: "blue",
  ogImage: "screen_canvas.png",
  faqs: [
    {
      question: "Can I use NodeTool and ComfyUI together?",
      answer:
        "Yes, and plenty of people do. A common split is to keep a tuned ComfyUI pipeline for a specific diffusion look and use NodeTool for everything around it — the video, the voice, the batch, the delivery. They are both open source and neither takes your files hostage.",
    },
    {
      question: "Is NodeTool trying to replace n8n?",
      answer:
        "No. If the hard part of your job is moving records between SaaS apps on a schedule with retries and branching, n8n is built for exactly that and NodeTool is not. NodeTool is for workflows where the AI output is the deliverable.",
    },
    {
      question: "Which of these are actually open source?",
      answer:
        "ComfyUI and NodeTool are open source — NodeTool under AGPL-3.0. Flowise is source-available under Apache 2.0 with a credit-metered hosted cloud. n8n is fair-code under its Sustainable Use License, which restricts commercial use.",
    },
    {
      question: "What does 'bring your own keys' change in practice?",
      answer:
        "You paste your provider API keys into NodeTool and every model call is billed by that provider at its list price. There is no credit currency in between, so the cost of a run is the cost of the underlying calls, and a new model is usable the day the provider ships it.",
    },
  ],
  related: [
    { label: "NodeTool vs ComfyUI", href: "/vs/comfyui", note: "The head-to-head, feature by feature." },
    { label: "NodeTool vs n8n", href: "/vs/n8n", note: "Where automation ends and generation starts." },
    { label: "NodeTool vs Flowise", href: "/vs/flowise", note: "Chatbot plus the media pipeline around it." },
    { label: "Pricing", href: "/pricing", note: "Free Studio, your keys, provider prices." },
  ],
  bodyMd: `Four tools, one shape. ComfyUI, n8n, Flowise, and NodeTool all show you a canvas, boxes with typed ports, and arrows between them. The shape is where the similarity stops. Each was built to make a different job easy, and picking the wrong one shows up two weeks in, when the thing you actually need turns out to live outside the graph.

This post is the short, honest version. The [full comparison pages](/vs/comfyui) go deeper on each tool; here we put all four next to each other.

## The one-line version

- **ComfyUI** — a diffusion image pipeline exposed down to the sampler and the latents. Unmatched control inside that boundary.
- **n8n** — business automation. Hundreds of app connectors, schedules, retries, branching. AI is a node in someone else's pipeline.
- **Flowise** — the fastest drag-and-drop path from zero to a chatbot that answers from your documents.
- **NodeTool** — an agent-first creative workspace: image, video, audio, and text on one canvas, with a node graph, a video timeline, and a layered sketch editor sharing the same workspace.

## Side by side

| | NodeTool | ComfyUI | n8n | Flowise |
| :--- | :--- | :--- | :--- | :--- |
| Built for | AI-generated media and agent work | Stable Diffusion pipelines | App-to-app automation | LangChain chatbots over documents |
| Media types | Image, video, audio, text | Diffusion images (video via extensions) | Text, data | Text |
| Media generation | Built-in nodes per provider | Native for diffusion | Generic HTTP node | Generic HTTP node |
| Editing tools | Masks, inpaint, outpaint, relight, upscale, layers, compositing | Via extensions | – | – |
| Retrieval / vector store | Built-in \`vector.*\` nodes | – | Via integrations | Built-in |
| Agents that build the workflow | Yes — every editor is an agent tool | Community extensions | AI nodes inside a flow | Agent flows you assemble |
| License | AGPL-3.0 | Open source | Sustainable Use (fair-code) | Apache 2.0, credit-metered cloud |
| Model access | Your own keys, every major provider | Local diffusion checkpoints | Provider integrations | Provider integrations |
| Desktop app | macOS, Windows, Linux | Local install | – | – |
| Local inference | Ollama, MLX, llama.cpp, vLLM, LM Studio | Local by default | Text models via Ollama | Text models via Ollama |

Nothing in that table says one tool wins. It says they answer different questions.

## Where ComfyUI is still the right answer

If the deliverable is a diffusion image and you care about the sampler, the scheduler, the VAE, and the exact ControlNet stack, ComfyUI hands you all of it. Nobody should switch away from a tuned ComfyUI graph for the sake of switching.

The wall is the boundary of the medium. The still becomes a clip, the clip needs a voice, the voice needs music, and each of those steps means leaving the graph. NodeTool keeps that arc on one canvas: \`nodetool.image.TextToImage\` into \`nodetool.video.ImageToVideo\` into \`nodetool.video.Concat\`, with the editing nodes — mask, inpaint, relight, upscale — sitting on the same surface. The trade is control depth for span: NodeTool does not expose latents.

## Where n8n is still the right answer

Nightly sync from Salesforce to a warehouse, with retries, a Slack alert on failure, and an audit trail. That is n8n's home ground, and NodeTool has no ambition there — there is no connector library for hundreds of business SaaS apps.

The difference shows when the workflow has to *produce* something. In n8n, generating a product video means an HTTP node you configured by hand against a provider's REST API, with the polling and the signed URLs your problem. In NodeTool that step is a node with a model picker. Licensing also differs in a way that matters to some teams: n8n's Sustainable Use License is fair-code, not open source. NodeTool is AGPL-3.0.

## Where Flowise is still the right answer

A chatbot over a document set, standing in an afternoon. Vector store, retriever, LLM node, ship. Flowise is genuinely fast at that specific shape.

NodeTool covers the same ground — \`vector.Collection\`, \`vector.IndexTextChunk\`, \`vector.QueryText\`, and an \`nodetool.agents.Agent\` node to answer — and the [Chat With Your Documents template](/templates/chat-with-your-documents) is that pipeline, ready to run. What it adds is everything the deliverable usually grows into: the launch images, the demo video, the voice for the assistant. Those stay on the same canvas instead of moving to a raw HTTP node. Flowise's hosted cloud also meters usage in credits; NodeTool bills nothing for model calls because it never stands between you and the provider.

## The axis the table under-sells: agents

The four tools differ most in something a feature grid renders badly. In NodeTool, every editor is exposed to agents as tools — around 120 of them across the node canvas, sketch pad, storyboard, video timeline, script editor, 3D scene, and app builder. An agent does not sit in a side panel suggesting things; it adds the node and wires it, paints the layer, retimes the clip, places the widget.

That has consequences you feel:

- **Describe, then inspect.** Say what the pipeline should do and the agent authors the graph, picks models, and validates it before anything runs. What it leaves behind is a normal workflow you can edit and rerun — not a black box.
- **An agent on the failure path.** A supervised run puts a model on call when a step fails mid-run: retry, repair the output, skip the item, or stop, inside a decision and cost budget you set, with every intervention logged.
- **Bring your own agent.** The toolbelt is exposed over MCP, so Claude Desktop, Claude Code, or Codex can drive NodeTool with the same tools the built-in chat uses.

None of that is a reason to abandon a working ComfyUI graph. It is the reason the fourth column exists at all.

## The money question

The pricing models are genuinely different, not just differently priced.

Flowise Cloud and most closed canvases sell credits: you buy an internal currency, the platform buys inference, and the spread is the business. n8n Cloud bills per execution. NodeTool Studio is free to download, and in both Studio and Cloud you paste your own provider keys and pay OpenAI, Anthropic, Google, FAL, KIE, Replicate, and the rest directly at their published prices. NodeTool runs no models on its own servers and issues no credits. NodeTool Cloud is a subscription for hosting the same open-source code you could run yourself.

The second-order effect matters more than the percentage. When a provider ships a new model, a credit platform has to negotiate, price, and add it. On your own keys it is a model id in a dropdown the same day.

## How to pick

- Deliverable is a diffusion image and you want the sampler → **ComfyUI**.
- Deliverable is data in another system on a schedule → **n8n**.
- Deliverable is a chatbot over documents, and only that → **Flowise**.
- Deliverable is generated media, or the work spans image, video, audio, and text, or you want an agent that builds and repairs the workflow → **NodeTool**.

You can also just try it. Studio is a normal desktop app for macOS, Windows, and Linux, the [templates library](/templates) has runnable examples for each of these shapes, and connecting one provider key is enough to see whether the canvas fits your work.`,
};

const trailerTutorial: BlogPost = {
  route: `${BLOG_BASE}/build-a-movie-trailer-workflow`,
  title: "Build a movie trailer workflow in NodeTool — step by step",
  description:
    "Turn one logline into a cut teaser. Director writes the shot list, Screenplay Shots turns it into prompts, Text To Image renders keyframes, Image To Video animates them, Concat cuts it.",
  priority: 0.7,
  changeFrequency: "monthly",
  indexable: true,
  slug: "build-a-movie-trailer-workflow",
  headline: "Build a movie trailer workflow in NodeTool",
  excerpt:
    "One logline in, a cut teaser out. We build the graph node by node — Director, Screenplay Shots, Text To Image, Image To Video, Collect, Concat — and explain what each one costs.",
  tag: "Tutorial",
  date: "2026-07-21",
  author: AUTHOR,
  accent: "rose",
  ogImage: "screen_workflow.png",
  faqs: [
    {
      question: "How much does one trailer cost to run?",
      answer:
        "The image-to-video step dominates. Video models are metered per second of generated video, and a six-shot trailer makes six of those calls, so the shot count is the cost dial. The text and image steps are cents by comparison. Every call is billed by the provider on your own key, and NodeTool's cost view shows the per-call spend after a run.",
    },
    {
      question: "Can I swap the models?",
      answer:
        "Yes — that is the point of the graph. Text To Image and Image To Video each carry a model picker, and changing one does not touch the rest of the wiring. Pick a cheaper video model while you iterate on the shot list, then switch back for the final render.",
    },
    {
      question: "Do I need a GPU?",
      answer:
        "Not for this workflow. The models run on the providers' servers and you reach them with your own API keys. A GPU only matters if you later want to run models locally through Ollama, MLX, or llama.cpp.",
    },
    {
      question: "Can an agent build this graph for me?",
      answer:
        "Yes. Describe the pipeline in chat and the agent authors the graph — picks the nodes, wires the edges, selects the models — and validates it before it runs. Starting from the template is faster if you want this exact shape; the agent is better when you want a variation.",
    },
  ],
  related: [
    { label: "Movie Trailer Generator template", href: "/templates/movie-trailer-generator", note: "The finished graph, ready to run." },
    { label: "Movie trailer use case", href: "/use-cases/movie-trailer", note: "What the output looks like." },
    { label: "Video templates", href: "/templates", note: "More video workflows to start from." },
    { label: "Download Studio", href: "/studio", note: "macOS, Windows, Linux." },
  ],
  bodyMd: `A trailer is a structure problem before it is a rendering problem. Shots have to escalate, the look has to hold across every frame, and the cut has to land. This workflow encodes that structure once and then runs it on any logline.

The finished graph ships as the [Movie Trailer Generator template](/templates/movie-trailer-generator) — open it in Studio and you can run it immediately. Building it by hand is worth an hour anyway, because every node here is one you will reuse.

## What you need

- **NodeTool Studio** for macOS, Windows, or Linux. Nothing here needs a GPU.
- **A language-model key** for the Director step (Anthropic, OpenAI, Google, or a local model through Ollama).
- **An image-model key** and **a video-model key**. In the shipped template these are an OpenAI image model and Veo through Google, but the pickers accept anything your keys reach.

Paste keys under Settings → Models & Providers. NodeTool stores them locally and calls each provider directly.

## Step 1 — the inputs

Start a new workflow and double-click the canvas to open the node menu. Add three inputs:

1. **String Input** (\`nodetool.input.StringInput\`) named \`logline\`. One sentence with a situation and a complication: *"A getaway driver speeds onto a bridge as it starts to collapse — and the only way out is to outrun the gap."*
2. **String Input** named \`style\`. This is the style bible, and it does more work than the logline. Something like: *cinematic film still, theatrical key art, anamorphic framing, high-contrast daylight, dust and sparks, handheld telephoto, motion blur.*
3. **Integer Input** (\`nodetool.input.IntegerInput\`) named \`shot_count\`. Start at 4 while you iterate. Each shot is a video call, so this is the cost dial.

Naming inputs matters beyond tidiness: named inputs are what you pass as parameters when the workflow runs from the CLI or the API, and what a mini app binds its widgets to.

## Step 2 — Director writes the shot list

Add a **Director** node (\`nodetool.creative.Director\`). Wire \`logline\` into its prompt input, \`style\` into the style input, and \`shot_count\` into the shot count.

Director is not a thin prompt wrapper. It returns a screenplay: an ordered list of shots, each with camera direction and action, plus one style bible that every shot inherits. That shared bible is what keeps shot 5 in the same film as shot 1 — the usual failure mode of prompt-per-shot pipelines is six beautiful frames from six different movies.

Pick a strong reasoning model here. It is one call, it is cheap relative to the video step, and it decides whether the trailer has a structure.

## Step 3 — Screenplay Shots turns the plan into prompts

Add **Screenplay Shots** (\`nodetool.creative.ScreenplayShots\`) and wire Director's output into it.

This node takes the screenplay and emits one image prompt per shot, merging each shot's action and camera direction with the style bible. Structurally it is the fan-out point: downstream nodes now run once per shot rather than once per workflow. NodeTool's runtime is a message-passing actor model, so a node that receives a stream of items processes each one as it arrives — you do not build a loop.

That is also why previews start appearing while the run is still going. Shot 1 renders while shot 4 is still being written.

## Step 4 — render the keyframes

Add **Text To Image** (\`nodetool.image.TextToImage\`) and wire the prompt output from Screenplay Shots into it. Open its model picker and choose an image model your key reaches.

Every shot prompt now becomes a keyframe. Run the workflow at this point, before wiring anything else — this is the cheap checkpoint. Look at the frames: if they do not feel like one film, fix the \`style\` input, not the prompts. The style bible is the lever.

While you are here, this is the natural place to add editing nodes if you want them. \`nodetool.image.Upscale\` before the video step, or \`nodetool.image.Relight\` to push the key light in one direction across every shot.

## Step 5 — animate each frame

Add **Image To Video** (\`nodetool.video.ImageToVideo\`) and wire the image output into it. Choose a video model in the picker.

Read the meter before you run this. Video models bill per second of generated video, and this node fires once per shot — six shots is six calls. Keep \`shot_count\` low and the duration short while you are still finding the look. Nothing else in this graph is close to it in cost.

## Step 6 — collect and cut

Two nodes finish the pipeline:

1. **Collect** (\`nodetool.control.Collect\`) gathers the per-shot clips streaming out of Image To Video back into a single ordered list. Fan-out started at Screenplay Shots; this is where it closes.
2. **Concat** (\`nodetool.video.Concat\`) joins the list into one video in shot order.

Wire Concat into an **Output** node (\`nodetool.output.Output\`) so the result is a named result of the workflow rather than a preview that disappears.

## Step 7 — run it, then tune it

Hit run. Node previews fill in live: the screenplay text, then keyframes, then clips, then the assembled cut.

Where to spend your iteration time, in order:

- **The style bible.** Consistency lives here. One extra clause about lens and light does more than rewriting six prompts.
- **The shot count.** Four shots that escalate beat eight that meander, and four costs half as much.
- **The logline.** Trailers need a complication, not a premise. "A driver on a bridge" is a setting; "the bridge is collapsing and the gap is widening" is a trailer.
- **The models.** Swap the video model while iterating and swap it back for the final render. The graph does not change.

## Taking it further

**Cut it properly.** Open the result in NodeTool's multi-track timeline, drop a music bed under it, and retime the shots. Clips on the timeline can stay bound to the workflow that made them, so changing a parameter regenerates the clip in place.

**Wrap it in a mini app.** Bind \`logline\`, \`style\`, and \`shot_count\` to three widgets and a Run button, and hand a teammate a focused tool instead of a canvas. The graph stays underneath, editable.

**Run it headlessly.** \`nodetool workflows run <id> --params '{"logline":"..."}'\` runs the same graph from the terminal, which is how you batch a dozen concepts overnight. Add \`--supervise\` and an agent handles a failed shot mid-run — retry, skip, or stop — inside a cost budget you set.

**Start from the storyboard instead.** If you would rather direct the shots yourself, the storyboard editor gives you shots you write and revise by hand, with the same render path underneath.

Every model call above ran on your own key at the provider's price. Swap any node for a different provider and the rest of the graph does not notice — that is the whole reason to build it this way.`,
};

const ragTutorial: BlogPost = {
  route: `${BLOG_BASE}/local-rag-agent-and-image-generation`,
  title: "Local RAG agent plus image generation, end to end",
  description:
    "Index documents into a vector collection, answer questions from them with citations, and render an image from the answer — one NodeTool graph, with the retrieval side running locally.",
  priority: 0.7,
  changeFrequency: "monthly",
  indexable: true,
  slug: "local-rag-agent-and-image-generation",
  headline: "Local RAG agent + image generation, end to end",
  excerpt:
    "A vector collection, a retrieval query, an agent that cites its sources — and then the part most RAG tutorials stop before: turning the answer into an image, on the same canvas.",
  tag: "Tutorial",
  date: "2026-07-28",
  author: AUTHOR,
  accent: "emerald",
  ogImage: "screen_workflow.png",
  faqs: [
    {
      question: "Does the whole workflow run locally?",
      answer:
        "The retrieval half can. Embeddings through Ollama and a local answer model through Ollama, MLX, or llama.cpp keep your documents on your machine, and the vector store is a local SQLite database either way. Image generation is the exception: the strong image models are provider APIs, so that node sends a prompt out. If nothing may leave the machine, stop at the answer.",
    },
    {
      question: "Where is the vector store kept?",
      answer:
        "In a local SQLite database with the sqlite-vec extension, inside NodeTool's own data directory. There is no external vector service to run or pay for.",
    },
    {
      question: "Can I index a folder of PDFs instead of pasting text?",
      answer:
        "Yes. The CLI does it in one command — nodetool collections index my_docs *.pdf chunks and indexes files directly — and the same collection is then visible to the vector.QueryText node in the graph.",
    },
    {
      question: "How do I stop the agent from making things up?",
      answer:
        "Two levers. In the prompt, tell it to answer only from the supplied passages and to say so when they do not cover the question. And wire the retrieved context to its own Output node, so you can read what the model was actually given when an answer looks wrong.",
    },
  ],
  related: [
    { label: "Chat With Your Documents template", href: "/templates/chat-with-your-documents", note: "The RAG half, ready to run." },
    { label: "Local-first solutions", href: "/solutions/local-first", note: "Running NodeTool without the cloud." },
    { label: "Models & providers", href: "/models", note: "What you can point the nodes at." },
    { label: "Download Studio", href: "/studio", note: "Local models included." },
  ],
  bodyMd: `Most RAG walkthroughs end at a text answer. Real work rarely does — the answer becomes a slide, a diagram, a product shot, something someone looks at. This walkthrough builds both halves on one canvas: retrieval that can run entirely on your machine, and a generation step that turns the answer into an image.

The retrieval half ships as the [Chat With Your Documents template](/templates/chat-with-your-documents), so you can open the finished version and read the wiring. Building it once is worth it, because these five nodes are the backbone of every retrieval workflow you will write afterward.

## What you need

- **NodeTool Studio** on macOS, Windows, or Linux.
- **An embedding model.** \`nomic-embed-text\` through [Ollama](/models) is a good local default. Nothing leaves the machine.
- **An answer model.** Local through Ollama, MLX, or llama.cpp, or a provider key if you want a bigger model.
- **An image-model key** for the last section. Skip it if you only want the retrieval half.

## Step 1 — create the collection

Add a **Collection** node (\`vector.Collection\`). A collection is a named vector store: documents in, nearest-neighbor lookups out. Give it a name — \`product_docs\` — and pick the embedding model it will use.

That choice is sticky. Embeddings from different models are not comparable, so the model that indexes a collection is the model that has to query it. Changing it means re-indexing.

Under the hood the store is a local SQLite database with the sqlite-vec extension. There is no external vector service, no API key for the store itself, and the file sits with the rest of NodeTool's data on your disk.

## Step 2 — index the documents

Add **Index Text Chunk** nodes (\`vector.IndexTextChunk\`) and wire the Collection output into each. Feed each one a document — from a **String Input** while you are prototyping, or from a file-reading node once you move past pasted text.

Each Index Text Chunk embeds its text and writes the vector into the collection with the text alongside. The shipped template uses three of them for three short documents so the wiring is legible on the canvas.

Past a handful of documents, do the indexing outside the graph:

\`\`\`bash
nodetool collections create product_docs --embedding-model nomic-embed-text
nodetool collections index product_docs ./docs/*.md ./manuals/*.pdf
nodetool collections query product_docs "battery warranty" -n 5
\`\`\`

The CLI chunks and indexes files directly, runs in-process against the same local store, and needs no server. Index once there, and the graph only has to query.

## Step 3 — retrieve

Add **Query Text** (\`vector.QueryText\`) and wire the Collection into it. Add a **String Input** named \`search\` for the search text and wire that in too. Set the number of results — start at 5.

Query Text embeds the search text with the collection's embedding model and returns the nearest chunks. A detail worth internalizing: the search text does not have to be the user's question. Questions carry framing that embeds poorly. A short topical phrase — \`battery warranty coverage\` — often retrieves better than *"How long does the warranty last and what does it cover?"*. The template keeps the question and the search term as two separate inputs for exactly that reason.

## Step 4 — assemble the context

Add a **Join** node (\`nodetool.text.Join\`) and wire the retrieved passages into it. Join concatenates the chunks into a single block of context with a separator between them.

Wire Join into its own **Output** node as well. This is the single most useful debugging habit in retrieval work: when an answer is wrong, the question is almost always *what was the model actually given?*, and this Output answers it without instrumenting anything.

## Step 5 — build the prompt

Add a **Prompt** node (\`nodetool.text.Prompt\`). It is a template with named slots:

\`\`\`text
Answer only from the context passages below. If they do not contain the
answer, say so plainly — do not guess or fill gaps from general knowledge.
Cite the passage you used.

Context passages retrieved from the knowledge base:
{{ CONTEXT }}
--------------------
User question:
{{ QUESTION }}
\`\`\`

Wire Join into \`CONTEXT\` and a **String Input** named \`question\` into \`QUESTION\`.

Keeping the template in its own node is not decoration. The prompt is the part you will edit twenty times, and having it as a visible node means you edit it without touching the wiring — and an agent can rewrite it in place when you ask for a different tone.

## Step 6 — answer

Add an **Agent** node (\`nodetool.agents.Agent\`) and wire the Prompt into it. Choose your answer model. Locally, a mid-size instruct model through Ollama handles grounded question answering well, because the hard part — knowing the facts — has already been done by retrieval. Wire the Agent into an **Output** node.

Run it. You now have a grounded answer plus, from step 4, the exact context behind it.

## Step 7 — turn the answer into an image

Here is where the canvas earns itself. The answer is text; add a step that makes something out of it.

Add a second **Prompt** node that turns the answer into an image brief — *"Illustrate the following as a clean technical diagram, flat vector style, neutral background: {{ ANSWER }}"* — wire the Agent's output into it, and wire that into **Text To Image** (\`nodetool.image.TextToImage\`). Pick an image model and wire the result to an **Output**.

That is the whole difference between a RAG demo and a workflow that produces a deliverable. The retrieval nodes, the language model, and the image model are all just nodes on one canvas, and the same graph can keep going: \`nodetool.image.Upscale\` for print, \`nodetool.image.RemoveBackground\` for a slide, \`nodetool.video.ImageToVideo\` if the deliverable moves.

One honest boundary: the retrieval half can be fully local, but the strong image models are provider APIs. That node sends a prompt out. If nothing may leave the machine, stop at the answer — the graph is still useful, and everything up to that point ran on your hardware.

## Making it usable by other people

**Wrap it in a mini app.** Bind \`question\` and \`search\` to two text fields, the answer to a Markdown display, and the image to an image widget. Add a Run button. Someone who has never seen a node graph can now use the pipeline, and the graph stays underneath, editable.

**Check it headlessly.** \`nodetool validate <id>\` catches dangling edges, unselected models, and type mismatches in under a second, before you spend anything. \`nodetool debug <id>\` runs the graph and writes a bundle with every message, output, and error, which is what to hand an agent when something breaks.

**Let an agent extend it.** Ask for a second collection, a re-ranking step, or a different output format, and the agent edits this graph — it does not replace it. You review a diff on a canvas you already understand.

## Why bother wiring it yourself

Managed RAG products hide these five nodes behind one "knowledge base" toggle, which is fine until retrieval returns the wrong passage and you have no way to see it. Here, every stage is a node with a visible output: what was indexed, what came back, what the model was given, what it said. When an answer is wrong you can point at the node that made it wrong.

That, plus the fact that the whole retrieval side can run with no network at all.`,
};

const deepDive: BlogPost = {
  route: `${BLOG_BASE}/agent-first-privacy-first-ai-workspace`,
  title:
    "The agent-first, privacy-first AI workspace — what it means in practice",
  description:
    "Agent-first means the whole app is the toolbelt, not a chat panel bolted on. Privacy-first means your keys, files, and workflows stay yours. Here is how both work in NodeTool.",
  priority: 0.7,
  changeFrequency: "monthly",
  indexable: true,
  slug: "agent-first-privacy-first-ai-workspace",
  headline: "What an agent-first, privacy-first AI workspace actually means",
  excerpt:
    "Two claims that are easy to print on a landing page and hard to build. What each one costs to do properly, and how to check whether a tool has done it.",
  tag: "Deep dive",
  date: "2026-08-04",
  author: AUTHOR,
  accent: "violet",
  ogImage: "screen_chat.png",
  faqs: [
    {
      question: "Is 'agent-first' just a chat sidebar with a better prompt?",
      answer:
        "The test is what the agent leaves behind. If it returns text you then act on, the agent is a suggestion box. If it acts on the same surfaces you use — adds the node and wires it, paints the layer, retimes the clip — and the result is an artifact you can inspect and edit, the app was built as a toolbelt.",
    },
    {
      question: "Can I use my own agent instead of the built-in one?",
      answer:
        "Yes. The toolbelt is exposed over MCP, so Claude Desktop, Claude Code, Codex, or any MCP-aware agent gets the same tools the built-in chat uses. Run nodetool mcp install for CLI agents, or install the .mcpb bundle for Claude Desktop.",
    },
    {
      question: "Does privacy-first mean everything runs offline?",
      answer:
        "No, and any tool claiming otherwise while calling hosted models is misleading you. It means the workspace does not add a hop: your keys are stored locally, your files and workflows sit on your disk, and calls go straight to the provider you chose. Choosing local models through Ollama, MLX, or llama.cpp is what makes a run fully offline.",
    },
    {
      question: "What happens to my workflows if NodeTool disappears?",
      answer:
        "They stay on your disk, and the source is AGPL-3.0. You can self-host the same code NodeTool Cloud runs, export workflows and their assets as a portable bundle, and keep working. That is the point of the license, not a footnote to it.",
    },
  ],
  related: [
    { label: "Agents in NodeTool", href: "/agents", note: "The toolbelt, and what it can drive." },
    { label: "Local-first", href: "/solutions/local-first", note: "Running with nothing leaving the machine." },
    { label: "Pricing", href: "/pricing", note: "Your keys, provider prices, no credits." },
    { label: "Templates", href: "/templates", note: "Runnable starting points." },
  ],
  bodyMd: `Two phrases show up on a lot of AI landing pages right now: *agent-first* and *privacy-first*. Both are cheap to print and expensive to build. This is what each one costs when a tool actually does it, and how to tell from the outside whether one has.

## Agent-first means the app is the toolbelt

The common pattern is a chat panel docked to the side of an editor. You describe what you want, the model writes back instructions, and you carry them out by hand. That is an assistant. It helps, and it is not what agent-first means.

Agent-first means the application was built as a set of tools an agent can call, and the human UI and the agent use the same set. In NodeTool that is around 120 tools spanning the node canvas, the layered sketch pad, the storyboard, the multi-track video timeline, the script editor, the 3D scene, and the app builder. If you can click it, an agent can drive it: add a node and wire it, paint on a layer and set its blend mode, cut and retime a clip, revise a shot, voice a script line, place a widget.

The consequence is what the agent leaves behind. Ask for a pipeline and you get a workflow — nodes, edges, model selections — sitting on a canvas you can open, read, edit, and rerun. Not a hidden chain. Not a prompt someone else owns. If the agent made a choice you dislike, you change that node.

### Building is only half of it

An agent that can build but not check its work produces confident garbage. The parts that make it usable are the unglamorous ones:

- **It validates before it runs.** A static check catches unknown node types, missing required properties, unselected models, dangling and mis-typed edges, and model ids a provider does not actually offer — in well under a second, before a single paid call. A graph a planner hallucinated gets rejected at creation time rather than failing halfway through a run you already paid for.
- **It can read its own failures.** Every surface is drivable headlessly. \`nodetool debug\` runs a workflow and writes a bundle with every message, log, output, and error plus a verdict. \`nodetool app debug\` replays a mini app's interactions and reports what each widget ended up showing. The agent reads the same report you would.
- **It is on the failure path.** A supervised run puts a model on call when a step fails mid-run: retry, repair the output, skip the item, or stop — bounded by a decision count and a dollar cap you set, with every intervention logged and attributed to the run.
- **It asks instead of guessing.** When a job is missing something only you can decide — a name, permission to delete, a choice between two node types — it stops and asks.
- **It gets graded.** Mini apps built by an agent go through spec, plan, author, check, run, and judge stages, and a bundle is only handed back when the interactions actually do what the prompt asked. No passing verdict, no app.

### Bring your own agent

Because the toolbelt is a real interface rather than an internal shortcut, it is exposed over MCP. Point Claude Desktop, Claude Code, Codex, or any MCP-aware agent at NodeTool and it gets the same tools the built-in chat uses. That is the strongest evidence that agent-first is structural here and not a feature name: the agent is swappable, including for one built by someone else.

## Privacy-first means no extra hop

The second phrase gets abused harder. Plenty of tools that call hosted models on their own servers describe themselves as private. Be concrete about what is actually being claimed.

In NodeTool:

- **Your keys are yours.** You paste provider API keys and they are stored locally by the desktop app. Calls go from your machine to the provider you chose. NodeTool does not proxy them, does not run models on its own servers, and does not sit in the billing path.
- **Your files are yours.** Workflows, assets, and the vector store live on your disk. The document search index is a local SQLite database, not a hosted service.
- **Local inference is a first-class option.** Ollama, MLX on Apple Silicon, llama.cpp, vLLM, and LM Studio are model providers like any other. A workflow whose model nodes all point at local models runs with nothing leaving the machine.
- **The source is AGPL-3.0.** Nothing is held back for a paid tier. NodeTool Cloud is managed hosting of the same code, and you can self-host it any time.

And the honest boundary, because a privacy claim without one is a marketing claim: if you point a node at a hosted model, that call leaves your machine and the provider's terms apply. What NodeTool controls is that there is no additional hop, no additional retention, and no vendor between you and the model you chose. What runs locally is what you decide to run locally.

### Why pricing and privacy are the same question

Credit systems are the mechanism behind both problems. To sell credits, a platform has to stand between you and the provider: it buys the inference, so it sees the traffic, and it curates which models exist because each one has to be priced into the currency.

Bring-your-own-keys removes the intermediary from both sides at once. You pay OpenAI, Anthropic, Google, FAL, KIE, Replicate, and the rest directly at list price, with no markup and no credit currency, and the same directness is why the call is private. When a provider ships a new model, it is a model id in a dropdown that day rather than a roadmap item on someone else's board.

## Where this shows up in the work

The abstractions are only worth anything if they change what a day looks like.

**Describe, then correct.** You say what you want; the agent builds it; you fix the two nodes it got wrong. That loop is faster than either extreme — faster than placing forty nodes by hand, and far more controllable than re-prompting a black box until it behaves.

**Nothing is a dead end.** Every artifact is inspectable. A generated workflow is a normal workflow. A mini app is a document over a graph you can open. A timeline clip stays bound to the workflow that made it, so changing a parameter regenerates the clip in place.

**Cost is visible before it is spent.** Static validation is free and fast, so the expensive run is the last step rather than the first. After a run, per-call token and cost records show where the money went — including what a supervising agent spent making decisions.

**Provider risk is a swap, not a migration.** If a provider raises prices or deprecates a model, you change one node. The rest of the graph does not know the difference. That is only possible because the workspace never made itself the middleman.

## How to evaluate any tool making these claims

Four questions that cut through the copy:

1. **What does the agent leave behind?** An editable artifact, or text you have to act on yourself?
2. **Can the agent check its own work?** Is there a headless way to validate and run a thing and get a verdict — one you can also run yourself?
3. **Whose key made that call?** If you cannot see the key or the provider's own invoice, there is a middleman.
4. **What happens if the company disappears?** If the answer is not "I keep running the same software", the workspace was never yours.

NodeTool's answers are: a workflow on a canvas; yes, and it is the same CLI you use; yours; and you keep running it, because it is AGPL-3.0 and already on your machine.

If you want to check that rather than take it on faith, [download Studio](/studio), open a [template](/templates), and watch which machine does what.`,
};

export const blogPosts: BlogPost[] = [
  deepDive,
  ragTutorial,
  trailerTutorial,
  comparison,
];

/** Newest first — the order the hub renders. */
export const postsByDate: BlogPost[] = [...blogPosts].sort((a, b) =>
  b.date.localeCompare(a.date),
);

export function getPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

export const blogTags: BlogTag[] = ["Tutorial", "Comparison", "Deep dive"];

export function postsForTag(tag: BlogTag): BlogPost[] {
  return postsByDate.filter((p) => p.tag === tag);
}

/** Reading time in whole minutes at 220 wpm, floored at 1. */
export function readingMinutes(post: BlogPost): number {
  const words = post.bodyMd.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

/** "14 July 2026" — stable across locales because the format is explicit. */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Two other posts to surface at the foot of a post. */
export function siblingPosts(slug: string): BlogPost[] {
  return postsByDate.filter((p) => p.slug !== slug).slice(0, 2);
}

/** Registry entries: the `/blog` hub plus one page per post. */
export const blogPageEntries: PageEntry[] = [
  {
    route: BLOG_BASE,
    title: "Blog — NodeTool",
    description:
      "Tutorials, comparisons, and deep dives on building AI workflows in NodeTool: agents that build graphs, local RAG, video pipelines, and running on your own keys.",
    priority: 0.7,
    changeFrequency: "weekly",
    indexable: true,
  },
  ...postsByDate.map(
    (p): PageEntry => ({
      route: p.route,
      title: p.title,
      description: p.description,
      priority: p.priority,
      changeFrequency: p.changeFrequency,
      indexable: p.indexable,
    }),
  ),
];
