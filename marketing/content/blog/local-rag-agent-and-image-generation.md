---
title: "Local RAG agent plus image generation, end to end"
description: "Index documents into a vector collection, answer questions from them with citations, and render an image from the answer — one NodeTool graph, with the retrieval side running locally."
headline: "Local RAG agent + image generation, end to end"
excerpt: "A vector collection, a retrieval query, an agent that cites its sources — and then the part most RAG tutorials stop before: turning the answer into an image, on the same canvas."
tag: Tutorial
date: 2026-07-28
author: "The NodeTool team"
accent: emerald
ogImage: screen_workflow.png
priority: 0.7
changeFrequency: monthly
---

Most RAG walkthroughs end at a text answer. Real work rarely does — the answer becomes a slide, a diagram, a product shot, something someone looks at. This walkthrough builds both halves on one canvas: retrieval that can run entirely on your machine, and a generation step that turns the answer into an image.

The retrieval half ships as the [Chat With Your Documents template](/templates/chat-with-your-documents), so you can open the finished version and read the wiring. Building it once is worth it, because these five nodes are the backbone of every retrieval workflow you will write afterward.

## What you need

- **NodeTool Studio** on macOS, Windows, or Linux.
- **An embedding model.** `nomic-embed-text` through [Ollama](/models) is a good local default. Nothing leaves the machine.
- **An answer model.** Local through Ollama, MLX, or llama.cpp, or a provider key if you want a bigger model.
- **An image-model key** for the last section. Skip it if you only want the retrieval half.

## Step 1 — create the collection

Add a **Collection** node (`vector.Collection`). A collection is a named vector store: documents in, nearest-neighbor lookups out. Give it a name — `product_docs` — and pick the embedding model it will use.

That choice is sticky. Embeddings from different models are not comparable, so the model that indexes a collection is the model that has to query it. Changing it means re-indexing.

Under the hood the store is a local SQLite database with the sqlite-vec extension. There is no external vector service, no API key for the store itself, and the file sits with the rest of NodeTool's data on your disk.

## Step 2 — index the documents

Add **Index Text Chunk** nodes (`vector.IndexTextChunk`) and wire the Collection output into each. Feed each one a document — from a **String Input** while you are prototyping, or from a file-reading node once you move past pasted text.

Each Index Text Chunk embeds its text and writes the vector into the collection with the text alongside. The shipped template uses three of them for three short documents so the wiring is legible on the canvas.

Past a handful of documents, do the indexing outside the graph:

```bash
nodetool collections create product_docs --embedding-model nomic-embed-text
nodetool collections index product_docs ./docs/*.md ./manuals/*.pdf
nodetool collections query product_docs "battery warranty" -n 5
```

The CLI chunks and indexes files directly, runs in-process against the same local store, and needs no server. Index once there, and the graph only has to query.

## Step 3 — retrieve

Add **Query Text** (`vector.QueryText`) and wire the Collection into it. Add a **String Input** named `search` for the search text and wire that in too. Set the number of results — start at 5.

Query Text embeds the search text with the collection's embedding model and returns the nearest chunks. A detail worth internalizing: the search text does not have to be the user's question. Questions carry framing that embeds poorly. A short topical phrase — `battery warranty coverage` — often retrieves better than *"How long does the warranty last and what does it cover?"*. The template keeps the question and the search term as two separate inputs for exactly that reason.

## Step 4 — assemble the context

Add a **Join** node (`nodetool.text.Join`) and wire the retrieved passages into it. Join concatenates the chunks into a single block of context with a separator between them.

Wire Join into its own **Output** node as well. This is the single most useful debugging habit in retrieval work: when an answer is wrong, the question is almost always *what was the model actually given?*, and this Output answers it without instrumenting anything.

## Step 5 — build the prompt

Add a **Prompt** node (`nodetool.text.Prompt`). It is a template with named slots:

```text
Answer only from the context passages below. If they do not contain the
answer, say so plainly — do not guess or fill gaps from general knowledge.
Cite the passage you used.

Context passages retrieved from the knowledge base:
{{ CONTEXT }}
--------------------
User question:
{{ QUESTION }}
```

Wire Join into `CONTEXT` and a **String Input** named `question` into `QUESTION`.

Keeping the template in its own node is not decoration. The prompt is the part you will edit twenty times, and having it as a visible node means you edit it without touching the wiring — and an agent can rewrite it in place when you ask for a different tone.

## Step 6 — answer

Add an **Agent** node (`nodetool.agents.Agent`) and wire the Prompt into it. Choose your answer model. Locally, a mid-size instruct model through Ollama handles grounded question answering well, because the hard part — knowing the facts — has already been done by retrieval. Wire the Agent into an **Output** node.

Run it. You now have a grounded answer plus, from step 4, the exact context behind it.

## Step 7 — turn the answer into an image

Here is where the canvas earns itself. The answer is text; add a step that makes something out of it.

Add a second **Prompt** node that turns the answer into an image brief — *"Illustrate the following as a clean technical diagram, flat vector style, neutral background: {{ ANSWER }}"* — wire the Agent's output into it, and wire that into **Text To Image** (`nodetool.image.TextToImage`). Pick an image model and wire the result to an **Output**.

That is the whole difference between a RAG demo and a workflow that produces a deliverable. The retrieval nodes, the language model, and the image model are all just nodes on one canvas, and the same graph can keep going: `nodetool.image.Upscale` for print, `nodetool.image.RemoveBackground` for a slide, `nodetool.video.ImageToVideo` if the deliverable moves.

One honest boundary: the retrieval half can be fully local, but the strong image models are provider APIs. That node sends a prompt out. If nothing may leave the machine, stop at the answer — the graph is still useful, and everything up to that point ran on your hardware.

## Making it usable by other people

**Wrap it in a mini app.** Bind `question` and `search` to two text fields, the answer to a Markdown display, and the image to an image widget. Add a Run button. Someone who has never seen a node graph can now use the pipeline, and the graph stays underneath, editable.

**Check it headlessly.** `nodetool validate <id>` catches dangling edges, unselected models, and type mismatches in under a second, before you spend anything. `nodetool debug <id>` runs the graph and writes a bundle with every message, output, and error, which is what to hand an agent when something breaks.

**Let an agent extend it.** Ask for a second collection, a re-ranking step, or a different output format, and the agent edits this graph — it does not replace it. You review a diff on a canvas you already understand.

## Why bother wiring it yourself

Managed RAG products hide these five nodes behind one "knowledge base" toggle, which is fine until retrieval returns the wrong passage and you have no way to see it. Here, every stage is a node with a visible output: what was indexed, what came back, what the model was given, what it said. When an answer is wrong you can point at the node that made it wrong.

That, plus the fact that the whole retrieval side can run with no network at all.

## FAQ

### Does the whole workflow run locally?

The retrieval half can. Embeddings through Ollama and a local answer model through Ollama, MLX, or llama.cpp keep your documents on your machine, and the vector store is a local SQLite database either way. Image generation is the exception: the strong image models are provider APIs, so that node sends a prompt out. If nothing may leave the machine, stop at the answer.

### Where is the vector store kept?

In a local SQLite database with the sqlite-vec extension, inside NodeTool's own data directory. There is no external vector service to run or pay for.

### Can I index a folder of PDFs instead of pasting text?

Yes. The CLI does it in one command — nodetool collections index my_docs *.pdf chunks and indexes files directly — and the same collection is then visible to the vector.QueryText node in the graph.

### How do I stop the agent from making things up?

Two levers. In the prompt, tell it to answer only from the supplied passages and to say so when they do not cover the question. And wire the retrieved context to its own Output node, so you can read what the model was actually given when an answer looks wrong.

## Read next

- [Chat With Your Documents template](/templates/chat-with-your-documents) — The RAG half, ready to run.
- [Local-first solutions](/solutions/local-first) — Running NodeTool without the cloud.
- [Models & providers](/models) — What you can point the nodes at.
- [Download Studio](/studio) — Local models included.
