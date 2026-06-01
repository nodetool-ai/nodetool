# NodeTool Studio — Product Vision

> Status: Vision · Branch `claude/nodetool-video-creation-scope-Q7LQf` · Owner: matti

## The pitch

**You describe the video. Studio makes it.** Type a topic, paste a script, drop a
raw recording, or hand it a URL — Studio writes, voices, illustrates, captions,
cuts, and reframes a finished video you can publish. Then you edit it like a
document: change the words, and the video changes with them.

This is the thing creators currently assemble from five tools — a scriptwriter, a
voice generator, a stock/b-roll library, a captioner, and a timeline editor.
Studio collapses them into one surface where the **script is the timeline** and
**AI fills every beat**. That bundle is what justifies a €50/month creator
subscription: it replaces a stack that costs more than that and takes a day of
work per video.

## Who pays €50/month

The solo creator, marketer, educator, and agency operator who ships short-form
video *on a schedule* — weekly YouTube explainers, daily TikTok/Reels, course
modules, product clips, ad variants. They don't want a node graph. They want to
go from idea to publish-ready MP4 in minutes, then tweak by editing text. They'll
pay because Studio is faster than hiring an editor and cheaper than the tool stack
they're juggling today.

## What makes it worth it

The moat is that NodeTool already has the hard parts in `main` — a real sequence
engine, AI clip generation, version/staleness tracking, a WebGPU compositor, and
in-browser MP4 export. Studio is the **opinionated creator surface** on top of
that engine. Competitors are either text-editors that bolt on AI (Descript) or AI
generators with no real editor (the clip-farm tools). Studio is both: generative
*and* editable, with the timeline as the substrate.

---

## The product

### 1. Idea → finished video

Every entry point lands on the same artifact — a transcript-bound sequence:

- **Topic.** "5-minute explainer on how RAG works." Studio researches, writes a
  script, picks a voice, generates voiceover, fills b-roll, captions it, and cuts
  to the beat.
- **Script.** Paste your own words; Studio voices and illustrates them.
- **Raw footage / long video.** Upload a recording or talk; Studio transcribes,
  finds the highlights, and assembles short clips — the "clip machine."
- **URL / doc.** Turn a blog post, PDF, or product page into a video.

The **assembly agent** is the headline. It doesn't just generate — it produces a
fully bound sequence: beats → voiceover clips, b-roll clips, captions, music bed,
transitions. Everything it emits is editable by hand afterward.

### 2. Edit like a document

The transcript panel *is* the editor. The script is a list of **beats**; each beat
owns the clips that realize it.

- **Delete a line** → its clips disappear and the timeline re-flows.
- **Reorder lines** → the video reorders.
- **Reword a line** → the bound voiceover/b-roll goes stale and regenerates.
- **Click a line** → jumps the playhead and selects its clips.
- **Reroll a beat** → new voice take, new b-roll, new phrasing — version history
  keeps the old ones.

No scrubbing, no razor tool, no keyframe hunting for the 90% case. Power users can
still drop to the full timeline tracks when they want frame control.

### 3. Voice, look, and brand

A video should sound and look like *you*:

- **Voices** — pick or clone a voice; consistent narrator across a series.
- **Captions** — word-level, animated, on-brand. Styles are presets (font, size,
  position, highlight, color) saved per brand.
- **B-roll** — generated, stock, or your own library; auto-matched to each beat.
- **Brand kit** — logo, fonts, colors, intro/outro, lower-thirds applied across
  every project.
- **Music & SFX** — auto-selected bed that ducks under voiceover.

### 4. Multi-format, multi-platform

One source, many outputs — this is where the subscription earns its keep for
people publishing everywhere:

- **Auto-reframe** 16:9 ↔ 9:16 ↔ 1:1 with subject tracking, so one edit ships to
  YouTube, TikTok, Reels, and Shorts.
- **Length variants** — a 60s cut and a 15s teaser from the same sequence.
- **Localization** — translate the transcript, regenerate voice and captions in
  another language; the timing re-flows automatically.
- **Ad variants** — swap the hook line, get N versions for testing.

### 5. Publish & iterate

- Export publish-ready MP4 in any aspect ratio, in-browser.
- Direct publish / scheduling to platforms.
- Thumbnail generation from the best frame.
- Reuse: save a finished video as a **template** — same structure, new script.

---

## How it sits on the engine

Studio is a creator surface over NodeTool's existing infrastructure. The mapping:

| Studio capability        | Engine it rides                                            |
| ------------------------ | --------------------------------------------------------- |
| Transcript-bound editing | `TimelineSequence` document (persisted, autosaved)        |
| Voiceover & b-roll       | AI clip generation (`text-to-audio`, `text-to-video`)     |
| Reword → regenerate      | `dependencyHash` staleness + `ClipVersion` history        |
| Captions & overlays      | `sceneModel.computeActiveLayers` (preview/export parity)  |
| Auto-reframe & variants  | sequence `width/height` (any ratio) + subject tracking    |
| Export                   | in-browser WebCodecs MP4                                   |
| Assembly agent           | NodeTool agent system (planner → steps → tools)           |

The agent's output target is the transcript-bound sequence the manual editor
produces — generation and hand-editing share one data model, so anything the
agent makes, you can refine, and anything you build, the agent can extend.

---

## What "done" feels like

A creator opens Studio, types *"weekly update on our launch, punchy, 45 seconds,
vertical."* Ninety seconds later there's a captioned, voiced, b-rolled vertical
video on screen. They delete one sentence, reword the hook, swap the voice to
their clone, hit a brand preset, and export — then generate the 16:9 cut for
YouTube from the same project. Start to publish: under five minutes. That's the
€50/month.
