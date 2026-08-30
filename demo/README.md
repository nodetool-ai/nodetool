# NodeTool Demo Video Harness

Scripted, reproducible product-demo videos of the real NodeTool graph UI —
generations, streaming, and outputs — rendered with [Remotion](https://remotion.dev).

The trick: instead of running the live backend (and paying provider rates)
every time you render, you author a **cast** — a timeline of the exact protocol
messages a run emits — and the player replays it deterministically. The same
cast re-renders any number of times, retimed, captioned, and recomposed, with
no generations at all.

```
authored cast  +  pinned assets  ──▶  Remotion render ──▶  demo.mp4
    (stored, replayable)                (free, repeatable)
```

## How it fits together

| Piece | Location | Role |
| --- | --- | --- |
| **Cast format** | `web/src/demo/castTypes.ts` | The stored demo: workflow graph + node metadata + a time-stamped timeline of the exact protocol messages + an asset manifest. Plain, editable JSON. |
| **DemoEngine** | `web/src/demo/demoEngine.ts` | Replays a cast deterministically: `seekToTime(ms)` makes the execution stores reflect exactly the events up to `ms`. Backward seeks reset and replay. |
| **DemoPlayer** | `web/src/demo/DemoPlayer.tsx` | Renders the **real** `BaseNode`/`PreviewNode`/`OutputNode` etc. for a cast at a given time. The single rendering surface, shared by Remotion and the preview page. |
| **Preview page** | `web/demo.html` + `web/src/demo-entry.tsx` | Scrub/preview a cast in a browser (`npm start` in `web/`, open `/demo.html`). |
| **Remotion project** | `demo/` (this dir) | Compositions that embed `DemoPlayer`, drive it from the frame clock, and add title cards / captions. |

Because the player reuses the production node components and drives the
production update reducer (`handleUpdate`), the video looks exactly like the app
— running rings, streaming text, progress bars, and final outputs included. With
**direct embed**, Remotion's deterministic clock also drives the UI's CSS
animations, so every frame is reproducible.

## Quick start (the built-in sample, no backend)

```bash
# from repo root, after `npm install`
cd demo
npm run studio          # open Remotion Studio on the sample cast
npm run render          # render WorkflowDemo → demo/out/workflow-demo.mp4
```

The sample cast (`web/src/demo/sampleCast.ts`) is fully synthetic (inline assets,
no backend) — a two-node "stream text → image preview" demo. Use it to validate
the pipeline before authoring your own.

## Intro tutorial (no backend)

A ready-to-render "How to use NodeTool" walkthrough ships alongside the sample:

```bash
cd demo
npm run studio                 # open Studio, pick "Tutorial-first-workflow"
npm run render:tutorial:first  # → docs/assets/tutorials/first-workflow.mp4
npm run render:tutorials       # all seven tutorial compositions
```

It replays a synthetic four-node pipeline — **Text Input → Enhance Prompt (LLM,
streaming) → Generate Image → Preview** (`web/src/demo/tutorialCast.ts`, inline
assets, no backend) — under a title card, a step indicator that tracks the active
node, lower-third captions, and a closing call-to-action (`demo/src/Tutorial.tsx`).
Edit the entry's `steps` / `captions` in `demo/src/tutorials.ts` to retime or
reword the narration; the timeline itself lives in `tutorialCast.ts`. To narrate
a different run, point the entry's `castId` at your own cast.

## Cookbook recipe videos (no backend)

One short video per recipe in `docs/cookbook/patterns.md` — 15 in all, from the
simple image-enhancement pipeline to text-to-video and talking avatars. Each is a
synthetic, backend-free cast that replays the real graph UI building and running
the recipe, narrated by the same `Tutorial` composition (title card → step
indicator + captions → call-to-action).

```bash
cd demo
npm run render:cookbook                          # all 15 → docs/assets/cookbook/<slug>.mp4 + .jpg
npm run render:cookbook -- --only text-to-video  # one recipe
npm run still:cookbook                            # JPG thumbnails only (fast)
```

The casts live in `web/src/demo/cookbook/` (one file per recipe, built from the
shared metadata factories in `cookbook/builders.ts`); the per-recipe titles,
camera beats, and captions live in `demo/src/cookbook.ts`. Every node type is a
real registry type and the media is inline (the kitten image, a tiny WebM clip,
a short WAV chime — `web/src/demo/assets/`), so they replay with no backend and
no generation credits. `scripts/render-cookbook.ts` bundles the project once and
renders all 15, so it's far cheaper than 15 separate `remotion render` calls.

## Workflow-gallery videos (no backend)

Every example on the docs Workflow Gallery (`docs/workflows/`) embeds a demo
video. Examples that match a cookbook recipe reuse that recipe's video; the rest
get their own synthetic cast here — Transcribe Audio, Data Generator, Creative
Story Ideas, Meeting Transcript Summarizer, Categorize Mails, Color Boost Video,
and Fetch Papers. Same shape as the cookbook videos: a backend-free cast replayed
through the real graph UI under the `Tutorial` composition.

```bash
cd demo
npm run render:workflows                              # all → docs/assets/workflows/<slug>.mp4 + .jpg
npm run render:workflows -- --only transcribe-audio  # one example
npm run still:workflows                              # JPG thumbnails only (fast)
```

The casts live in `web/src/demo/workflows/` (reusing `cookbook/builders.ts`); the
per-example titles, camera beats, and captions live in `demo/src/workflows.ts`.
`scripts/render-workflows.ts` bundles once and renders all of them.

## Other UI surfaces (chat, timeline, documents)

The graph editor isn't the only NodeTool UI that can star in a tutorial video.
The same "hand-author a cast, replay it through the real components, drive it
from Remotion's clock" approach works for any surface whose state is a pure
function of a handful of props or a small store. Every surface a user can open
a document in is covered:

| Surface | Cast type | Player | Tutorial composition |
| --- | --- | --- | --- |
| Graph editor | `DemoCast` (`web/src/demo/castTypes.ts`) | `DemoPlayer` | `Tutorial` |
| Global Chat | `ChatDemoCast` (`web/src/demo/chat/chatCastTypes.ts`) | `ChatDemoPlayer` | `ChatTutorial` |
| Timeline editor | `TimelineDemoCast` (`web/src/demo/timeline/timelineCastTypes.ts`) | `TimelineDemoPlayer` | `TimelineTutorial` |
| Sketch, script, storyboard, JS script, mini app | `DocDemoCast` (`web/src/demo/doc/docCastTypes.ts`) | `DocDemoPlayer` | `DocTutorial` |

All four tutorial compositions share one shell, `demo/src/components/TutorialShell.tsx`
— the title card / step indicator / lower-third captions / outro card timing —
so a new surface only has to supply a replay player, not re-implement the
narration chrome. See `demo/src/Tutorial.tsx`, `ChatTutorial.tsx`,
`TimelineTutorial.tsx`, and `DocTutorial.tsx` for the four (nearly identical)
call sites.

```bash
cd demo
npm run render:tutorial:chat-agent-qa           # Ask the chat agent → docs/assets/tutorials/chat-agent-qa.mp4
npm run render:tutorial:timeline-trim-arrange   # Cut a scene together → docs/assets/tutorials/timeline-trim-arrange.mp4
npm run render:tutorials:docs                   # the five document tutorials (sketch, script, storyboard, JS script, app)
npm run still:tutorials:docs                    # their posters
npm run render:tutorials:steering               # the three steering tutorials (correction, ask-before-spend, red-then-green)
npm run still:tutorials:steering                # their posters
```

The steering casts revisit three surfaces the document tutorials already cover,
so a surface has more than one cast: `sketch-correction` answers a result the
user rejects, `storyboard-ask` stops on a question and renders nothing until
it is answered, and `jsscript-repair` runs a saved case red before the repair
makes it green. What they teach is not the surface but the loop around it —
correct, decide, verify.

Everything renders into `docs/assets/tutorials/`, which the documentation
site serves. The app streams the MP4s from there and ships only the posters,
so after rendering run `npm run sync:posters` to copy the JPGs into
`web/public/tutorials/` — a test fails if the two copies differ, or if an MP4
turns up in the app bundle.

A rendered MP4 is only half a tutorial: the app plays it from
`web/src/components/tutorials/tutorialsData.ts`, so add an entry there (id,
title, `learn` bullets, video, poster) once the files exist. The entries and
the files land in the same change — a test fails on an entry whose video was
never rendered.

One ordering note: the app's `<video>` gets no `src` until the viewer presses
play, so a tutorial whose MP4 has not reached the live docs site yet still
renders (the poster is local) and only 404s if someone plays it before the
docs deploy.

**Chat** (`web/src/demo/chat/`): `ChatView` is prop-driven, not store-driven, so
`ChatDemoPlayer` skips the "engine" machinery entirely — `computeChatStateAt`
is a plain fold over `ChatCastEvent[]` (message arrives, token streams in, tool
call starts/finishes, status changes) recomputed fresh on every frame. A couple
of chat components (the tool-call spinner, the todo sidebar) read a few fields
straight off the global `GlobalChatStore` instead of props; `seedChatGlobalState`
mirrors the replay state into that store each frame, the same "seed the shared
store" trick `seedCastMetadata`/`seedDemoAuth` use for the graph editor.

**Timeline** (`web/src/demo/timeline/`): mounts the editor's own layout inside a
`TimelineProvider` — `TopBar`, `PreviewArea` beside `TimelineInspector`,
`TracksRegion`, `BottomStatusBar` — but not the full `TimelineEditor` page,
which also wires up autosave, generation-job subscriptions, and tRPC-backed
sequence loading that don't apply to a hand-authored, backend-free cast. The
chrome reads the same stores the engine seeds: the inspector shows the clip the
cast's `select` event picked, the status bar the zoom its `zoom` event set. The
top bar's actions are inert — a tutorial should show where Save and Export live,
and a replay must not run them. A composition that draws its own chrome (the
promo, with its recreated prompt bar) passes `chrome={false}` for the bare
preview + tracks surface. The chrome lives in `timelineChrome.tsx` so it can be
mounted without the preview compositor, which needs a canvas backend a test
environment has no way to give it (`__tests__/timelineChrome.test.tsx`).
`TimelineDemoEngine` seeds a fresh `TimelineInstance` (`createTimelineInstance`,
exported from `TimelineInstance.tsx` for exactly this purpose) with the cast's
starting `TimelineSequence`, then folds `TimelineCastEvent[]` (add/patch/remove
a clip, select, zoom, seek, or ramp the playhead) into the instance's stores on
every seek. Clips reference media by `currentAssetId`; `seedTimelineCastAssets`
patches `useAssetStore.get` to resolve those ids from the cast's inline `data:`
URIs — or, for media too large to inline, from pinned files: a
`TimelineCastAsset` may carry `file` instead of `dataUri`, resolved through the
player's `resolveAssetUrl` prop (Remotion `staticFile`), the same pinning
scheme the graph cast uses.

**Documents** (`web/src/demo/doc/`): one format and one player for all five
document types — sketch, script, storyboard, JS script, mini app. Where the
other two formats invent an op language per surface, a `DocDemoCast` event is a
**shallow patch of the document root**, and the fold (`docStateAt`) is "apply
every patch with `t <= timeMs`". `seedDocState` then pushes the folded document
into whichever store the surface reads (`ScriptStore.loadScript`,
`StoryboardStore.loadBoard`, `JsScriptStore.loadScript`); sketch and app render
straight from props, so for them it is a no-op and the player passes the
document down. `DocDemoPlayer` mounts the production component per surface —
`SketchRenderer`, `ScriptDocumentPane`, `StoryboardBoard`, `JsScriptEditorPane`,
`AppRuntimeView` — read-only, without each editor's page shell (autosave,
generation subscriptions, tRPC loading).

Sketch is the one surface with chrome of its own: `SketchEditorSurface` puts the
production toolbar, layers panel, and status bar around `SketchRenderer`, all
subscribed to a `SketchInstance` the player seeds per frame — so the tool lights
up in the toolbar because the cast says so, and the panel's opacity and blend
controls move as the assistant sets them. The canvas stays `SketchRenderer`
rather than the interactive `SketchCanvasPane`: a replay renders state and never
accepts input, so the painting, pointer, and history machinery has nothing to
drive it. That is why a sketch cast's document has two halves — `document` (the
layer stack) and `editor` (tool, zoom, colors, panel selection), each patchable
on its own.

Every document cast also carries an **assistant track**: the conversation that
produced the edits, in the same event shape the chat cast uses. `AssistantDock`
(`web/src/demo/assistant/`) renders it with the real `ChatView` beside the
document, so the video shows the surface and the assistant that changed it at
once. The two tracks are authored against one clock — the assistant's tool call
runs, and the patch that follows is what it did. `docCasts.test.ts` enforces
that: every patch has an assistant turn behind it, and the last frame still
shows every tool call the assistant made.

Preview one without Remotion: `cd web && npm start`, then open
`http://localhost:3000/demo.html?doc=sketch-assistant` (any cast id from
`web/src/demo/doc/casts.ts`) and scrub it.

To add a sixth surface, follow the same shape: a `<Surface>CastTypes.ts`
(events + a base document/props snapshot), a pure replay function or minimal
engine class, a `<Surface>DemoPlayer.tsx` that mounts the real production
component(s) inside whatever provider stack they need, a cast registry, and a
`<Surface>Tutorial.tsx` composition built on `TutorialShell`.

## The product promo (`demo/src/promo/`)

The landing-page / social product video (script: `marketing/VIDEO_SCRIPT.md`)
is a scene-based composition that goes beyond the tutorial shell: a real-film
hook (`<OffthreadVideo>`), Act 1 on the graph editor (`DemoPlayer` replaying
`promo-trailer` with an authored camera), Act 2 on the timeline editor
(`TimelineDemoPlayer` replaying `promo-timeline`, plus a recreated
generate-at-the-playhead prompt bar), a cost-dashboard beat, and an export /
brand-card close. Registered at two sizes: `Promo-Master` (1920×1080) and
`Promo-Landing` (2250×1500, the landing page's 3:2 `/demo.mp4` slot); the
scenes read `useVideoConfig()`, so both come from the same components.

```bash
cd demo
npm run render:promo            # → demo/out/promo-master.mp4 (16:9)
npm run render:promo:landing    # → demo/out/promo-landing.mp4 (3:2)
npm run still:promo             # one frame for a fast visual check
```

The media under `demo/public/casts/promo/` are real segments of
`marketing/public/movie_trailer_example.mp4`, cut with Remotion's bundled
ffmpeg (`npx remotion ffmpeg`). Two codec rules keep renders working
everywhere:

- **In-DOM `<video>` media must be VP9/WebM.** The node cards and timeline
  clips play through real `<video>` elements in the render browser, and
  Chromium builds without proprietary codecs (e.g. Playwright's) can't decode
  H.264 — cards silently capture black. `OffthreadVideo` sources (the hook and
  close films) decode server-side, so they stay H.264 MP4.
- **Frame-exact video cards need `onPendingMedia`.** Both players accept the
  prop and report a promise per not-yet-decoded video
  (`web/src/demo/mediaReadiness.ts`); `demo/src/promo/usePendingMediaDelay.ts`
  maps each to a `delayRender` handle so no captured frame shows an unloaded
  card.

The promo's casts live with the other synthetic casts —
`web/src/demo/promoTrailerCast.ts` and
`web/src/demo/timeline/promoTimelineCast.ts` (invariants guarded by
`web/src/demo/__tests__/promoCasts.test.ts`).

## The landing-page hero (`demo/src/hero/`)

A silent 44 s loop of one project going from a sentence to a finished cut —
the same story the landing page tells below the fold, so the reel and the
section under it are the same session rather than two pitches.

```bash
cd demo
npm run render:hero            # → out/hero-project.mp4 (16:9)
npm run render:hero:vertical   # → out/hero-project-vertical.mp4 (9:16)
npm run encode:hero            # masters → marketing/public/, both codecs + posters
```

`remotion render` writes a visually lossless master — around 24 MB for the
44 s reel — and the hero autoplays on first paint, so `encode:hero` is not
optional: it re-encodes to H.264 and VP9 at a fraction of that and cuts the
WebP posters the `<img>` srcSet needs. Pass `--frame <n>` to poster a
different moment.

Pace is one number: `PACE` in `heroChrome.ts`. Every beat in the reel — stage
boundaries, caption staggers, the word-by-word open, the closing montage —
goes through `paced()`, so the whole thing speeds up or slows down together
rather than the captions popping while the surfaces crawl.

Five beats, four of them a real product surface replaying a real cast:

| Beat | Surface | Cast |
| --- | --- | --- |
| Brief | full-frame type | `HERO_BRIEF` |
| Describe | Global Chat | `hero-brief` (`web/src/demo/hero/heroBriefCast.ts`) |
| Board · Render | Storyboard | `hero-storyboard` (one shot, two passes) |
| Cut | Timeline | `hero-timeline` |
| Deliver | the six clips, full frame | the pinned takes |

The three casts share `web/src/demo/hero/shared.ts`, which is what makes the
reel one session: the six SCRAPHEART shots are described in chat, boarded,
rendered, and cut in the same order, and the clips that play under the closing
headline are the ones the board rendered. `web/src/demo/hero/__tests__/`
pins that — a cut with a gap in it, or a clip that lost its board provenance,
fails there rather than in a loop nobody watches to the end.

Two things the reel needed that the harness did not have:

- **Pinned media on a document cast.** A `DocDemoCast` may now carry an
  `assets` manifest and address it as `cast-asset://<key>`, the way the graph
  and timeline casts do; `DocDemoPlayer` rewrites those refs through its
  `resolveAssetUrl`. Six two-second clips do not fit in a `data:` URI.
- **A playhead for in-DOM video.** The shot cards play through plain
  `<video>` elements, which a frame renderer never advances — so a board of
  six rendered clips captured as a board of six stills, and the render pass
  read as nothing happening. `DocDemoPlayer`'s `mediaTimeMs`
  (`web/src/demo/videoPlayhead.ts`) seeks them per frame.

## Adding a demo

1. **Author the cast.** Write a module in `web/src/demo/` exporting a
   `DemoCast` — the workflow graph, the node metadata for the types it uses,
   and the timeline of protocol messages with their `t` offsets. Start from
   `sampleCast.ts` (fully self-contained) or `promoTrailerCast.ts` (references
   pinned media). Export it from `web/src/demo/index.ts`.

2. **Pin any media** it references under `demo/public/casts/<castId>/` and
   address them from the cast as `cast-asset://<key>`, with a matching manifest
   entry in `assets`. The player rewrites those refs to host URLs at load time
   (`web/src/demo/assetSubstitution.ts`), so a cast replays with no backend and
   no further generations.

3. **Register** the cast in `demo/src/casts/registry.ts`:

   ```ts
   import { imageGenCast } from "@web-demo";
   const casts: DemoCast[] = [sampleCast, imageGenCast];
   ```

4. **Render.** It now has its own composition (`Demo-<castId>`), or point the
   default `WorkflowDemo` composition at it:

   ```bash
   npm run studio                                   # preview + scrub
   npx remotion render src/index.ts Demo-image-gen out/image-gen.mp4
   ```

## Editing a cast

A cast is plain data. You can:

- **Trim / retime**: adjust `events[].t` and `durationMs`.
- **Add captions / title**: pass `captions` and `title` to the composition
  (see `demo/src/Root.tsx`).
- **Swap assets**: drop a different file in `public/casts/<id>/` and update the
  manifest `file`.
- **Re-frame**: set `viewport: { x, y, zoom }` for a fixed camera (otherwise the
  player fits the graph to view).

## Why direct embed (and the webpack override)

The composition imports `DemoPlayer` from `web/src` and renders it inline, so the
node UI is part of Remotion's DOM and its animations are frame-deterministic.
This is verified end-to-end (`npm run render` produces an MP4 of the sample).
`demo/src/webpackOverride.ts` reproduces what `web/vite.config.ts` does so the
components bundle for the browser:

1. the `nodetool-dev` export condition (so `@nodetool-ai/*` resolve to TS source);
2. `extensionAlias` so TS-ESM `./x.js` imports resolve to `x.ts`;
3. a `node:`-scheme strip plugin + browser-safe built-in stubs (reusing
   `web/vite-node-stubs/`) for kernel server paths the render never runs;
4. a bumped esbuild target + `topLevelAwait` for `@nodetool-ai/config`;
5. an `@svgr/webpack` rule for `*.svg?react` icons (and excluding that query from
   Remotion's default asset rule);
6. the generated `@nodetool/{fal,kie}-*-pricing` JSON aliases.

`DemoPlayer` also wraps the tree in a `MemoryRouter` (node components use
react-router hooks). If a render fails on a server-only module, add its specifier
to the `IGNORE` list in `webpackOverride.ts`.

## First render & troubleshooting

The first `npm run studio` / `render` downloads a headless Chromium and bundles
the web components — give it a minute. To reuse a system browser instead of the
download, set `CHROMIUM_PATH` (honored by both the batch scripts and, via
`remotion.config.ts`, the plain `remotion` CLI commands). It must be a
new-headless-capable build — a Chrome headless shell works; note that builds
without proprietary codecs can't decode H.264 in `<video>` elements (see the
promo section's codec rules). The sample renders cleanly today; the
override already handles every Vite↔webpack parity gap in the current node UI
(see the list above). A new cast that pulls in a node type the sample doesn't
could surface another gap — if so, the error names it. Add the matching
rule/alias to `webpackOverride.ts`:

- a Vite query import (`?worker`, `?raw`, `?url`) → add a webpack rule for that
  `resourceQuery`;
- `import.meta.glob` → replace with explicit imports (it is Vite-only);
- a server-only package → add it to `IGNORE`.

**Fallback:** if direct-embed bundling is more than you want to chase, the same
player is served as a standalone page at `web/demo.html` (run `npm start` in
`web/`). You can drive that page from Remotion via an `<IFrame>` + the
`window.nodetoolDemo.seek(ms)` API instead of embedding the component — at the
cost of some CSS-animation determinism. The cast format and player are
identical either way.

## Determinism notes

- Frame state is a pure function of `timeMs` — forward seeks apply incrementally,
  backward seeks (Studio scrubbing) reset and replay.
- Each player instance remaps recorded `job_id`s to fresh ids so the reducer's
  module-level per-job bookkeeping never collides across instances.
- Realtime **audio** streaming is coalesced on a timer in the reducer; v1 casts
  capture audio metadata but not sample-accurate binary audio. Text, images,
  video, progress, and status are fully deterministic.
