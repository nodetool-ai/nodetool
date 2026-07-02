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
  the editors. No stock, no motion-graphics abstractions (brand rule, see
  `PRODUCT.md`).
- **Echo the page.** Every text card reuses landing-page copy verbatim, so the
  video and the page read as one voice.

## Concept

Open on a cinematic trailer shot. Pull back: the shot is the output node of a
workflow, and the whole canvas that made it comes into view. Then walk the
page's three-step mental model in real footage — wire, render, edit — land the
honesty beat (your keys, provider prices), and close on the finished trailer
and the download CTA.

The workflow on screen is the **Movie Trailer Generator** use case: script
(LLM) → stills (Flux) → clips (Seedance) → voice-over (ElevenLabs) → music
(Suno) → timeline.

## Master cut — 45 seconds

| Time | Scene | Visual | On-screen text | Voice-over |
|---|---|---|---|---|
| 0:00–0:03 | Hook | A finished trailer shot plays full-frame for ~1.5s, then scales down into a Preview node; the camera pulls back to reveal the whole graph on the canvas. | **This was made on one canvas.** | "This trailer was made on one canvas." |
| 0:03–0:10 | Wire | Cursor drags nodes from the node menu and connects them: LLM → Flux → Seedance, plus ElevenLabs and Suno branches. Real node names visible. | **Every major model. Every provider.** Small line: Flux · Seedance · Wan · Whisper · ElevenLabs · Suno | "Every major model, from every major provider, is a node. Wire them together." |
| 0:10–0:18 | Render | Click Run. Nodes light up in order: text streams in the LLM node, stills fade in, a clip renders in the video node. Log ticks and timings visible. | **Render with your keys.** Then: **Watch every node finish.** | "Run it with your own keys, and watch every node render." |
| 0:18–0:24 | Swap | Open the model selector on the video node, switch the model, re-run from that node down. Only downstream nodes re-render. | **New model ships? Swap one node.** | "When a new model ships, swap one node and re-run." |
| 0:24–0:31 | Edit | Double-click the clip into the timeline editor: trim, reorder three clips, scrub the playhead. Quick cut to an inpaint mask on a still. | **Edit and finish where you generate.** Small line: No export. No second app. | "Cut, mask, and arrange in the built-in editors. No export, no second app." |
| 0:31–0:38 | Cost | The cost dashboard: per-node prices, grouped by provider, real dollar amounts. | **Your keys. Provider prices.** Then: **No credits. No markup.** | "And the bill? You pay providers directly. No credits, no markup." |
| 0:38–0:45 | Close | The finished trailer plays full-frame for ~3s, then the NodeTool mark over a defocused canvas. | **NodeTool — the open creative AI workspace.** CTA line: Free & open source · nodetool.ai | "NodeTool is free and open source. Download it, and put every model on one canvas." |

### Voice-over, full read (~85 words, conversational pace)

> This trailer was made on one canvas. Every major model, from every major
> provider, is a node. Wire them together. Run it with your own keys, and
> watch every node render. When a new model ships, swap one node and re-run.
> Cut, mask, and arrange in the built-in editors. No export, no second app.
> And the bill? You pay providers directly. No credits, no markup. NodeTool is
> free and open source. Download it, and put every model on one canvas.

Read direction: calm and matter-of-fact, a pro tool talking to a pro. No
announcer energy. The cost lines ("no credits, no markup") land as plain fact,
not as a pitch.

## Cutdowns

**30 seconds** (X, Instagram feed, landing fallback): drop the Swap scene,
compress Edit to 4s (timeline only, no inpaint), compress Cost to 5s. Scene
order and text unchanged.

**15 seconds** (Shorts, TikTok, Reels teaser):

| Time | Scene | On-screen text |
|---|---|---|
| 0:00–0:03 | Hook (same as master) | **This was made on one canvas.** |
| 0:03–0:09 | Render montage: run, nodes lighting up, clip appearing | **Every major model. Your keys. No markup.** |
| 0:09–0:12 | Swap-one-node beat | **New model? Swap one node.** |
| 0:12–0:15 | Finished trailer + logo | **Free & open source · nodetool.ai** |

## Deliverables

Compose the canvas footage with a center-safe area so one timeline yields all
crops without reframing UI actions.

| Format | Aspect | Resolution | Placement |
|---|---|---|---|
| Master | 3:2 | 2250×1500 | Landing page `/demo.mp4` slot (renders at 3:2) |
| Wide | 16:9 | 1920×1080 | YouTube, X, LinkedIn |
| Square | 1:1 | 1080×1080 | Instagram feed |
| Vertical | 9:16 | 1080×1920 | Reels, TikTok, Shorts (15s and 30s cuts only) |

Text cards sit in the vertical-crop safe area. Keep cursor actions and the
active node near frame center.

## Sound

- Music: one understated electronic bed, low-mid energy, no drop, no risers.
  It supports the pacing; it is not the message.
- UI sounds: subtle clicks on node connect and Run, a soft tick per node
  completion. Mixed low, felt more than heard.
- Master audio ends 0.5s before picture so loop-play on the landing page
  doesn't clip.

## Social post copy

**X:**

> Every major AI model on one canvas. Wire Flux, Seedance, ElevenLabs, and
> Suno into one workflow, run it with your own keys, and finish in the
> built-in editors. No credits, no markup. Free and open source.
> nodetool.ai

**LinkedIn:**

> This movie trailer was made in one workflow: script from an LLM, stills from
> Flux, clips from Seedance, voice from ElevenLabs, music from Suno — cut on
> the built-in timeline. NodeTool puts every major model from every major
> provider on one canvas, called with your own API keys. You pay providers
> what they charge; NodeTool takes zero cut. Free, open source, runs anywhere.
> nodetool.ai

**Instagram / TikTok caption:**

> One canvas. Every model. Your keys.
> #opensource #aiart #generativeai #aivideo #creativetools

## Production notes

Produce it with the Remotion harness in `demo/` (see `demo/README.md`):

1. Record one real run of the Movie Trailer Generator workflow with
   `CastRecorder` (`web/src/demo/recorder.ts`). The cast replays
   deterministically, so retiming and re-rendering cost no further
   generations.
2. Build the composition on `DemoPlayer` — it renders the production node
   components, so running rings, streaming text, and progress bars look
   exactly like the app.
3. Add the text cards and the hook's pull-back move in Remotion
   (`demo/src/Tutorial.tsx` is the pattern for title cards and captions).
4. The Edit and Cost scenes are screen captures of the timeline editor and
   cost dashboard; keep cursor speed unhurried and constant.
5. Render the 3:2 master first, then the crops. Replace
   `marketing/public/demo.mp4` and verify the `#demo-video` section on the
   landing page.
