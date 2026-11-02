# Open-Source Higgsfield — Strategy

Status: proposed (October 2026).
Implementation plan: [open-source-higgsfield-implementation.md](open-source-higgsfield-implementation.md).
Earlier go-to-market spec, whose Wave 1 shipped: [higgsfield-alternative-gtm.md](higgsfield-alternative-gtm.md).

NodeTool already has most of what Higgsfield sells underneath. What it does not
have is Higgsfield's front door: a wall of visual, one-tap presets named after
the shot you want. Build that layer on top of the storyboard, entities and chat
modes that exist today. Make every preset an open file you can eject into a
workflow. Then the "open-source Higgsfield" claim becomes true rather than
aspirational.

- **Engine, mostly at parity.** Multi-shot storyboards with takes, reusable
  characters and locations, retake and extend, upscale, inpaint, cost estimates,
  MCP and an agent all ship today. NodeTool can even call Higgsfield's own
  models through the `higgsfield-nodes` pack.
- **Surface, the real gap.** Higgsfield is browsed, not configured: 70 to 250+
  camera presets with looping previews, effects packs, and outcome-named
  studios. NodeTool's camera moves are text options in a select, and its
  starting points are documents and workflows.
- **Story, a clear wedge.** Higgsfield's loudest complaints are credits that run
  out and expire, throttled "unlimited" plans, and black-box presets. NodeTool's
  answers are BYOK at list price, local models that really are unlimited, and
  presets you can open.

## Corrections against `main`

The analysis below was written from the docs. These points were checked
against the code when this file was saved and differ from the original text.

- The shot editor's movement list has 38 options, not 16. The earlier
  go-to-market work (T2) expanded `MOVEMENT_OPTIONS` in
  `web/src/components/storyboard/cameraOptions.ts`.
- `Camera Move`, `Camera Move Contact Sheet` and `Effects Gallery` already ship
  as workflow templates in `packages/base-nodes/nodetool/examples/nodetool-base/`.
  The Effects Gallery is one workflow with a 12-option select, not a gallery
  of cards.
- Entities already accept several reference images (the first is primary), and
  `@` mentions of entities already work in the chat composer and the Prompt
  node ([entities.md](../entities.md#how-entities-are-used-in-generation)). The
  remaining gap is `@` mentions in the storyboard, sketch and timeline prompt
  boxes, and identity training.
- Chat media modes run as chat turns, not through the `generate_media` RPC.
  Both share the scaffolding in `packages/websocket/src/session/media-generation.ts`,
  so both report to the Generations panel.

## 01 What Higgsfield is in October 2026

A preset catalogue on top of other people's models. Higgsfield started as
camera-motion presets for short-form video and grew into an "AI-native creative
suite". Its own navigation now lists 20+ studios and tools. The pattern behind
all of them is the same: pick an outcome from a thumbnail, add a photo or a
line of text, choose a model, pay credits.

- **Create pages.** Image, Video, Audio. A prompt bar with model switcher
  (Seedance 2.5, Kling 4.0, Sora 2, Veo 3.1, WAN 2.6, Nano Banana, Flux 2,
  GPT Image 2), batch 1–4, duration, aspect, live credit cost.
- **Camera presets and Effects.** Crash zoom, dolly, crane, FPV drone, bullet
  time, Snorricam, up to three stacked. Effects packs ship as named VFX drops
  ("Effects 9"). This is the growth engine on social.
- **Cinema Studio 4.0.** Director's panel: genre, era, tempo, camera body (35mm,
  8mm, DV), lens, aperture, 50+ grades, 6 lighting presets, speed ramps, up to
  50 references, 30s clips with native audio, forward and backward extend,
  region edit.
- **Soul and Elements.** Soul ID builds a character from several photos.
  Elements save characters, locations and props per project and sync for teams.
- **Studios.** Popcorn (storyboards), Lipsync, Marketing, Ads, Fashion Factory,
  Photodump, AI Influencer, Content Factory (topic to a 15s–5min clip), Genjutsu
  (swap or restyle parts of a video).
- **Agent and integrations.** Supercomputer agent with memory and app builder,
  MCP for Claude, ChatGPT plugin, CLI, API, After Effects, Blender, Figma,
  Photoshop and Resolve plugins.

**Pricing.** Credit plans. Third-party reviews quote different numbers for the
same tiers (Starter around $9–15, Plus or Pro around $23–39, Ultra or Max around
$59–99 a month), with 10 free credits a day, credits that expire after 90 days,
premium video at 40–70 credits a clip, and "unlimited" offers limited to
Higgsfield's cheaper in-house and image models. Check
[higgsfield.ai/pricing](https://higgsfield.ai/pricing) before quoting any figure.

## 02 Gap analysis

What NodeTool has today comes from the repository at `main` (docs plus
`web/src`). Priority is about the "open-source Higgsfield" claim, not product
value in general. Status is one of ahead, parity, partial or missing.

| Higgsfield | NodeTool today | What to build | Status | Priority |
| --- | --- | --- | --- | --- |
| Camera motion presets (70–250+, visual, stackable) | 38 movement strings plus framing, lens, angle and equipment as plain selects in the shot editor (`storyboard/cameraOptions.ts`). Free text, so prompts already carry them. `Camera Move` template. | A preset library with looping preview clips, a visual picker in the shot editor and Create bar, stacking up to three, and per-model prompt fragments. | missing | P0 |
| Effects and Apps (one input, one tap) | 33 example mini apps, mostly production jobs (Ad Maker, UGC Product Video, SKU Factory). `Effects Gallery` template with a 12-option select. Quick action tiles in the node menu. | An Effects gallery: 20–40 single-input effects, each a card with a preview loop. Upload photo, tap, get clip. | missing | P0 |
| Create page (prompt bar and results feed) | Chat modes under **+ New** (image, image edit, video, image to video, reference to video, retake, extend, audio, music). The Generations bottom panel lists every render. | A dedicated Create view: prompt bar with model, preset, aspect, duration, batch and cost, and a grid of your generations below it instead of a chat thread. | partial | P0 |
| Cinema Studio director panel (genre, era, body, grade, light, ramp) | Board-level genre chip, style field, Change style (art style for all shots), per-shot camera fields, Adjust sliders. | Look presets as visual chips at board and shot level: camera body, film stock, 30+ grades, lighting, era, speed ramp. Compile into the prompt and model parameters. | partial | P1 |
| Popcorn / multi-shot (storyboard) | Storyboard editor: Direct from a brief, scenes, shot cards, keyframe, direct or reference render, takes, iterate, stale tracking, script link, timeline assembly. Deeper than Popcorn. | Package it as the "Cinema" studio and surface presets inside it. | ahead | P1 |
| Soul ID / Elements (consistent characters) | Entities (character, location, style, prop) with several reference images and a verbatim descriptor. Retake dialog with character sheet and turnaround views. `@` mentions in the chat composer and Prompt node. | Optional local LoRA training, and `@` mentions in the storyboard, sketch and timeline prompt boxes. | parity | P1 |
| Lipsync Studio / AI Influencer (talking character) | Lipsync models through fal, Replicate, Kie and others. Audio-to-video chat mode. A talking-avatar cookbook demo. | A Lipsync studio: pick an entity, type or record a line, pick a voice, get a talking clip. Reuses the script editor's voicing. | partial | P1 |
| Genjutsu / video edit (restyle, swap, extend) | Retake and extend chat modes. Seedance video edit and extend via the Higgsfield pack. Timeline editor. | Restyle presets on any clip, and a paint-a-region edit for video like the still editor's Paint area. | partial | P1 |
| Marketing, Ads, Content Factory (outcome studios) | Creative agent, guided flows, recipes (viral ad engine, UGC product video, SKU factory, trailer), Directed Campaign Kit app. | Mostly naming and entry points: show them as Studios with outcome names on the start page. | parity | P1 |
| Upscale, inpaint, layers (image tools) | Change still: Edit, Paint area, Upscale 2× or 4×, Reframe, Adjust. Sketch editor with layers. Topaz pack. | Expose the same tools on any asset, not only storyboard stills. | parity | P2 |
| Supercomputer, MCP, CLI (agent access) | Creative agent that edits real documents, MCP server with 120+ tools, CLI, SDK, DSL, CodeAct. | Nothing to build. Lead with it in messaging for developers. | ahead | P2 |
| Model access and cost (credits) | Every major provider on your keys at list price, local models (Ollama, ComfyUI, WAN2GP), hosted credits only on Cloud, cost estimate before every render. A dated cost table on `/alternatives/higgsfield` and a `ByokCalculator` component. | A Higgsfield credit vs BYOK calculator on the alternatives page. | ahead | P0 |
| Explore, community, contests | Marketing showcase and examples. No in-app feed. | A community preset registry (git-backed, pull request to publish) and a showcase of runs with the preset that made them. | missing | P2 |
| Collaboration, teams | Multiplayer design doc only (`docs/multiplayer-design.md`). | Shared projects with live entities. Not needed for the launch claim. | missing | P2 |
| Mobile-first creation | Mobile app in `mobile/`, chat-centred. | Create page and Effects on phone once they exist on desktop. | partial | P2 |

## 03 The one thing to build

Presets as open files that eject into workflows. Higgsfield's presets are the
product, and they are closed: you cannot see what "Bullet Time" sends to Kling,
or change it. NodeTool can ship the same browsing experience where every preset
is a small JSON file in the repository, rendered as a card, compiled per model,
and openable as a graph. That one system powers camera moves, looks, effects
and studios, and no closed studio can copy it.

1. **Browse: preset card.** Looping preview, name, which models support it, cost.
2. **Compile: per-model prompt.** Fragments and parameters for Kling, Seedance,
   Veo, WAN and local models.
3. **Run: `generate_media`.** The same media generation path as chat modes and
   the storyboard. The render shows in Generations.
4. **Eject: open as workflow.** The preset becomes a graph you can edit, save
   and share.

```jsonc
{
  "id": "camera.bullet-time",
  "kind": "camera",            // camera | look | effect | studio
  "name": "Bullet time",
  "preview": "presets/camera/bullet-time.mp4",
  "inputs": ["image"],
  "stackable": true,
  "prompt": {
    "default": "frozen moment, camera orbits 180° around the subject",
    "kling":   "bullet time effect, time frozen, smooth 180 degree orbit",
    "seedance": { "suffix": "[orbit 180, time freeze]" }
  },
  "params": { "duration": 5 },
  "workflow": "presets/camera/bullet-time.graph.json"   // optional eject target
}
```

Where it plugs in: the shot editor's Movement select becomes this picker (free
strings keep working, as `cameraOptions` already allows), the chat composer's
video modes gain a preset chip, and the Effects gallery is a filtered view of
`kind: "effect"`.

## 04 Roadmap

Three phases, each one shippable. Sizes are rough engineering guesses from the
code as it stands, not estimates anyone has agreed to.

### Phase 1 · 3–4 weeks · Look like it

Enough to launch the claim.

1. **Preset format and registry.** Schema, loader, per-model compiler, 40 camera
   presets with preview loops rendered by NodeTool itself. New
   `packages/presets`, `cameraOptions.ts`.
2. **Visual camera picker.** In the shot editor and the chat video modes. Stack
   up to three. `ShotEditTable.tsx`, `ModeSelectChip.tsx`.
3. **Create view.** Prompt bar plus a grid of your generations, fed by the
   Generations store. `GenerationActivityStore.ts`, start page.
4. **Effects gallery v1.** 20 one-input effects, each a tiny workflow, on the
   start page and in **+ New**. `examples/apps`, `StartCreationTypes.tsx`.
5. **Alternatives page and calculator.** Refresh `/alternatives/higgsfield` with
   presets, a credit vs BYOK calculator, and an "open-source Higgsfield
   alternative" FAQ entry. `competitorEntries.ts`, `faqEntries.ts`.

### Phase 2 · 6–8 weeks · Work like it

Match the studios people come for.

1. **Look presets.** Camera body, film stock, grades, lighting, era and speed
   ramp as chips at board and shot level. Storyboard board settings.
2. **Studios on the start page.** Cinema (storyboard), Lipsync, Product and Ads,
   UGC, each an outcome-named entry with presets inside. Guided flows, recipes.
3. **Lipsync studio.** Entity plus line plus voice to a talking clip. Script
   editor voicing, lipsync providers.
4. **`@` entities everywhere.** Mention a character in any prompt box. Entities,
   composer.
5. **Video restyle and region edit.** Restyle presets on any clip. Paint a region
   on video. Retake mode, Change still.

### Phase 3 · ongoing · Beat it

The parts only open source can do.

1. **Community preset packs.** Publish a pack by pull request, install from a
   gallery, credit the author on the card. `packs.md`, the node-packs pattern.
2. **Local-first presets.** Every camera and effect preset tuned for one local
   video model, so "unlimited" means your GPU. WAN2GP, ComfyUI.
3. **Eject everywhere.** "Open as workflow" on every preset, effect and studio
   run. Send to workflow exists on boards.
4. **Showcase and contests.** Runs shown with the preset and models that made
   them. A monthly preset contest. Marketing showcase.
5. **Shared projects.** Live entities and boards for teams.
   `multiplayer-design.md`.

## 05 Positioning and messaging

Use the name where people search for it. `marketing/NARRATIVE.md` rules out
naming competitors on the homepage, and that rule is sound. "Open-source
Higgsfield" is a search and launch phrase, so it belongs in the places people
type it, while the homepage keeps the category line and shows the presets.

Say "open-source Higgsfield" in:

- Launch titles: Show HN, Product Hunt, Reddit, X.
- The GitHub README subtitle and repository description.
- The `/alternatives/higgsfield` H1 and an FAQ slug like the Figma Weave one.
- Short-form demo videos and their captions.

Keep it off:

- The homepage hero and metadata.
- Product UI names. Avoid "Soul", "Cinema Studio", "Popcorn" and "Genjutsu".
- Their logo, colors or screenshots anywhere.
- Any parity claim for a feature that has not shipped.

Candidate lines:

| Line | Where |
| --- | --- |
| The open-source Higgsfield. | Launch title, README |
| Every camera move. Your keys. Your machine. | Ad, social |
| Presets you can open. | Presets section, alternatives page |
| Credits that never expire, because there are none. | Pricing, alternatives page |
| Unlimited, on your own GPU. | Local models page |
| Use Higgsfield's models too, on your own Higgsfield key. | Alternatives page FAQ |

Proof the page should carry:

- The same shot, same model, priced on a Higgsfield plan and at provider list
  price, worked through from real run records. The
  [BRAND.md](../BRAND.md) rule on verified figures applies.
- A 20-second clip: tap a camera preset, then "Open as workflow" showing the
  graph behind it.
- A storyboard with eight shots and a consistent character, opening as an
  editable timeline. Higgsfield exports clips. NodeTool hands back the project.

## 06 Risks

- **Trademark.** Comparative use of the name is normally fine. Implying
  affiliation is not. Get the alternatives page and launch copy checked and log
  it in `marketing/LEGAL_OPEN_ITEMS.md`.
- **Preset quality.** Higgsfield's presets are tuned per model with lots of
  iteration. Forty excellent presets beat two hundred mediocre ones. Render
  every preview with NodeTool and keep the run record.
- **Onboarding friction.** BYOK means a new user needs a key before the first
  tap. Make the Effects gallery work on hosted credits in Cloud and on one free
  local model on desktop, so the first result needs no setup.
- **Proprietary models.** Soul and Genjutsu are Higgsfield models. NodeTool can
  reach some of them through the Higgsfield pack on the user's key, but should
  not claim open equivalents.
- **Safety.** Face swap and AI influencer tools draw misuse. Ship them only with
  consent checks on real-person references, or leave them out.

## Sources

- [higgsfield.ai](https://higgsfield.ai) (navigation, studios, models)
- [Higgsfield help: Cinema Studio](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-cinema-studio)
- [Higgsfield changelog, June–October 2026](https://higgsfield.ai/creator-hub/changelog)
- [Dynalord review](https://dynalord.com/blog/higgsfield-review), [Luma review](https://lumalabs.ai/news/higgsfield-review) (competitor), [Unite.ai review](https://www.unite.ai/higgsfield-ai-review/)
- [Creatify pricing breakdown](https://creatify.ai/blog/higgsfield-pricing-%282026%29-plans-and-what-you-ll-actually-pay) (competitor)
- NodeTool repository: [storyboard-editor.md](../storyboard-editor.md),
  [entities.md](../entities.md), [guided-flows.md](../guided-flows.md),
  [costs-and-credits.md](../costs-and-credits.md), `marketing/NARRATIVE.md`,
  `marketing/src/data/competitorEntries.ts`, `packages/higgsfield-nodes`
