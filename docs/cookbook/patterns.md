---
layout: page
title: Creative Workflow Patterns
parent: NodeTool Workflow Cookbook
nav_order: 2
---

Eight patterns for creative work worth running more than once. Each one names
the graph, the nodes, and the shipped template closest to it.

To build any of them: press Space to add a node, drag an output handle to an
input handle, press Ctrl/⌘+Enter to run, and drop `Preview` nodes wherever you
want to see an intermediate value.

<span id="pattern-1-brief-to-cut"></span>

### Pattern 1 · Brief to cut, unattended

A line of brief becomes a rendered film: the Director writes the screenplay,
`ShotChain` films the shots in order, and the clips land on a timeline that gets
rendered.

{% mermaid %}
graph LR
  brief["StringInput (Brief)"]
  dir["Director"]
  batch["ShotBatch"]
  chain["ShotChain"]
  cut["AddClips"]
  render["RenderTimeline"]
  out["Output (Film)"]
  brief --> dir --> batch --> chain --> cut --> render --> out
{% endmermaid %}

`ShotChain` seeds each shot from the previous clip's last frame, which is what
holds continuity across a cut nobody is watching. Shot 1 has nothing to seed
from, so it runs text-to-video while the rest run image-to-video — on providers
that publish those as separate model ids, fill in **Continuation Model** too.

**Nodes**: `nodetool.creative.Director`, `nodetool.creative.ShotBatch`,
`nodetool.creative.ShotChain`, `nodetool.timeline.AddClips`,
`nodetool.timeline.RenderTimeline`

**Automate it when** you have many briefs, or one brief that gets re-cut on a
schedule. **Use the storyboard surface instead** when you want to approve each
still before paying for its clip.

**Template**: *Direct a Short Film*

______________________________________________________________________

<span id="pattern-2-shot-fan-out"></span>

### Pattern 2 · Shot fan-out through stills

The same trip from brief to cut, but with a keyframe in the middle:
`ScreenplayShots` streams one prompt per shot, each prompt becomes a still, and
each still is animated.

<video controls preload="metadata" poster="{{ '/assets/cookbook/storyboard-to-video.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/storyboard-to-video.mp4' | relative_url }}" type="video/mp4">
</video>

{% mermaid %}
graph LR
  brief["StringInput (Brief)"]
  dir["Director"]
  shots["ScreenplayShots (streams)"]
  still["TextToImage"]
  clip["ImageToVideo"]
  collect["Collect"]
  cut["AddClips"]
  render["RenderTimeline"]
  brief --> dir --> shots --> still --> clip --> collect --> cut --> render
{% endmermaid %}

A still costs cents and a clip costs dollars, so the keyframe is both a control
point and a cheap thing to inspect after an unattended run. Anchoring every
keyframe to one style frame — generate it first, then run the shot stills
through `ImageToImage` against it — is what keeps thirty shots looking like one
film.

**Nodes**: `nodetool.creative.ScreenplayShots`, `nodetool.image.TextToImage`,
`nodetool.image.ImageToImage`, `nodetool.video.ImageToVideo`,
`nodetool.control.Collect`

**Automate it when** the shot count is large enough that clicking through the
board is the slow part.

**Templates**: *Directed Film to Timeline*, *Script to Screen*,
*Movie Trailer Generator*

______________________________________________________________________

<span id="pattern-3-entities"></span>

### Pattern 3 · One cast across many assets

Entities are named characters, locations, styles, and props whose canonical
descriptor is pasted verbatim into every prompt that uses them. That verbatim
text is what holds a face or a palette steady across a batch.

{% mermaid %}
graph LR
  brief["StringInput (Brief)"]
  prompts["ListGenerator (one prompt per asset)"]
  apply["ApplyEntities"]
  image["TextToImage"]
  collect["Collect"]
  out["Output"]
  brief --> prompts --> apply
  apply -->|prompt| image
  apply -->|reference_images| image
  image --> collect --> out
{% endmermaid %}

`TextToImage`, `ImageToImage`, and `ImageToVideo` take an **entities** property
directly — reach for `nodetool.creative.ApplyEntities` when something else needs
the seasoned text, since it returns the composed prompt and the reference images
as separate outputs.

**Nodes**: `nodetool.creative.ApplyEntities`, `nodetool.generators.ListGenerator`,
`nodetool.image.TextToImage`

**Automate it when** a campaign needs the same cast in thirty frames.
**Do it by hand** for a single hero image — the picker in the Prompt node is one
`@` away.

______________________________________________________________________

<span id="pattern-4-script-to-voiced-cut"></span>

### Pattern 4 · Script to voiced cut and captions

A script is a document with cast voices attached to its lines. `VoiceScript`
synthesizes every line that is draft or stale, using each line's own voice, and
saves the takes back onto the script.

{% mermaid %}
graph LR
  script["Script (constant)"]
  voice["VoiceScript"]
  tl["ScriptToTimeline"]
  render["RenderTimeline"]
  subs["ScriptToSubtitles"]
  out["Output (Cut)"]
  srt["Output (SRT)"]
  script --> voice --> tl --> render --> out
  voice --> subs --> srt
{% endmermaid %}

Lines already up to date are skipped, so a re-run after a copy edit pays for the
changed lines only. That is what makes the whole chain worth wiring: the script
is the source of truth, and the cut plus the subtitle file are both derived from
it.

**Nodes**: `nodetool.constant.Script`, `nodetool.script.VoiceScript`,
`nodetool.script.ScriptToTimeline`, `nodetool.script.ScriptToSubtitles`,
`nodetool.timeline.RenderTimeline`

**Automate it when** copy changes often, or when the same script ships in
several languages — put an `Agent` translation step in front of the voicing and
you have a localised master per language.

**Templates**: *Narrate a Script*, *Localise a Script and Revoice It*

______________________________________________________________________

<span id="pattern-5-sketch-as-control"></span>

### Pattern 5 · Sketch as the control input

A sketch document carries layers and a mask. `RenderSketch` flattens it to an
image and returns that mask alongside — the composition and the region to
change, in one node.

<video controls preload="metadata" poster="{{ '/assets/cookbook/style-transfer.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/style-transfer.mp4' | relative_url }}" type="video/mp4">
</video>

{% mermaid %}
graph LR
  sketch["Sketch (constant)"]
  render["RenderSketch"]
  styles["StringListInput (Styles)"]
  each["ForEach"]
  img["ImageToImage"]
  collect["Collect"]
  out["Output (Variants)"]
  sketch --> render -->|image| img
  styles --> each --> img --> collect --> out
{% endmermaid %}

That is the whole-frame version. For a masked edit, send the same node's
`mask` output alongside its `image` to `openai.image.EditImage`, which repaints
the white areas and leaves the rest alone — the mask is painted once and every
variant reuses it.

`SketchLayers` is the other half: it hands you each visible layer as its own
image with its name, so foreground and background can go through different
pipelines and be composited back together with `Compositor`.

**Nodes**: `nodetool.constant.Sketch`, `nodetool.sketch.RenderSketch`,
`nodetool.sketch.SketchLayers`, `nodetool.image.ImageToImage`,
`openai.image.EditImage`, `nodetool.image.Compositor`

**Automate it when** the composition is settled and you want it in twelve
styles or six aspect ratios. **Paint in the sketch editor** while the
composition itself is still the question.

______________________________________________________________________

<span id="pattern-6-variant-fan-out"></span>

### Pattern 6 · Variant fan-out from one brief

An agent turns a brief into a direction, a list generator writes N distinct
prompts against it, and each prompt renders. The fan-out is the point: one input,
a gallery out.

<video controls preload="metadata" poster="{{ '/assets/cookbook/movie-poster.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/movie-poster.mp4' | relative_url }}" type="video/mp4">
</video>

{% mermaid %}
graph LR
  brief["StringInput (Brief)"]
  count["IntegerInput (Count)"]
  direction["Agent (Art Director)"]
  prompts["ListGenerator"]
  image["TextToImage"]
  preview["Preview"]
  collect["Collect"]
  out["Output"]
  brief --> direction --> prompts --> image --> collect --> out
  count --> prompts
  prompts --> preview
{% endmermaid %}

`ListGenerator` streams, so the first prompts render while the last are still
being written, and a `Preview` on the prompt stream shows you what is coming
before the images arrive.

**Nodes**: `nodetool.agents.Agent`, `nodetool.generators.ListGenerator`,
`nodetool.image.TextToImage`, `nodetool.control.Collect`

**Automate it when** you want variety to pick from — concepts, thumbnails,
poster directions, a social kit.

**Templates**: *Concept Art Iteration Board*, *Hook & Thumbnail Factory*,
*Movie Posters*, *Brand Asset Generator*

______________________________________________________________________

<span id="pattern-7-derivatives"></span>

### Pattern 7 · Derivatives from a finished cut

One master, many deliverables. `Transcript` reads the timeline's own text, so
titles, show notes, and social copy come from the cut rather than from a second
transcription pass.

{% mermaid %}
graph LR
  tl["Timeline (constant)"]
  transcript["Transcript"]
  agent["Agent (titles, notes, posts)"]
  render["RenderTimeline"]
  vertical["Resize (9:16)"]
  audio["ExtractAudio"]
  asr["Transcribe (segments)"]
  subs["AddSubtitles"]
  copy["Output (Copy)"]
  post["Output (Vertical cut)"]
  tl --> transcript --> agent --> copy
  tl --> render --> vertical --> subs --> post
  render --> audio --> asr --> subs
{% endmermaid %}

Burned-in captions need timings, not prose: `AddSubtitles` takes
`list[audio_chunk]`, which `openai.audio.Transcribe` returns as `segments` or
`words`. `Transcript` is the text path — it feeds the copy, not the caption
burn.

**Nodes**: `nodetool.constant.Timeline`, `nodetool.timeline.Transcript`,
`nodetool.timeline.RenderTimeline`, `nodetool.video.Resize`,
`nodetool.video.ExtractAudio`, `openai.audio.Transcribe`,
`nodetool.video.AddSubtitles`, `nodetool.agents.Agent`

**Automate it when** every cut ships in more than one shape. Re-running the
graph after an edit rebuilds every derivative from the same master.

**Templates**: *Cut a Landscape Clip for Vertical*,
*Podcast Repurposing Studio*, *Subtitle Text from a Recording*

______________________________________________________________________

<span id="pattern-8-code-glue"></span>

### Pattern 8 · Code node for the parts a model should not do

Naming, ordering, deduping, packaging: deterministic work that a model does
expensively and inconsistently. One `Code` node does it in JavaScript.

{% mermaid %}
graph LR
  clip["VideoInput"]
  audio["ExtractAudio"]
  asr["AutomaticSpeechRecognition"]
  code["Code (slugify)"]
  out["Output (Filename)"]
  clip --> audio --> asr --> code --> out
{% endmermaid %}

The body runs in the QuickJS sandbox and imports what it declares. Sandbox packs
cover the file formats a delivery step usually needs —
`@nodetool-ai/sandbox-subtitle` for SRT and VTT, `-csv`, `-zip`, `-yaml`,
`-xlsx`. Validate a body before running the graph with
`nodetool validate <file>`, or author it against `validate_code` / `run_code` /
`test_code`.

**Nodes**: `nodetool.code.Code`

**Automate it when** the step has one right answer: a slug, a manifest, a
per-shot cost table, a subtitle file assembled from timings.

**Template**: *Name a File from Its Narration*

______________________________________________________________________

### Leave it on the surface

A graph earns its place by repeating. These do not repeat, and the surface is
faster:

| Job | Where it belongs |
|---|---|
| Judging a film shot by shot, re-rolling the weak ones | Storyboard |
| Trimming, mixing, and captioning one cut | Timeline editor |
| Painting a mask or composing a frame | Sketch editor |
| Rewriting a line and hearing it back | Script editor |
| One hero image, one question about a document | Chat |

Each surface is also drivable by the chat agent through its `ui_*` tools, and
from outside over MCP — so "do it on the surface" does not mean "do it by hand".
