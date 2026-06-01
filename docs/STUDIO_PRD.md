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

---

## Hero use cases

Six use cases that each, on their own, justify the subscription. Studio wins
because one person does all of them in one tool.

### 1. The faceless explainer channel

**Who.** Solo creators running educational / niche YouTube and TikTok channels
without showing their face — finance, history, science, "how X works," top-10
lists. Often a side hustle scaling toward full-time. No editing skills, no on-
camera presence, publishing 2–5 videos a week.

**Pain today.** A single 6-minute explainer is a day of work: write the script in
one tool, generate voiceover in ElevenLabs, hunt stock b-roll, drag everything
into a timeline, hand-time captions, render, then redo the whole thing as a
vertical Short. The tool stack alone runs past €50/month and the workflow doesn't
scale past a couple videos a week.

**In Studio.** Type the topic. The assembly agent researches, writes, voices,
fills b-roll per beat, and captions — out comes a bound sequence. They read the
transcript, cut two weak sentences, reword the hook, reroll one b-roll shot, and
export. Then one click for the 9:16 Short. A day becomes twenty minutes.

**Why they pay.** Studio is the difference between one video a week and one a day —
it directly grows the channel that pays their rent.

### 2. The podcast / long-form repurposer

**Who.** Podcasters, interviewers, webinar hosts, and the agencies/VAs who manage
their socials. They already have hours of long-form audio/video; their growth
channel is short clips on TikTok, Reels, Shorts, and LinkedIn.

**Pain today.** Finding the 30 clip-worthy moments in a 90-minute episode is
manual and soul-crushing. Tools like Opus Clip find moments but give you no real
editor; Descript edits but you're still scrubbing. Captioning and reframing each
clip vertically is per-clip busywork. Output: maybe 5 clips per episode when 20
are sitting in there.

**In Studio.** Drop the episode. Studio transcribes, surfaces the high-retention
moments as candidate clips, and assembles each as an editable transcript-bound
sequence — already captioned and reframed to vertical with the speaker tracked.
The editor trims by deleting words, tightens the hook, and ships. Twenty clips
from one episode in the time it used to take to make five.

**Why they pay.** Clip volume is reach, and reach is the whole reason they podcast.
Studio multiplies the output of content they've already recorded.

### 3. The founder / solo marketer

**Who.** Early-stage founders, indie hackers, and one-person marketing teams who
have to *be* the content department. Product launches, feature announcements,
demo clips, "build in public" updates, founder POV videos for LinkedIn and X.

**Pain today.** They have product knowledge but zero editing time. Hiring an editor
is slow and expensive for the cadence they need; doing it themselves means a video
ships once a month instead of weekly. Consistency across videos (brand, voice,
captions) is nonexistent because each one is improvised.

**In Studio.** Paste the changelog or a rough script. Studio turns it into a
captioned, voiced, on-brand video using their saved brand kit — logo, colors,
fonts, intro/outro baked in. Reword for tone, pick the cloned founder voice,
export landscape for LinkedIn and vertical for Reels. Ship a launch video the same
hour the feature ships.

**Why they pay.** It's an editor + a brand designer for €50/month, available at
2am the night before launch. The alternative costs ten times that and can't keep
up.

### 4. The course creator / educator

**Who.** Online instructors, corporate L&D teams, bootcamps, and teachers building
structured video lessons — module after module, in a consistent format.

**Pain today.** Lesson video is repetitive production work: same intro, same lower-
thirds, same caption style, every module. Updating a course when content changes
means re-recording and re-editing. Keeping 40 lessons visually consistent by hand
is error-prone and slow.

**In Studio.** Each lesson is a transcript — write or paste it, Studio voices and
illustrates it against a saved course template so every module matches. When the
curriculum changes, edit the script line and regenerate just that beat instead of
re-shooting. Templates make lesson #40 as fast as lesson #1.

**Why they pay.** Course revenue depends on shipping the whole curriculum and
keeping it current. Studio turns lesson production from a bottleneck into a
text-editing task.

### 5. The social agency / multi-brand manager

**Who.** Social media agencies and in-house teams running many client or product
brands at once. Their unit of work is "20 posts this week across 6 brands, each on
3 platforms," and their margin is throughput.

**Pain today.** Every brand needs its own look, voice, and caption style, and every
platform needs its own aspect ratio. Multiplied across clients, that's a
combinatorial explosion of manual reformatting. Maintaining brand consistency
across a team of junior editors is a constant QA fire.

**In Studio.** Brand kits enforce each client's voice, colors, fonts, and caption
preset automatically. Build once per concept, then fan out: every platform's
aspect ratio and a length variant from one source sequence. Templates standardize
formats so a new team member produces on-brand output day one.

**Why they pay.** This is pure margin — Studio cuts the per-deliverable cost across
hundreds of deliverables a month. At agency volume, €50/month is a rounding error
against the labor it removes.

### 6. The global / localized publisher

**Who.** Creators and brands expanding into multiple language markets — a YouTuber
going from English to Spanish/Portuguese/Hindi, or a company localizing product
and training videos for regional teams.

**Pain today.** Localization means re-recording voiceover in each language, re-
timing everything, and re-burning captions per language. It's so expensive that
most creators simply don't do it and leave entire markets on the table.

**In Studio.** Translate the transcript; Studio regenerates voiceover and captions
in the target language and re-flows the timing automatically — same b-roll, same
brand, new language. One source video becomes five market-ready videos without
touching a timeline.

**Why they pay.** Localization unlocks audiences worth far more than €50/month, and
Studio makes it a button instead of a project.

### The common thread

Every hero user is **publishing on a cadence** and bottlenecked on production, not
ideas. Studio attacks the bottleneck the same way for all of them: idea or source
in, edit-by-text in the middle, many formats out. The transcript-bound sequence is
the one model that serves the faceless creator, the repurposer, and the agency
alike — which is why one subscription covers all six.
