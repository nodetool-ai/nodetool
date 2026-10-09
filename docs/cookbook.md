---
layout: page
title: "NodeTool Cookbook"
description: "Recipes for what people make in NodeTool: product films, ads, short films, explainers, images, 3D sets, games, mini apps, and the workflows that repeat them."
---

Each recipe starts from the thing you want at the end, such as a launch film,
a set of ads, or a playable game. It names where to start, what the agent does,
and which editor you finish in.

Most recipes start the same way. You write a brief in chat or pick a guided
flow, the agent builds the project, and you review it in an editor. You can
change any part by hand or send the agent a note about one shot. When the same
job comes back every week, the last section turns it into a workflow that runs
without you.

## How a recipe runs

1. **Start.** Open **New project** and type the brief, or pick a
   [guided flow]({{ '/guided-flows' | relative_url }}). In
   [chat]({{ '/global-chat' | relative_url }}), type `/` to pick the skill a
   recipe names. The agent then follows that skill's steps for the request.
2. **Attach what is real.** Type `@` to attach a product photo, a logo, or an
   [entity]({{ '/entities' | relative_url }}) such as a recurring character.
   Generations use its reference image, so the cast and product stay the same
   across shots.
3. **Watch and approve.** The plan, each tool call, and each render appear as
   they run. The thread's
   [permission mode]({{ '/global-chat' | relative_url }}#permission-modes)
   decides which actions ask first. Plan mode proposes the steps without
   running them.
4. **Finish in the editor.** The result is a storyboard, timeline, sketch,
   3D model, game, or app that you can open and edit, not a single exported
   file.

> Recipes run on your own provider keys, local models, or hosted credits.
> Storyboards render cheap stills before they spend on video, and NodeTool
> records what each provider call cost. See [Costs & Credits]({{ '/costs-and-credits' | relative_url }}).
{: .callout-tip}

## Video recipes

| You want | Start with | You finish in |
|---|---|---|
| A launch film from a product page | `/launch-commercial` and the page URL | Storyboard, then timeline |
| A polished product film or brand spot | `/product-commercial`, or the **Storyboard** flow | Storyboard, then timeline |
| A phone-shot creator ad or testimonial | `/ugc-video` | Timeline |
| A 15-second sound-off ad from real screenshots | `/motion-ad` | Timeline |
| A narrated explainer | **Script** flow, or `/script-video` | Script, then timeline |
| A short film, scene, or trailer | **Storyboard** flow, or `/short-film` | Storyboard, then timeline |
| Your version of an ad you saw | `/video-clone` with the reference video | Storyboard, then timeline |
| A campaign: one cast, stills, several cuts | `/launch-kit` | Entities, storyboards, timelines |
| A fix to a shot that is already cut | `/nodetool-video-post` | Timeline |

### Launch film from a product page

Paste the product URL after `/launch-commercial`. The agent reads the page,
writes a beat sheet, boards the shots with the product as a reference, renders
stills and clips, adds voice and music, and assembles the cut. The project
reports what it cost. Open the storyboard to swap a shot before the clips
render, or the [timeline]({{ '/video-editor' | relative_url }}) to trim the
finished cut.

### Short film or trailer

Pick the **Storyboard** flow and describe the story in one sentence. You
review the screenplay, assign [entities]({{ '/entities' | relative_url }}) to
the shots that need a fixed character or location, choose the look, and render
stills. Approve the framing you want, then generate clips for those shots
alone. [AI Video Production]({{ '/ai-video-production' | relative_url }}#storyboard-direct-each-shot-before-animation)
walks through each step, and the
[Creative Agent]({{ '/creative-agent' | relative_url }}) page covers redoing a
single shot by note.

### Narrated explainer

Pick the **Script** flow when the words drive the timing. Write or import the
script, assign a voice per speaker, and generate the takes. Create a linked
storyboard from the script for the visuals. When you edit a line later, its
take is marked stale so you know which lines to voice again. See
[Script: write and cast the words first]({{ '/ai-video-production' | relative_url }}#script-write-and-cast-the-words-first).

### Sound-off social ad

`/motion-ad` builds a 4:5 or 9:16 motion-graphics ad from the product's real
screenshots and photos, and checks each claim against the page it links to.
The [ad library](https://nodetool.ai/ad-library) shows the formats with a beat
sheet, an asset list, and a sample cut for each. For a beat-by-beat example,
read [a 15-second vertical product ad]({{ '/ai-video-production' | relative_url }}#example-a-15-second-vertical-product-ad).

### Fix one shot in a finished cut

Open the timeline and ask the agent for the fix, or type
`/nodetool-video-post`. It covers cutouts, tracking, outpainting, upscaling,
generated sound, voice replacement, and lip sync. Each repair lands on the
timeline as an inactive candidate next to the original clip, and you choose
whether to use it. The rest of the cut stays as it was. [AI Timeline Editing]({{ '/ai-timeline-editing' | relative_url }}) lists
the edits the agent can make on a timeline.

## Image, 3D, and game recipes

| You want | Start with | You finish in |
|---|---|---|
| One image with variations to choose from | **Image** flow | [Sketch editor]({{ '/sketch-editor' | relative_url }}) |
| A composition where you control each layer | A sketch, or `/nodetool-sketch` | Sketch editor |
| A recurring character, product, or location | **Entity** flow | [Entities]({{ '/entities' | relative_url }}) |
| A set blocked out in 3D as a shot reference | Ask the agent, or `/nodetool-3d-scene` | [3D editor]({{ '/3d-editor' | relative_url }}) |
| A playable 2D or 3D game | **Game** flow, or `/native-game` | [Game editor]({{ '/game-editor' | relative_url }}) |

**Key art.** The [Image flow]({{ '/guided-flows' | relative_url }}#image) turns
an idea into a brief, then a contact sheet of variations. The pick opens as a
sketch. Bind a layer to a prompt to regenerate that layer alone, or paint a
mask to change one region.

**A character that stays the same.** Make the character once with the
[Entity flow]({{ '/guided-flows' | relative_url }}#entity). After that, `@`
the entity in chat or in a Prompt node, or assign it to storyboard shots, and
generations use its reference image.

**A game.** The [Game flow]({{ '/guided-flows' | relative_url }}#game) starts a
2D room game or a 3D exploration. Play it in the editor, ask the agent for a
new level or new assets, then export a web player. Use `/game-direction`
first when the game plays correctly but feels flat.

## Tools for a team

| You want | Start with | Read |
|---|---|---|
| A simple screen a coworker can run without the graph | `/nodetool-app-builder` | [Mini Apps]({{ '/mini-apps' | relative_url }}) |
| Answers grounded in your own documents | `/nodetool-rag-indexing` | [Collections]({{ '/collections' | relative_url }}) |
| An agent that browses, extracts, and fills forms | `/nodetool-browser-agent` | [Chat & Agents]({{ '/global-chat-agents' | relative_url }}) |
| A run on a schedule, a file drop, or a webhook | A trigger node in a workflow | [Triggers]({{ '/triggers' | relative_url }}) |
| A procedure the agent should follow every time | Your own skill | [Skills]({{ '/skills' | relative_url }}) |
| NodeTool driven by another agent or your code | The MCP server or the API | [MCP Server]({{ '/mcp-server' | relative_url }}), [API]({{ '/api-reference' | relative_url }}) |

> When you repeat the same instructions across chats, save them as a
> [skill]({{ '/skills' | relative_url }}). It then appears in the `/` list with
> the shipped ones. Facts the agent should keep across chats, such as your
> brand rules, belong in [memory]({{ '/agent-memory' | relative_url }}).
{: .callout-note}

## Repeat it with a workflow

An editor is where you make one piece and judge it. A workflow graph is where
you make the same piece again for the next brief, SKU, language, or aspect
ratio. Ask the agent to build a workflow for the job, type `/video-workflow`,
or use the **Workflow** flow. Storyboards, scripts, timelines, and sketches are
typed values a graph can read and write, so an approved document can feed the
graph directly.

| What you are doing | Where it belongs |
|---|---|
| One film, judged shot by shot | Storyboard |
| The same film for forty briefs | [Brief to cut]({{ '/cookbook/patterns' | relative_url }}#pattern-1-brief-to-cut) |
| Trimming, mixing, and captioning one cut | Timeline |
| Every delivery format of that cut | [Derivatives]({{ '/cookbook/patterns' | relative_url }}#pattern-7-derivatives) |
| Painting a mask, composing a frame | Sketch |
| That composition in twelve styles | [Sketch as control]({{ '/cookbook/patterns' | relative_url }}#pattern-5-sketch-as-control) |
| Re-voicing a script after each copy edit | [Script to voiced cut]({{ '/cookbook/patterns' | relative_url }}#pattern-4-script-to-voiced-cut) |
| Thirty on-brand assets with one cast | [Entities]({{ '/cookbook/patterns' | relative_url }}#pattern-3-entities) |

The [workflow patterns]({{ '/cookbook/patterns' | relative_url }}) give each
graph with its nodes and the shipped template closest to it.
[Workflow concepts]({{ '/cookbook/core-concepts' | relative_url }}) covers
typed edges, documents as values, fan-out, and how to check a graph before it
spends.

| I want to… | Pattern | Key nodes |
|---|---|---|
| Turn a brief into a rendered film, unattended | [1 · Brief to cut]({{ '/cookbook/patterns' | relative_url }}#pattern-1-brief-to-cut) | `Director`, `ShotBatch`, `ShotChain`, `RenderTimeline` |
| Gate each shot on a cheap still first | [2 · Shot fan-out]({{ '/cookbook/patterns' | relative_url }}#pattern-2-shot-fan-out) | `ScreenplayShots`, `TextToImage`, `ImageToVideo` |
| Hold one cast and look across a batch | [3 · Entities]({{ '/cookbook/patterns' | relative_url }}#pattern-3-entities) | `ApplyEntities`, `ListGenerator`, `TextToImage` |
| Voice a script and caption the cut | [4 · Script to voiced cut]({{ '/cookbook/patterns' | relative_url }}#pattern-4-script-to-voiced-cut) | `WriteScript`, `VoiceScript`, `ScriptToTimeline`, `ScriptToSubtitles` |
| Drive generation from a drawn composition | [5 · Sketch as control]({{ '/cookbook/patterns' | relative_url }}#pattern-5-sketch-as-control) | `RenderSketch`, `SketchLayers`, `ImageToImage` |
| Get a gallery of variants from one brief | [6 · Variant fan-out]({{ '/cookbook/patterns' | relative_url }}#pattern-6-variant-fan-out) | `Agent`, `ListGenerator`, `TextToImage`, `Collect` |
| Ship one cut in every required shape | [7 · Derivatives]({{ '/cookbook/patterns' | relative_url }}#pattern-7-derivatives) | `Transcript`, `RetargetTimeline`, `RenderTimeline`, `AddSubtitles` |
| Handle naming, packaging, and subtitle math | [8 · Code node]({{ '/cookbook/patterns' | relative_url }}#pattern-8-code-glue) | `Code` |

### Start from a template

Open **Examples** in the app menu and load one. NodeTool opens a private copy,
so the original stays unchanged. The
[Templates Gallery]({{ '/templates-gallery' | relative_url }}) lists them all.

- **Direct a Short Film**: a brief in, a cut film out, with no editor step.
- **Directed Film to Timeline**: the same trip with a still for each shot.
- **Concept Art Iteration Board**: one brief, a gallery of directions.
- **Localized Explainer**: one brief, a voiced and captioned explainer per language.
- **Three Ratios**: one approved cut, delivered at 9:16, 1:1, and 16:9.
- **Podcast Repurposing Studio**: one recording, a whole content pack.

Before an expensive run, `nodetool validate` checks the graph without spending.
After a failed run, `nodetool debug` returns each node's output and error. See
[Debugging]({{ '/workflow-debugging' | relative_url }}).

## More examples

<div class="card-grid">
  <a class="doc-card" href="{{ '/use-cases' | relative_url }}"><strong>Use Cases</strong><span>Flagship projects end to end: trailers, product videos, ad batches, posters.</span></a>
  <a class="doc-card" href="{{ '/workflows/' | relative_url }}"><strong>Workflow Examples</strong><span>Smaller single-purpose graphs, each with its nodes.</span></a>
  <a class="doc-card" href="{{ '/skills' | relative_url }}"><strong>Shipped Skills</strong><span>Every skill the agent can load, grouped by the work it covers.</span></a>
  <a class="doc-card" href="https://nodetool.ai/ad-library"><strong>Ad Library</strong><span>Vertical ad formats with beat sheets and sample cuts.</span></a>
</div>
