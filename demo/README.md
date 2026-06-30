# NodeTool Demo Video Harness

Scripted, reproducible product-demo videos of the real NodeTool graph UI —
generations, streaming, and outputs — rendered with [Remotion](https://remotion.dev).

The trick: instead of running the live backend (and burning generation credits)
every time you render, you **record one real run into a `cast`** and replay that
cast deterministically. The same recording can be re-rendered any number of
times, retimed, captioned, and recomposed — with zero further generations.

```
record real run ──▶  cast.json  +  pinned assets  ──▶  Remotion render ──▶  demo.mp4
   (once, costs)        (stored, replayable)            (free, repeatable)
```

## How it fits together

| Piece | Location | Role |
| --- | --- | --- |
| **Cast format** | `web/src/demo/castTypes.ts` | The stored demo: workflow graph + node metadata + a time-stamped timeline of the exact protocol messages + an asset manifest. Plain, editable JSON. |
| **DemoEngine** | `web/src/demo/demoEngine.ts` | Replays a cast deterministically: `seekToTime(ms)` makes the execution stores reflect exactly the events up to `ms`. Backward seeks reset and replay. |
| **DemoPlayer** | `web/src/demo/DemoPlayer.tsx` | Renders the **real** `BaseNode`/`PreviewNode`/`OutputNode` etc. for a cast at a given time. The single rendering surface, shared by Remotion and the preview page. |
| **CastRecorder** | `web/src/demo/recorder.ts` | Taps the live message stream during a real run and assembles a cast. |
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
the pipeline before recording your own.

## Intro tutorial (no backend)

A ready-to-render "How to use NodeTool" walkthrough ships alongside the sample:

```bash
cd demo
npm run studio                 # open Studio, pick the "Tutorial" composition
npm run render:tutorial        # → demo/out/nodetool-tutorial.mp4
```

It replays a synthetic four-node pipeline — **Text Input → Enhance Prompt (LLM,
streaming) → Generate Image → Preview** (`web/src/demo/tutorialCast.ts`, inline
assets, no backend) — under a title card, a step indicator that tracks the active
node, lower-third captions, and a closing call-to-action (`demo/src/Tutorial.tsx`).
Edit the `DEFAULT_TUTORIAL_STEPS` / `DEFAULT_TUTORIAL_CAPTIONS` in `Tutorial.tsx`
to retime or reword the narration; the timeline itself lives in `tutorialCast.ts`.
To narrate a real recorded run instead, point the `Tutorial` composition at your
own cast id in `demo/src/Root.tsx`.

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

## Recording a real demo

1. **Record.** From the editor (dev build), capture one real run:

   ```ts
   import { CastRecorder, downloadCastJson } from "@/demo"; // web/src/demo

   const rec = new CastRecorder();
   rec.start({
     workflowId,
     getWorkflow: () => nodeStore.getState().getWorkflow(),
     getMetadata: () => useMetadataStore.getState().metadata,
   });
   // …click Run, let the workflow finish…
   const cast = rec.stop({ name: "Image generation", fps: 30 });
   downloadCastJson(cast); // saves <name>.cast.json
   ```

   (Wire this to a dev-only "Record demo" button, or call it from the console.)

2. **Store.** Drop the file in `demo/casts/`, e.g. `demo/casts/image-gen.cast.json`.

3. **Pin assets** so replay needs no backend (run once, while the server that
   produced the run is still up so the asset URLs resolve):

   ```bash
   cd demo
   npm run pin-assets -- casts/image-gen.cast.json --api http://localhost:7777
   ```

   This downloads every generated image/audio/video into
   `demo/public/casts/<castId>/` and rewrites the cast's manifest in place.

4. **Register** the cast in `demo/src/casts/registry.ts`:

   ```ts
   import imageGen from "../../casts/image-gen.cast.json";
   const casts: DemoCast[] = [sampleCast, imageGen as DemoCast];
   ```

5. **Render.** It now has its own composition (`Demo-<castId>`), or point the
   default `WorkflowDemo` composition at it:

   ```bash
   npm run studio                                   # preview + scrub
   npx remotion render src/index.ts Demo-image-gen out/image-gen.mp4
   ```

## Editing a cast

A cast is just JSON. After recording you can:

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
the web components — give it a minute. The sample renders cleanly today; the
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
cost of some CSS-animation determinism. The cast format, recorder, and player
are identical either way.

## Determinism notes

- Frame state is a pure function of `timeMs` — forward seeks apply incrementally,
  backward seeks (Studio scrubbing) reset and replay.
- Each player instance remaps recorded `job_id`s to fresh ids so the reducer's
  module-level per-job bookkeeping never collides across instances.
- Realtime **audio** streaming is coalesced on a timer in the reducer; v1 casts
  capture audio metadata but not sample-accurate binary audio. Text, images,
  video, progress, and status are fully deterministic.
