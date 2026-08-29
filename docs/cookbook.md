---
layout: page
title: "NodeTool Creative Cookbook"
description: "Creative workflow patterns worth automating: storyboards, timelines, scripts, sketches, and the graphs that repeat them."
---

The storyboard, timeline, sketch, and script editors are where you make one
thing and judge it. A workflow graph is where you make the same thing again —
for the next brief, the next SKU, the next language, the next aspect ratio.

This cookbook covers the second half: creative work that repeats often enough
to be worth wiring up.

## Surface or graph

| What you are doing | Where it belongs |
|---|---|
| One film, judged shot by shot | [Storyboard]({{ '/creative-agent' | relative_url }}) |
| The same film for forty briefs | [Pattern 1]({{ '/cookbook/patterns' | relative_url }}#pattern-1-brief-to-cut) |
| Trimming, mixing, captioning one cut | [Timeline editor]({{ '/video-editor' | relative_url }}) |
| Every delivery format of that cut | [Pattern 7]({{ '/cookbook/patterns' | relative_url }}#pattern-7-derivatives) |
| Painting a mask, composing a frame | [Sketch editor]({{ '/sketch-editor' | relative_url }}) |
| That composition in twelve styles | [Pattern 5]({{ '/cookbook/patterns' | relative_url }}#pattern-5-sketch-as-control) |
| Writing and hearing back a line | Script editor |
| Re-voicing a script after every copy edit | [Pattern 4]({{ '/cookbook/patterns' | relative_url }}#pattern-4-script-to-voiced-cut) |
| One hero image | Chat, or a single image node |
| Thirty on-brand assets with one cast | [Pattern 3]({{ '/cookbook/patterns' | relative_url }}#pattern-3-entities) |

## Sections

1. [**Core Concepts**]({{ '/cookbook/core-concepts' | relative_url }}) — typed edges, documents as values, fan-out versus chain, and how to check a graph before it spends.
2. [**Creative Patterns**]({{ '/cookbook/patterns' | relative_url }}) — eight patterns, each with its graph, its nodes, and the shipped template closest to it.
3. [**Templates Gallery**]({{ '/templates-gallery' | relative_url }}) — every shipped workflow, runnable from the Examples page.

## Choose a pattern

| I want to… | Pattern | Key nodes |
|---|---|---|
| Turn a brief into a rendered film, unattended | [1 · Brief to cut]({{ '/cookbook/patterns' | relative_url }}#pattern-1-brief-to-cut) | `Director`, `ShotBatch`, `ShotChain`, `RenderTimeline` |
| Gate each shot on a cheap still first | [2 · Shot fan-out]({{ '/cookbook/patterns' | relative_url }}#pattern-2-shot-fan-out) | `ScreenplayShots`, `TextToImage`, `ImageToVideo` |
| Hold one cast and look across a batch | [3 · Entities]({{ '/cookbook/patterns' | relative_url }}#pattern-3-entities) | `ApplyEntities`, `ListGenerator`, `TextToImage` |
| Voice a script and caption the cut | [4 · Script to voiced cut]({{ '/cookbook/patterns' | relative_url }}#pattern-4-script-to-voiced-cut) | `VoiceScript`, `ScriptToTimeline`, `ScriptToSubtitles` |
| Drive generation from a drawn composition | [5 · Sketch as control]({{ '/cookbook/patterns' | relative_url }}#pattern-5-sketch-as-control) | `RenderSketch`, `SketchLayers`, `ImageToImage` |
| Get a gallery of variants from one brief | [6 · Variant fan-out]({{ '/cookbook/patterns' | relative_url }}#pattern-6-variant-fan-out) | `Agent`, `ListGenerator`, `TextToImage`, `Collect` |
| Ship one cut in every required shape | [7 · Derivatives]({{ '/cookbook/patterns' | relative_url }}#pattern-7-derivatives) | `Transcript`, `RenderTimeline`, `Resize`, `AddSubtitles` |
| Handle naming, packaging, subtitle math | [8 · Code node]({{ '/cookbook/patterns' | relative_url }}#pattern-8-code-glue) | `Code` |

## Start from a template

Every pattern names shipped workflows that already implement it. Open the
**Examples** page in the app menu, load one, and edit it — templates are never
modified in place.

- **Direct a Short Film** — brief in, cut film out, no surface interaction.
- **Directed Film to Timeline** — the same trip with a still per shot.
- **Concept Art Iteration Board** — one brief, a gallery of directions.
- **Podcast Repurposing Studio** — one recording, a whole content pack.

## Building a graph

- Press **Space** to open the node menu.
- Drag from an output handle to an input handle to connect.
- Press **Ctrl/⌘ + Enter** to run, and add `Preview` nodes to watch values.
- Run `nodetool validate` before an expensive run; `nodetool debug` after a
  failed one.
