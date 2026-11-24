---
layout: page
title: Creative Workflow Patterns
parent: NodeTool Workflow Cookbook
nav_order: 2
---

Eight graphs for creative work you run more than once. Each names the nodes and
the closest shipped template. To build any of them, press Space to add a node,
drag an output handle to an input handle, press Ctrl/⌘+Enter to run, and add
**Preview** nodes to see intermediate values.

<span id="pattern-1-brief-to-cut"></span>

### Pattern 1 · Brief to cut, unattended

A line of brief becomes a rendered film. **Director** writes the screenplay,
**Shot Chain** films the shots in order, and the clips land on a timeline that
gets rendered.

<video controls preload="metadata" poster="{{ '/assets/cookbook/brief-to-cut.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/brief-to-cut.mp4' | relative_url }}" type="video/mp4">
</video>

{% mermaid %}
graph LR
  brief["String Input (Brief)"]
  dir["Director"]
  batch["Shot Batch"]
  chain["Shot Chain"]
  cut["Add Clips To Timeline"]
  render["Render Timeline"]
  out["Output (Film)"]
  brief --> dir --> batch --> chain --> cut --> render --> out
{% endmermaid %}

**Shot Chain** seeds each shot from the previous clip's last frame, which
holds continuity across shots. Shot 1 has nothing to seed from unless its
screenplay shot carries a keyframe, so it runs text-to-video while the rest run
image-to-video. Some providers, such as Kie, list those as two separate
models. On those, fill in **Continuation Model** too. Leave it empty to reuse
**Model**.

**Nodes**: Director, Shot Batch, Shot Chain, Add Clips To Timeline, Render
Timeline

**Automate it when** you have many briefs, or one brief that gets re-cut on a
schedule. **Use the storyboard editor instead** when you want to approve each still
before paying for its clip.

**Template**: *Direct a Short Film*

______________________________________________________________________

<span id="pattern-2-shot-fan-out"></span>
<span id="pattern-2-stills-before-clips"></span>

### Pattern 2 · Stills before clips

The same trip from brief to cut, but with a still in the middle. **Screenplay
Shots** streams one prompt per shot on its **Shot Prompt** output, each prompt
becomes a still, and each still is animated.

<video controls preload="metadata" poster="{{ '/assets/cookbook/shot-fan-out.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/shot-fan-out.mp4' | relative_url }}" type="video/mp4">
</video>

{% mermaid %}
graph LR
  brief["String Input (Brief)"]
  dir["Director"]
  shots["Screenplay Shots (streams)"]
  still["Text To Image"]
  clip["Image To Video"]
  collect["Collect"]
  cut["Add Clips To Timeline"]
  render["Render Timeline"]
  brief --> dir --> shots --> still --> clip --> collect --> cut --> render
{% endmermaid %}

A still costs cents and a clip costs dollars, so the still is a cheap
checkpoint. Anchoring every still to one style frame keeps thirty shots looking
like one film. Generate the style frame first, then run the shot stills through
**Image To Image** against it.

**Nodes**: Screenplay Shots, Text To Image, Image To Image, Image To Video,
Collect

**Automate it when** the shot count is large enough that clicking through the
board is the slow part.

**Templates**: *Directed Film to Timeline* (ends in Add Clips To Timeline and
Render Timeline), *Movie Trailer Generator* (ends in Concatenate Video),
*Script to Screen* (an **Agent** writes the direction instead of
**Director**)

______________________________________________________________________

<span id="pattern-3-entities"></span>

### Pattern 3 · One cast across many assets

[Entities]({{ '/entities' | relative_url }}) are named characters,
locations, styles, and props. Each one has a fixed description that is pasted
word for word into every prompt that uses it. That repeated text is what holds
a face or a palette steady across a batch.

<video controls preload="metadata" poster="{{ '/assets/cookbook/entity-cast.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/entity-cast.mp4' | relative_url }}" type="video/mp4">
</video>

{% mermaid %}
graph LR
  brief["String Input (Brief)"]
  prompts["List Generator (one prompt per asset)"]
  cast["Entity"]
  apply["Apply Entities"]
  image["Text To Image"]
  collect["Collect"]
  out["Output"]
  brief --> prompts --> apply
  cast -->|entities| apply
  apply -->|prompt| image
  image --> collect --> out
{% endmermaid %}

**Text To Image**, **Image To Image**, **Text To Video**, and **Image To
Video** take an **Entities** property directly, so the graph above also works
with the entities set on **Text To Image** and no **Apply Entities**. **Image
To Image** also adds each entity's reference images to its input images. Use
**Apply Entities** when another node needs the prompt with the entity
descriptions already in it. It returns the finished **Prompt** and the
**Reference Images** as separate outputs, and an empty **Text** applies every
entity.

**Nodes**: Entity, Apply Entities, List Generator, Text To Image

**Automate it when** a campaign needs the same cast in thirty frames.
**Do it by hand** for a single hero image. The picker in the Prompt node is one
`@` away.

______________________________________________________________________

<span id="pattern-4-script-to-voiced-cut"></span>

### Pattern 4 · Script to voiced cut and captions

A script is a document with cast voices attached to its lines. **Write
Script** writes one from a brief, or a **Script** node loads one you already
have. **Voice Script** records every line that has no take yet or has changed
since its last take, using each line's own voice, and saves the takes back onto
the script.

<video controls preload="metadata" poster="{{ '/assets/cookbook/script-voice.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/script-voice.mp4' | relative_url }}" type="video/mp4">
</video>

{% mermaid %}
graph LR
  script["Script or Write Script"]
  voice["Voice Script"]
  tl["Script To Timeline"]
  render["Render Timeline"]
  subs["Script To Subtitles"]
  out["Output (Cut)"]
  srt["Output (SRT)"]
  script --> voice --> tl --> render --> out
  voice --> subs --> srt
{% endmermaid %}

Lines already up to date are skipped, so a re-run after a copy edit pays for the
changed lines only. The script is the source of truth, and the cut and the
subtitle file are both derived from it.

**Script To Timeline** fails when no line has a take, so voice first.
**Script To Subtitles** writes SRT or WebVTT (**Format**) with one caption per
line or per word (**Granularity**), from the takes' word timings.

**Nodes**: Script, Write Script, Voice Script, Script To Timeline, Script To
Subtitles, Render Timeline

**Automate it when** copy changes often, or when the same script ships in
several languages. **Write Script** takes a **Language**, so a list of
languages in front of it gives one voiced master per language. When the copy
is fixed and only some values change, **Fill Script** fills a template script's
{% raw %}`{{key}}`{% endraw %} placeholders from a set of key-value pairs.

**Template**: *Localized Explainer* implements this chain. *Narrate a Script*
and *Localise a Script and Revoice It* go from text straight to speech, without a
script document.

______________________________________________________________________

<span id="pattern-5-sketch-as-control"></span>

### Pattern 5 · Sketch as the control input

A sketch document carries layers and a mask. **Render Sketch** flattens it to
an image and returns the mask alongside when the sketch has a visible mask
layer.
That gives you the composition and the region to change in one node.

<video controls preload="metadata" poster="{{ '/assets/cookbook/sketch-variants.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/sketch-variants.mp4' | relative_url }}" type="video/mp4">
</video>

{% mermaid %}
graph LR
  sketch["Sketch"]
  render["Render Sketch"]
  styles["String List Input (Styles)"]
  each["For Each"]
  img["Image To Image"]
  collect["Collect"]
  out["Output (Variants)"]
  sketch --> render -->|image| img
  styles --> each --> img --> collect --> out
{% endmermaid %}

For a masked edit, send the same node's **Mask** output alongside its
**Image** output to the OpenAI **Edit Image** node, which repaints the white
areas and leaves the rest alone. The mask is painted once and every variant
reuses it.

**Sketch Layers** is the other half. It returns **Layers** and **Names** for
each visible layer, so foreground and background can go through different
steps and be combined again with **Compositor**.

**Nodes**: Sketch, Render Sketch, Sketch Layers, Image To Image, Edit Image
(OpenAI), Compositor

**Automate it when** the composition is settled and you want it in twelve
styles or six aspect ratios. **Paint in the sketch editor** while the
composition itself is still the question.

______________________________________________________________________

<span id="pattern-6-variant-fan-out"></span>
<span id="pattern-6-multiple-variations"></span>

### Pattern 6 · Multiple variations from one brief

An agent turns a brief into a direction, a list generator writes N distinct
prompts against it, and each prompt renders. One input gives a gallery.

<video controls preload="metadata" poster="{{ '/assets/cookbook/variant-fan-out.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/variant-fan-out.mp4' | relative_url }}" type="video/mp4">
</video>

{% mermaid %}
graph LR
  brief["String Input (Brief)"]
  count["Integer Input (Count)"]
  direction["Agent (Art Director)"]
  ask["Prompt (direction + count)"]
  prompts["List Generator"]
  image["Text To Image"]
  preview["Preview"]
  collect["Collect"]
  out["Output"]
  brief --> direction --> ask --> prompts --> image --> collect --> out
  count --> ask
  prompts --> preview
{% endmermaid %}

**List Generator** has no count property. State the count in the prompt that
feeds it, which is why a **Prompt** node sits in front. It streams its **Item**
output, so the first prompts render while the last are still being written, and
a **Preview** on the prompt stream shows you what is coming before the images
arrive.

**Nodes**: Agent, Prompt, List Generator, Text To Image, Collect

**Automate it when** you want variety to pick from, such as concepts, thumbnails,
poster directions, or a social kit.

**Templates**: *Concept Art Iteration Board*, *Hook & Thumbnail Factory*,
*Movie Posters*, *Brand Asset Generator*

______________________________________________________________________

<span id="pattern-7-derivatives"></span>

### Pattern 7 · Derivatives from a finished cut

One master, many deliverables. **Timeline Transcript** reads the timeline's
own transcript lines, so titles, show notes, and social copy come from the cut
rather than from a second transcription pass. **Retarget Timeline** makes a new
timeline in another aspect ratio from the approved cut and keeps every trim and
placement.

<video controls preload="metadata" poster="{{ '/assets/cookbook/derivatives.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/derivatives.mp4' | relative_url }}" type="video/mp4">
</video>

{% mermaid %}
graph LR
  tl["Timeline"]
  transcript["Timeline Transcript"]
  agent["Agent (titles, notes, posts)"]
  retarget["Retarget Timeline (9:16)"]
  render["Render Timeline"]
  audio["Extract Audio"]
  asr["Transcribe (segments)"]
  subs["Add Subtitles"]
  copy["Output (Copy)"]
  post["Output (Vertical cut)"]
  tl --> transcript --> agent --> copy
  tl --> retarget --> render --> subs --> post
  render --> audio --> asr --> subs
{% endmermaid %}

**Retarget Timeline** takes an **Aspect Ratio** (the short edge is 1080 px)
and a **Fit**. `cover` fills the frame and crops, and its **Cropped** output
lists the clips it cut into. `contain` letterboxes. The source timeline is
never changed. The video **Resize** node is different: it scales to the exact
width and height you give it, so a 16:9 clip resized to 1080 by 1920 is
squashed, not cropped.

Burned-in captions need timings, not plain text. **Add Subtitles** takes timed
audio segments, which the OpenAI **Transcribe** node returns on its
**Segments** or **Words** output. **Timeline Transcript** gives plain text. It
feeds the copy, not the captions.

**Nodes**: Timeline, Timeline Transcript, Retarget Timeline, Render Timeline,
Extract Audio, Transcribe (OpenAI), Add Subtitles, Agent

**Automate it when** every cut ships in more than one shape. Re-running the
graph after an edit rebuilds every derivative from the same master.

**Templates**: *Three Ratios* (one cut to 9:16, 1:1, and 16:9),
*Podcast Repurposing Studio* (one recording to titles, notes, a newsletter,
posts, and quote cards), *Subtitle Text from a Recording*. *Cut a Landscape Clip
for Vertical* uses **Resize** on a clip, so it stretches the frame.

______________________________________________________________________

<span id="pattern-8-code-glue"></span>

### Pattern 8 · Code node for the parts a model should not do

Naming, ordering, removing duplicates, and packaging files have one right
answer each. One **Code** node does them in JavaScript.

<video controls preload="metadata" poster="{{ '/assets/cookbook/code-glue.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/code-glue.mp4' | relative_url }}" type="video/mp4">
</video>

{% mermaid %}
graph LR
  clip["Video Input"]
  audio["Extract Audio"]
  asr["Automatic Speech Recognition"]
  code["Code (slugify)"]
  out["Output (Filename)"]
  clip --> audio --> asr --> code --> out
{% endmermaid %}

The code runs on the server in a sandbox, never in the browser. Ready-made
helpers cover common file formats, such as SRT and VTT subtitles, CSV, ZIP,
YAML, and Excel. Describe the rule to the chat assistant and it can write and
test the code for you. A **Code** node can also link a saved JS script, so one
tested piece of code serves many workflows. See
[JS Scripts]({{ '/js-scripts' | relative_url }}).

**Nodes**: Code

**Automate it when** the step has one right answer: a slug, a manifest, a
per-shot cost table, a subtitle file assembled from timings.

**Template**: *Name a File from Its Narration* (one **Code** node shortens the
transcript, a second turns it into a file name)

______________________________________________________________________

### Leave it in the editor

These jobs do not repeat, so do them in the editor:

| Job | Where it belongs |
|---|---|
| Judging a film shot by shot, re-rolling the weak ones | Storyboard |
| Trimming, mixing, and captioning one cut | Timeline editor |
| Painting a mask or composing a frame | Sketch editor |
| Rewriting a line and hearing it back | Script editor |
| One hero image, one question about a document | Chat |

The chat assistant can also make these edits for you in each editor.
