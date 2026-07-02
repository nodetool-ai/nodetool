# NodeTool Product Video — Script

One video, two placements: the `#demo-video` slot on the landing page
(`src/app/page.tsx`, plays as `/demo.mp4` at 3:2) and social posts (X, Instagram,
TikTok, YouTube Shorts, LinkedIn). The master cut is 45 seconds; 30s and 15s
cutdowns are specified below.

Design constraints that shape every scene:

- **Works muted.** Social feeds autoplay silent and most landing-page visitors
  never unmute. On-screen text carries the full message; the voice-over is an
  optional layer for sound-on contexts.
- **Hook inside 3 seconds.** Social scroll-past is decided by then. We open on
  a finished result, not a logo.
- **Show the work.** Real product footage only: the canvas, nodes rendering,
  the timeline editor. No stock, no motion-graphics abstractions (brand rule,
  see `PRODUCT.md`).
- **Echo the page.** Every text card reuses landing-page copy verbatim, so the
  video and the page read as one voice.

## Concept

A two-act creative workflow, told in real footage:

- **Act 1 — the canvas generates variations.** One prompt fans out into four
  takes across models (Seedance, Wan), rendered in parallel with the user's
  own keys. This carries "every major model, your keys" without a separate
  scene.
- **Act 2 — the timeline builds the final video.** The best takes go onto the
  built-in multi-track timeline: trim, split, rearrange, music underneath.
  A missing shot gets prompted **at the playhead** and lands on the track with
  no import step. Export a finished cut.

The subject is the **Movie Trailer Generator** use case: the graph generates
shot variations, the timeline turns them into the trailer. The video's arc is
the product's arc — generate wide, then cut with intent.

## Master cut — 45 seconds

| Time | Scene | Visual | On-screen text | Voice-over |
|---|---|---|---|---|
| 0:00–0:03 | Hook | The finished trailer plays full-frame for ~1.5s, then scales down into the timeline's preview monitor; the full editor with its cut sequence comes into view. | **Made in NodeTool. Start to finish.** | "This was made in NodeTool, start to finish." |
| 0:03–0:12 | Generate variations | Cut to the canvas: a prompt node fans out into four video nodes. Click Run; four takes render in parallel in their preview nodes — two from Seedance, two from Wan, model names visible on the nodes. | **Generate variations on the canvas.** Small line: One prompt. Four takes. Seedance · Wan · your keys | "On the canvas, one prompt fans out into variations — takes from Seedance, Wan, whichever models you want, rendered with your own keys." |
| 0:12–0:16 | Pick | Scrub two takes side by side in their preview nodes; a beat of comparison, then a decisive click on the winner. | **Keep the takes that work.** | "Keep the best takes…" |
| 0:16–0:25 | Build the cut | The chosen takes drag onto the timeline editor. Multi-track view: clips trimmed, split, reordered on the video track; a music waveform (Suno) on the audio track below; playhead scrubs the sequence. | **Build the final video on the timeline.** Small line: Multi-track video & audio. | "…and build the cut on the built-in timeline. Video and audio, trim, split, rearrange." |
| 0:25–0:31 | Generate at the playhead | A gap in the sequence. Type a prompt into the timeline's prompt bar; the new clip renders and lands on the track right under the playhead. | **Missing a shot? Prompt it at the playhead.** Small line: No import step. | "Missing a shot? Prompt it at the playhead and the clip lands on the track. No import, no second app." |
| 0:31–0:37 | Cost | The cost dashboard: per-node prices, grouped by provider, real dollar amounts. | **Your keys. Provider prices.** Then: **No credits. No markup.** | "You pay providers directly. No credits, no markup." |
| 0:37–0:45 | Export & close | Click Export; the finished trailer plays full-frame for ~3s, then the NodeTool mark over a defocused canvas. | **Export a finished cut.** Then: **NodeTool — the open creative AI workspace.** CTA line: Free & open source · nodetool.ai | "Export the finished cut. NodeTool is free and open source. Download it, and put every model on one canvas." |

### Voice-over, full read (~90 words, conversational pace)

> This was made in NodeTool, start to finish. On the canvas, one prompt fans
> out into variations — takes from Seedance, Wan, whichever models you want,
> rendered with your own keys. Keep the best takes and build the cut on the
> built-in timeline: video and audio, trim, split, rearrange. Missing a shot?
> Prompt it at the playhead and the clip lands on the track. No import, no
> second app. You pay providers directly. No credits, no markup. NodeTool is
> free and open source. Download it, and put every model on one canvas.

Read direction: calm and matter-of-fact, a pro tool talking to a pro. No
announcer energy. The cost lines ("no credits, no markup") land as plain fact,
not as a pitch.

## Cutdowns

**30 seconds** (X, Instagram feed, landing fallback): merge Pick into
Generate variations (the winner click ends the scene), compress Build the cut
to 6s, drop the Cost scene to a single text card over the Export scene
("Your keys. Provider prices. No markup."). Scene order otherwise unchanged.

**15 seconds** (Shorts, TikTok, Reels teaser) — the two-act arc at maximum
compression:

| Time | Scene | On-screen text |
|---|---|---|
| 0:00–0:03 | Hook (same as master) | **Made in NodeTool. Start to finish.** |
| 0:03–0:07 | Four takes rendering in parallel on the canvas | **Generate variations on the canvas.** |
| 0:07–0:12 | Takes drag onto the timeline; prompt-at-playhead fills the gap | **Cut the final video on the timeline.** |
| 0:12–0:15 | Finished trailer + logo | **Free & open source · nodetool.ai** |

## Deliverables

Compose the footage with a center-safe area so one timeline yields all crops
without reframing UI actions. The timeline editor is wide; in the 9:16 crop,
frame Act 2 on the playhead region and let the track edges bleed.

| Format | Aspect | Resolution | Placement |
|---|---|---|---|
| Master | 3:2 | 2250×1500 | Landing page `/demo.mp4` slot (renders at 3:2) |
| Wide | 16:9 | 1920×1080 | YouTube, X, LinkedIn |
| Square | 1:1 | 1080×1080 | Instagram feed |
| Vertical | 9:16 | 1080×1920 | Reels, TikTok, Shorts (15s and 30s cuts only) |

Text cards sit in the vertical-crop safe area. Keep cursor actions, the active
node, and the playhead near frame center.

## Sound

- Music: one understated electronic bed, low-mid energy, no drop, no risers.
  From 0:16 the bed is the Suno track visible on the timeline's audio track,
  so what you hear is what the edit shows.
- UI sounds: subtle clicks on node connect and Run, a soft tick per take
  completion, a snap when the playhead clip lands. Mixed low, felt more than
  heard.
- Master audio ends 0.5s before picture so loop-play on the landing page
  doesn't clip.

## Social post copy

**X:**

> One prompt, four takes. Generate variations on the canvas — Seedance, Wan,
> your keys — then cut the final video on the built-in timeline. Missing a
> shot? Prompt it at the playhead. No credits, no markup, open source.
> nodetool.ai

**LinkedIn:**

> This trailer was made in one app. The node graph generated four takes per
> shot across Seedance and Wan, called with our own API keys. The best takes
> went onto NodeTool's built-in multi-track timeline: trim, split, music
> underneath, and a missing shot prompted straight at the playhead — the clip
> lands on the track, no import step. You pay providers what they charge;
> NodeTool takes zero cut. Free, open source, runs anywhere. nodetool.ai

**Instagram / TikTok caption:**

> Generate the takes. Cut the video. One app.
> #opensource #aivideo #generativeai #videoediting #creativetools

## Production notes

Produce it with the Remotion harness in `demo/` (see `demo/README.md`):

1. Record one real run of the variation-generating graph with `CastRecorder`
   (`web/src/demo/recorder.ts`) — a prompt node fanned into four video nodes.
   The cast replays deterministically, so retiming and re-rendering cost no
   further generations. Pin the four rendered takes as cast assets; the same
   files appear in Act 2 on the timeline, which keeps the two acts visibly
   continuous.
2. Build Act 1 on `DemoPlayer` — it renders the production node components,
   so running rings, streaming text, and progress bars look exactly like the
   app.
3. Act 2 (timeline build, prompt-at-playhead, export) is a screen capture of
   the timeline editor. Keep cursor speed unhurried and constant; rehearse the
   drag-trim-split sequence so it reads in one pass.
4. Add the text cards and the hook's pull-back move in Remotion
   (`demo/src/Tutorial.tsx` is the pattern for title cards and captions).
5. Render the 3:2 master first, then the crops. Replace
   `marketing/public/demo.mp4` and verify the `#demo-video` section on the
   landing page.
