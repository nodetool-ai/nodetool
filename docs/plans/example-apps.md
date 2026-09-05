# Example Apps — Curation Spec

Status: draft, 2026-07-26. Companion to
[applications-canonical.md](applications-canonical.md) T11. Scope: which of the
36 shipped templates in `packages/base-nodes/nodetool/examples/nodetool-base/`
get a shipped example app (an `ApplicationBundle`, T12), and what each app
contains. No code.

Today every template gets a generated app from the CURATION table in
`scripts/generate-template-apps.mjs` — 36 variations of one form. This spec
replaces that with **11 curated studio apps binding 23 workflows**; the
remaining templates ship as workflows only. A second set of **10 single-job
apps** ([below](#single-job-apps)) binds 16 more templates.

## Selection criteria

Applied in priority order, recorded per app as C1/C2/C3:

1. **C1 — a real person wants the app, not the graph.** A form, dashboard, or
   gallery is the natural interface for this job.
2. **C2 — it exercises the platform.** Several workflows behind one surface,
   variables carrying state between operations, streaming, live property
   bindings.
3. **C3 — it runs on a fresh install, or degrades legibly.** Keyless, local, or
   an explicit note naming the key and the cost.

## The apps

| App | Workflows bound | Operations | Key widgets | Criteria | Needs |
|---|---|---|---|---|---|
| Photo Studio | Image Enhance, Photo Enhancement Suite | `enhance`, `batch` | ImageInput, 5 Sliders, Image, Table | C1 C2 C3 | none for `enhance`; FAL key for `batch` |
| Meeting Room | Transcribe Audio, Meeting Transcript Summarizer, Private Assistant | `transcribe`, `summarize`, `ask` | AudioInput, Markdown, Table, TextInput | C1 C2 | FAL (Whisper) + OpenAI; `ask` needs Ollama |
| Concept Studio | Concept Art Iteration Board, Pokemon Maker, Image Enhance | `concepts`, `creatures`, `polish` | Select, Slider, Image gallery, Button | C1 C2 | OpenAI + FAL; `polish` keyless |
| Research Desk | Research Agent, Hacker News Agent | `brief`, `pulse` | TextInput, Markdown ×2, Progress | C1 C2 | OpenAI (+ web search tool) |
| Ask Your Documents | Chat With Your Documents, Private Assistant | `ask`, `askLocal` | TextInput, Switch, Markdown ×2 | C1 C2 C3 | Ollama (embeddings, `askLocal`); OpenAI for `ask` |
| Brand & Social | Brand Asset Generator, Hook & Thumbnail Factory | `kit`, `thumbnails` | ColorInput, Image, Columns | C1 C2 | OpenAI + FAL |
| Product Launch Kit | Product Mockup Generator, Product Video Generator | `mockups`, `video` | ImageInput, Slider, Image, Video | C1 C2 C3 | OpenAI + FAL; Gemini (Veo) for `video`, cost note |
| Film Studio | Script to Screen, Directed Film to Timeline, Movie Posters | `produce`, `cut`, `poster` | TextInput, Select, Progress, Video, Image | C1 C2 C3 | OpenAI + FAL + Gemini (Veo) + Replicate; cost note |
| Study Buddy | Flashcard Generator, Prompt Template | `cards`, `explain` | NumberInput, Table, Markdown | C1 C2 | OpenAI |
| Model Arena | Model Arena | `compare` | TextInput, Columns, Markdown ×3 | C1 C2 | OpenAI + Anthropic + Gemini keys |
| Dataset Builder | Data Generator | `generate` | TextInput, NumberInput, Table | C1 | OpenAI |

Nine of eleven bind more than one workflow. Two are usable with no cloud key
(`Photo Studio`'s `enhance`, `Ask Your Documents` in local mode).

## Per-app detail

Output names below are the ones in the shipped graphs. Names marked † come
from the Output-augmentation table in `generate-template-apps.mjs`; T12 must
bake those Output nodes into the bundled graphs (see Prerequisites).

### 1. Photo Studio

Generate-free, refine-heavy: the flagship for live property bindings.

- `enhance` — Image Enhance. Inputs: `image` from an ImageInput widget; five
  node properties bound to sliders — `denoise-node.radius`,
  `tone-node.brightness`, `tone-node.contrast`, `color-node.saturation`,
  `sharpen-node.amount`, all `pace: "release"`. Policy `replace`. Output
  `enhanced_image`† → display.
- `batch` — Photo Enhancement Suite. Inputs: `photos` (ImageListInput),
  `brightness_adjust` / `color_boost` sliders. Output `enhanced_photos`† →
  variable `batchResults`, rendered as a grid.
- Variables: `sourceImage` (instance) shared by both operations so the single
  photo and the batch use the same drop zone.
- Degradation: `enhance` is pure GPU filters (`lib.image.*`) and runs with no
  keys; `batch` adds a FAL `ImageToImage` grade pass and says so in a note.

### 2. Meeting Room

Recording in, minutes out, then question the transcript — the transcribe →
summarize → interrogate chain across three workflows.

- `transcribe` — Transcribe Audio. Input `audio` from an AudioInput widget,
  event on `change` (auto-run on upload). Output `transcript`† → variable
  `transcript`. Policy `replace`.
- `summarize` — Meeting Transcript Summarizer. Input `Transcript` from
  variable `transcript` (the graph's `IsEmpty`/`If` pair already skips its own
  ASR branch when a transcript is supplied). Outputs `Summary` → Markdown,
  `Action Items` → Table (it emits a dataframe), `Transcript` unused.
- `ask` — Private Assistant. Inputs `document` from variable `transcript`,
  `question` from a TextInput, `tone` from a Select. Output `answer` →
  Markdown. Local Ollama, so the follow-up Q&A costs nothing and works offline
  once the transcript exists.
- Variables: `transcript` (instance) is the whole point — one value written by
  op 1 and read by ops 2 and 3.

### 3. Concept Studio

Generate a gallery, pick one, polish it. The creative iteration loop.

- `concepts` — Concept Art Iteration Board. Inputs `creative_brief`,
  `art_style`, `mood_keywords` (TextInput/Select), `variations` (Slider 1–8).
  Output `Concept Art` → append-disposition gallery.
- `creatures` — Pokemon Maker. Inputs `animals` (TextInput), `style` (Select
  fed from the graph's existing `SelectInput` options: cel-shaded, 3D render,
  watercolor, 16-bit, holographic). Output `pokemon`† → the same gallery.
- `polish` — Image Enhance, bound a second time with different mappings: input
  `image` from variable `picked`, sliders as in Photo Studio. Policy
  `replace`.
- Variables: `picked` (instance) — the gallery selection feeds `polish`.
- Both generators use `ListGenerator` → `TextToImage`, so results stream in one
  at a time; a Progress widget shows the batch filling.

### 4. Research Desk

One topic, two sources, two streamed briefings side by side — the case
where a dashboard beats a chat box.

- `brief` — Research Agent. Inputs `topic` (variable `topic`), `audience`
  (Select: engineers / executives / general). Output `brief` → Markdown,
  streams as the agent works.
- `pulse` — Hacker News Agent. Input `topic` from the same variable. Output
  `analysis` → Markdown.
- Both run `parallel` from one Button, each into its own panel with its own
  Progress label.

### 5. Ask Your Documents

RAG with a legible offline fallback.

- `ask` — Chat With Your Documents. Inputs `question`, `search`, and the three
  document text areas `doc_specs` / `doc_charging` / `doc_warranty` (shipped
  with the bundled Aurora sample text). Outputs `Answer` → Markdown,
  `Retrieved Passages` → Markdown (the citation panel).
- `askLocal` — Private Assistant. Inputs `document` from variable `pastedDoc`,
  `question` from the same question variable. Output `answer` → Markdown.
- Widgets: a Switch bound to variable `localOnly` decides which operation the
  Run button triggers, and `visibleWhen` swaps the results panel.
- Note: the vector collection embeds with Ollama `nomic-embed-text`, so `ask`
  needs Ollama running *and* an OpenAI key; `askLocal` needs only Ollama. The
  app note must say this — it is the one place a user can be surprised.

### 6. Brand & Social

The marketing dashboard: one brand identity drives two deliverables.

- `kit` — Brand Asset Generator. Inputs `brand_name`, `brand_description`,
  `tagline` (TextInputs, written into variables), `primary_color`
  (ColorInput). Outputs `social_assets` → Image grid, `brand_brief` → Markdown.
- `thumbnails` — Hook & Thumbnail Factory. Inputs `Video Topic` (TextInput),
  `Target Audience` from variable `audience`, `Number of Hooks` (Slider 3–8).
  Output `thumbnail_gallery` → gallery.
- Variables: `brandName`, `audience`, `voice` (user-scoped, `persist: true`) —
  fill them once, every operation reuses them across sessions.

### 7. Product Launch Kit

Photo in, mockups and a launch video out; the expensive step is opt-in.

- `mockups` — Product Mockup Generator. Inputs `product_image` (ImageInput →
  variable `productPhoto`), `product_name`, `product_description`,
  `target_audience`, `num_scenes` (Slider 1–6). Outputs `mockup`† → gallery,
  `scene`† → Markdown shot list.
- `video` — Product Video Generator. Inputs `image_input_1` from variable
  `productPhoto`, `campaign_brief`, `target_audience` (shared variable),
  `key_features`. Output `product_video`† → Video. Its own Button with a cost
  note; policy `queue`, `timeoutMs` generous — Veo runs are long.
- Runs `mockups` on a fresh install without touching Veo, so the app is useful
  at the FAL tier alone.

### 8. Film Studio

The showcase run: brief → direction → storyboard → cut → key art.

- `produce` — Script to Screen. Inputs `Brief` (variable `brief`),
  `Visual Style` (Select), `Shot Count` (Slider 3–8). Outputs `direction` →
  Markdown, `storyboard` → gallery, `film` → Video.
- `cut` — Directed Film to Timeline. Input `Brief` from the same variable.
  Output `film` → Video, presented as "the editable rough cut".
- `poster` — Movie Posters. Inputs `Movie Title`, `Genre`, `Visual Style`
  (shared Select). Output `Poster` → Image.
- Progress widget per operation; policy `queue` throughout; a standing note
  that this app spends real money (Veo 3.1 + Replicate MusicGen) and should be
  run once, deliberately.

### 9. Study Buddy

Structured data an app renders better than a graph does.

- `cards` — Flashcard Generator. Inputs `topic` (variable `topic`),
  `num_cards` (NumberInput). Output `Flashcards` → Table, with front/back
  columns; the graph persists them in SQLite, so re-opening the app shows the
  stored set.
- `explain` — Prompt Template. Inputs `Topic` from the same variable,
  `Audience` (Select). Output `Explanation` → Markdown, shown beside the cards
  as "the concept behind this deck".
- Variables: `topic` (user-scoped, persisted) is the study session.

### 10. Model Arena

Single workflow, but the app is the point: three answers in three columns is
unreadable on a canvas.

- `compare` — Model Arena. Inputs `brief`, `context` (TextInputs). Outputs
  `openai`, `anthropic`, `gemini` → three Markdown panels inside a Columns
  layout, each streaming independently with its own Progress label.
- Degradation: a missing provider key fails one column, not the run. The note
  names all three keys.

### 11. Dataset Builder

- `generate` — Data Generator. Inputs `topic` (TextInput), `row_count`
  (NumberInput 5–50). Output `generated_data` → Table.
- The smallest app in the set, kept because a table view of a dataframe is a
  genuinely better surface than a Preview node, and it is the reference for the
  Table widget.

## Single-job apps

The studios above put several jobs behind one surface. These ten are the
opposite shape, the one a Runway-style app has: one upload, a few choices, one
result. Each is a media job somebody already knows they want, so the app is the
whole product and the graph is an implementation detail. C1 applies to every
one; C2 comes from variables carrying one upload into several operations, and
from Select and Slider widgets driving node properties inside the graph rather
than Input nodes.

| App | Workflows bound | Operations | Key widgets | Needs |
|---|---|---|---|---|
| Vary Image | Edit a Still with Words | `edit` | ImageInput, Select (what to change), Slider (`ed.strength`), Image | FAL |
| Product Reshoot | Put a Product on a Studio Backdrop, Relight a Product for a Seasonal Campaign, Cut a Product Out of Its Background | `backdrop`, `relight`, `cutout` | ImageInput, Select (`comp.prompt`), Select (`rl.prompt`), Image ×3 | FAL |
| Product Shot Video | Ad Loop from a Product Photo, Spin a Packshot into a Turntable Clip | `loop`, `turntable` | ImageInput, Select, Select (`v.prompt`), Video ×2 | KIE for `loop`, FAL for `turntable` |
| Multi-Shot Video | Movie Trailer Generator | `trailer` | TextInput, Select, Slider (shot count), Video | Gemini + OpenAI + Veo; cost note |
| Scene Builder | Editorial Still from a Line, Bring a Still to Life | `look`, `motion` | TextInput, Image, Select, Slider (`vid.duration`), Video | FAL |
| Video Restyle | Video Restyle Studio | `restyle` | WorkflowInput (video), Select, TextInput, Slider (`restyle.strength`), Video | FAL |
| AI Spokesperson | AI Spokesperson | `revoice` | WorkflowInput (video), TextInput, Slider (`speech.speed`), Video | FAL + Inworld |
| Upscale Image | Upscale a Still, Take a Product Shot to Print Resolution | `faithful`, `clarity` | ImageInput, Slider (`up.scale`) ×2, Image ×2 | FAL |
| Vertical Cut | Cut a Landscape Clip for Vertical, Pull a Still from a Clip | `vertical`, `cover` | VideoInput, Slider (`frame.time`), Video, Image | none (ffmpeg) |
| Ad Maker | Ad Copy in Three Registers, Five Headlines for a Landing Page, Write the Prompt, Then Make the Image | `copy`, `headlines`, `visual` | TextInput, Markdown ×3, Image | OpenAI + FAL |

Per-app notes, where the table does not say it all:

- **Vary Image.** The Select is bound to the `instruction` Input, so each option
  is a complete edit instruction; the first one is the graph's own default.
  Strength drives `ed.strength` directly.
- **Product Reshoot.** One `productPhoto` variable feeds all three operations.
  The setting and season selects drive the prompt property of the edit and
  relight nodes, so the graph's Input nodes stay as they are.
- **Scene Builder.** `look` writes its `picture` output to the `still` variable,
  which `motion` reads as its `still` input. The still is shown from the
  variable, so the user sees exactly the frame that will be animated.
- **Vertical Cut.** The only keyless app in this set. One `clip` variable of type
  `video` feeds both operations, and one button runs them in parallel.
- **Ad Maker.** The `offer` variable is user-scoped and persisted; all three
  agents read it and one button starts them in parallel. `visual` maps the
  offer to the template's `idea` input.

## Templates that stay workflow-only

These templates were considered and left without an app:

| Template | Reason |
|---|---|
| Audio To Image | One input, one image; the template card already tells the whole story. |
| Cold Outreach Co-Pilot | Preview-only terminals, and the structured draft fields need an app-side email composer this spec does not define. |
| Color Boost Video | Per-frame grading of an uploaded video is minutes long with one slider — a bad first-run experience; the sliders belong in the editor. |
| Conditional Logic Engine | Teaching example. Its value *is* the graph. |
| Image To Audio Story | One image in, one audio clip out — a Run button with extra steps. |
| Image to Video Animation | Text-to-image → Veo; it has no image input, so it cannot be the "animate this" step of any gallery app (see Findings). |
| Music Video Visualizer | Strong candidate deferred: one upload, one long paid run, one video. Revisit once a Podcast/Audio app justifies the surface. |
| Podcast Repurposing Studio | Preview-only terminals; needs Output nodes and structured quote-card output before an app can render it. |
| SEO Content Engine | Preview-only terminals; the typed article fields want a per-article editor, not a results panel. |
| Workflow As A Tool | Composition demo for graph authors. An app hides exactly what it teaches. |

## Prerequisites and findings

Things T12 must handle, found while reading the graphs:

- **Output augmentation must move into the graphs.** Eight bound workflows have
  no Output node today and rely on the `AUGMENT` table in
  `generate-template-apps.mjs`: Transcribe Audio, Summarize RSS, Pokemon Maker,
  Image Enhance, Photo Enhancement Suite, Product Mockup Generator, Product
  Video Generator, Social Media Calendar Filler (2 of its 3 outputs). Bundles
  carry graphs, not a generator, so those nodes must be committed to the
  example JSON.
- **Preview-only templates cannot back an app.** Ad Creative Factory, Cold
  Outreach Co-Pilot, Podcast Repurposing Studio, and SEO Content Engine end in
  `nodetool.workflows.base_node.Preview` with zero Outputs. All four are in the
  workflow-only list for that reason; promoting any of them later is a graph
  change first.
- **Image to Video Animation has no image input.** The obvious "animate the
  concept I picked" operation for Concept Studio is not buildable against the
  shipped graph (`TextToImage` → `ImageToVideo`). Concept Studio uses Image
  Enhance for its second step instead; adding an ImageInput to that template is
  a separate, small change if the animate step is wanted.
- **Chat With Your Documents needs Ollama even in "cloud" mode.** Its
  `vector.Collection` embeds with `nomic-embed-text` on Ollama while the answer
  agent is OpenAI `gpt-5-mini`. Either the app note says both, or the template
  switches to a cloud embedding model.
- **Multi-binding is real here.** Image Enhance is bound by two apps (Photo
  Studio, Concept Studio) and Private Assistant by two (Meeting Room, Ask Your
  Documents) — with different input mappings each time. The bundle format's
  `workflows[].key` indirection covers this; the installer must not create
  duplicate workflow rows when both bundles are installed.
- **Marketing impact.** `/apps/*` drops from 36 generated pages to 11 curated
  ones. Every retired slug needs a redirect to the app that absorbed it (or to
  its `/templates/<slug>` page, which survives) — the redirect map is T13 work,
  but the mapping is this table.
