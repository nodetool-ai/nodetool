# Serein Launch Film: Build Brief

This brief tells an agent how to build a 26-second launch film for **Serein**,
a fictional email app, in the NodeTool timeline harness. It covers the idea,
the timing to the frame, every scene, the tools, the known engine defects and
the acceptance checks. You need no other context.

## 1. The task

Build the film with the NodeTool MCP tools only. Render it to
`demo/out/serein-launch.mp4`. Do not use Remotion, ffmpeg compositing, a
screen recorder or image generation for the picture. `ffmpeg` is allowed for
inspection only, for example to extract frames.

The film has two purposes:

1. It is a launch film that must look like a modern product launch, in the
   style of Linear, Arc or Apple launch films.
2. It is an evaluation of the harness. Every scene uses a group of engine
   features on purpose. When a feature fails, use a workaround and record the
   defect. Section 9 describes the record.

Do not change the engine, the tools or this brief to make a scene work.
Do not commit.

## 2. The idea

**Product:** Serein, "the inbox that sorts itself". Serein reads new mail on
the device, sorts it into Now, Later and Never, summarizes long threads and
drafts replies in your voice. The name is a French word for the fine rain
that falls from a clear evening sky. The brand is calm, dusk and quiet
confidence.

**Story:** from chaos to calm, in five movements.

1. **The flood.** A wall of email scrolls past in 3D, and an unread counter
   races up to 2,847. The tension builds.
2. **The name.** On the hit, everything stops. The Serein mark draws
   itself.
3. **One email.** In the quiet section, a single email. Serein reads it.
4. **The drop.** Four features, one per two bars: Sort, Summarize, Reply,
   Inbox zero. The counter falls from 2,847 to 0.
5. **The promise and the end card.** Two word cards, then the logo on the
   final bar hit.

Why this works as a demo: every visual is typography, cards and shapes, so the
harness can draw all of it. The story has a clear before and after, and the
counter gives the eye one number to follow.

## 3. Pinned inputs

All paths are relative to the repository root, `/Users/mg/workspace/nodetool`.

| File | Use |
|---|---|
| `demo/public/promo/Inter-*.woff2` | Reference for the type. The engine already has Inter. |

The film has no audio. Its timing follows the 136 BPM grid in section 4.

## 4. Format and timebase

| Property | Value |
|---|---|
| Size | 1920×1080 |
| Frame rate | 30 fps |
| Length | 780 frames (26.000 s) |
| Audio | None. |

The timing grid has a hit at 4.09 s, a quiet section from 6.4 s, a drop at
8.15 s and a final bar hit at 22.27 s. One beat is 60/136 s. Beat `k` counts from the
drop: `beat(k) = round((8.15 + k × 60/136) × 30)`.

Convert a frame to milliseconds with `ms(f) = floor(f × 1000 / 30)`. Use
`floor` for both the start and the end of every clip. Then a clip that starts
at frame `f` is visible at frame `f`, and the clip before it is not.

### Scene table

| # | Scene | Frames | Grid |
|---|---|---|---|
| S1 | The flood | 0–122 | intro, builds |
| S2 | The name | 123–191 | hit at 123 |
| S3 | One email | 192–244 | quiet |
| S4a | Sort | 245–349 | drop, beat 0, bars 1–2 |
| S4b | Summarize | 350–455 | beat 8, bars 3–4 |
| S4c | Reply | 456–561 | beat 16, bars 5–6 |
| S4d | Inbox zero | 562–614 | beat 24, bar 7 |
| S5 | Promise | 615–667 | beat 28, bar 8, 2 cards of 2 beats (615–641, 642–667) |
| S6 | End card | 668–779 | final bar hit at 668 |

Hard cuts at frames 123, 245, 615, 642 and 668. The other scene changes use
the transitions given in section 6.

## 5. Design system

### Colour

| Token | Value | Use |
|---|---|---|
| `INK` | `#0a0f1f` | Background |
| `INK2` | `#1e1b4b` | Second backdrop colour |
| `CARD` | `#111a2e` | Card fill |
| `LINE` | `rgba(148,163,184,0.18)` | Card border, 1 px |
| `TEXT` | `#f8fafc` | Primary text |
| `DIM` | `#94a3b8` | Secondary text |
| `DUSK` | linear gradient 0°: `#60a5fa` → `#a78bfa` → `#fda4af` | Accent fill for text, bars and buttons |
| `NOW` | `#fda4af` | Category Now |
| `LATER` | `#93c5fd` | Category Later |
| `NEVER` | `#64748b` | Category Never |
| `CALM` | `#0f3b3a` | Backdrop after inbox zero |

### Type

Inter only. Use weights 400, 600 and 800. Weight 500 currently renders as 400
(defect D1 below).

| Style | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| Hero | 200–320 px | 800 | −0.045 em | Counter, word cards |
| Headline | 72 px | 800 | −0.03 em | Feature headlines |
| Wordmark | 140 px | 800 | −0.035 em | "Serein" |
| Tagline | 44–56 px | 400 or 600 | −0.01 em | Taglines |
| Kicker | 24 px | 600 | +4 px, uppercase | "01 — SORT" |
| UI | 18–22 px | 400 or 600 | 0 | Card text |

### The email card

The film reuses one card design. Build it from a rect shape and text clips.

- Size 420×88 px, corner radius 18 px, fill `CARD`, a 1 px `LINE` border and
  a soft drop shadow (offset 0/12, blur radius 36, `rgba(0,0,0,0.45)`).
- A 36 px avatar circle at the left, 20 px inset. Its fill is the sender's
  category colour at 70% alpha.
- The sender name, 20 px 600 `TEXT`, and under it the subject, 18 px 400 `DIM`.
- The time, 16 px 400 `DIM`, at the right.
- An unread dot, 8 px `LATER`, left of the avatar, only in S1.

### The eighteen emails

| # | Sender | Subject | Category |
|---|---|---|---|
| 1 | Maya Chen | Contract renewal: need your sign-off | Now |
| 2 | Billing | Your invoice #4471 is ready | Later |
| 3 | Jonas Weber | Re: re: re: offsite dates | Later |
| 4 | Calendar | Updated: Weekly sync (moved) | Never |
| 5 | Priya Nair | Draft deck for Thursday | Later |
| 6 | GitHub | 14 new notifications | Later |
| 7 | Newsletter | 12 tools you missed this week | Never |
| 8 | Leo Martins | Quick question about the budget | Later |
| 9 | Flights | Check in now for your trip | Now |
| 10 | HR | Benefits enrollment closes Friday | Later |
| 11 | Sam Ortiz | Photos from Saturday | Later |
| 12 | Security | New sign-in on a new device | Now |
| 13 | Ana Silva | Can you review by EOD? | Now |
| 14 | Store | Your order has shipped | Never |
| 15 | Recruiting | Candidate feedback needed | Later |
| 16 | Team | Standup notes | Never |
| 17 | Promo | Last day: 40% off | Never |
| 18 | Dad | Call me when you can | Now |

This gives Now 5, Later 8 and Never 5.

### Motion rules

- Ease entrances with `easeOutExpo` or `spring(170,18,1)`. Use `linear` only
  for drift and for fades that must be exact.
- Nothing appears without motion. Every entrance has a fade plus a move, a
  scale or a blur.
- Hold each readable line for at least 1.2 s after it settles.
- Keep 96 px safe margins for text.
- Put a film grain (`grain`, amount 0.05) and a `stylize` `dither` (amount 1,
  fixed seed) on a full-frame adjustment clip over the whole film. This stops
  banding in the dark gradients.

## 6. Scenes

Positions are in px from the frame centre, x to the right and y down, unless a
line says otherwise. Local frame `f` counts from the scene start.

### S1 The flood (0–122)

**Backdrop.** An `INK` fill, then a `generator` `gradientField` (colours `INK`
and `INK2`, scale 4, animate, fixed seed) at opacity 0.6.

**Card wall.** 21 cards (emails 1–18, then 1–3 again) in 3 depth layers:

- Far: 9 cards, `depthPx −300`, opacity 0.5.
- Mid: 7 cards, `depthPx 0`.
- Near: 5 cards, `depthPx +220`.
- Lay each layer out as columns 460 px apart that cover the frame. Tilt the
  whole wall: `rotationX 28°`, 2D rotation −12° (CSS sense, counter-clockwise
  on screen), perspective 1800.
- The wall scrolls up continuously: `offsetY` 0 → −700 px over the scene,
  linear, with the near layer 1.4× faster than the far layer.
- Behind the far layer, fill the gaps with skeleton cards: one card-shaped
  rect with a `repeater` (count 40, a position step that tiles a grid, a
  brightness step of −0.01).

**Camera.** A `camera2d` pushes in: depth 0 → 260 over frames 0–122.
`focusDepthPx 0`, `aperturePx 14`, so the far and near layers blur.

**Counter.** Centred, a stack of three lines:

- "You have", 48 px 400 `DIM`, at y −190.
- The number, 300 px 800 `TEXT`, at y 0. It uses a `ticker` from 0 to 2847
  over frames 12–100 with `easeInExpo`, so the count accelerates. It shows
  "2,847" at the end. If the ticker cannot group thousands, show "2847" and
  record the defect.
- "unread emails.", 48 px 400 `DIM`, at y +190.
- The stack enters at frame 8: opacity 0 → 1 and blur 30 → 0 over 12 frames,
  `easeOutExpo`.

**Build-up, frames 96–122.**

- The scroll speed doubles.
- A `wiggle` link on the wall's position grows from 0 to 6 px.
- A `stylize` `glitch` on the number ramps its amount from 0 to 0.5.
- An `rgbSplit` ramps its amount from 0 to 0.4.

**Out.** A hard cut at 123.

### S2 The name (123–191)

**Backdrop.** `INK`, with one soft radial glow at the centre (`#a78bfa` at
alpha 0.25, fading to transparent, about 900 px wide).

**Flash.** A white screen-blend layer, opacity 0.9 → 0 over 10 frames, linear.

**The mark.** 120 px, drawn from shapes:

- A ring, a circle with a 6 px stroke in `TEXT`. It draws on with
  `trimEnd 0 → 1` over frames 0–16, `easeOutExpo`.
- A horizon line, 150 px wide, 6 px stroke, round caps, through the lower
  third of the ring. It draws left to right over frames 6–20.
- A sun disc, 44 px, filled with `DUSK`, above the horizon. It scales
  0.6 → 1 with `spring(170,18,1)` from frame 12.
- A `glow` on the mark: radius 40, intensity 0.8.

**Wordmark.** "Serein" 140 px 800. Characters slide up 40 px and fade in, with
a character stagger of 30 ms, 400 ms each, `easeOutExpo`, from frame 8.

**Layout.** The mark and the wordmark sit in a `row` layout with a 32 px gap,
centred at y −30.

**Tagline.** "The inbox that sorts itself.", 44 px 400 `DIM`, at y +110. It
fades in and rises 20 px over 12 frames from frame 30.

**Out.** Everything fades to `INK` over frames 184–191, linear.

### S3 One email (192–244)

**Backdrop.** `INK` plus the S1 gradient field at opacity 0.3.

**The card.** A large email card, 1100×220, radius 28, centred. It uses email
1: "Maya Chen" 34 px 600, and the subject 30 px 400 `TEXT`. Under the subject,
two skeleton body lines (rects filled with `DIM` at 20% alpha).

- The subject decodes with a `scramble` over frames 4–28, fixed seed.
- The card scales 1 → 1.04 over the scene, linear.

**The AI chip.** A pill 40 px below the card's right edge. It holds a small
spinner (an ellipse stroke with `trimStart 0.1`, `trimEnd 0.35`, rotating 360°
every 20 frames) and "Serein is reading…" in 22 px 600. The text colour
pulses between `DIM` and `#a78bfa` with a 16-frame period (style track on
`text.color`). The pill is sized with `fitText`.

**Pre-drop, frames 36–52.**

- The chip text changes to "Sorted → Now". Use a second text clip with a
  crossfade.
- The dot and the text turn `NOW`.
- The card lifts: its scale goes 1.04 → 1.08, and its shadow offset grows
  from 12 to 40 px.

### S4a Sort (245–349)

**Flash.** Opacity 0.6 → 0 over 8 frames.

**The board.** A group holds the whole board, with `rotationX 18°`,
`rotationY −10° → −4°` over the scene (linear) and perspective 2400.

- **Headers.** Three column headers at x −520, 0 and +520, y −330. Each is a
  pill with a dot in the category colour, a label ("Now", "Later", "Never")
  in 24 px 600, and a count. The pill uses `fitText`.
- **Cards.** All 18 cards fly in from scattered positions (±900 px, ±600 px,
  2D rotation ±25°, 30% smaller) to their slots. Slots start at y −240 with a
  104 px step. Each flight lasts 500 ms with `spring(170,18,1)`.
- **Card timing.** Stagger the cards across clips, 40 ms apart and
  interleaved across the columns, from frame 6. Use
  `ui_timeline_stagger_animations` if the harness exposes it. Otherwise use
  `delayMs`, and record the gap.
- **Counts.** The header counts tick from 0 to 5, 8 and 5 as the cards land,
  with a `ticker`.
- **Beat pulse.** On sequence beats 4 and 6, the headers pop from 1.0 to 1.06
  and back over 8 frames, with a beat-anchored `emphasis` animation.

**Labels.** These are the same in S4a–S4d:

- **Kicker.** Top left at (96, 96) from the top-left corner. It reads
  "01 — SORT", or 02–04 in the later scenes. It is 24 px 600 `DIM`,
  uppercase, with 4 px tracking. It enters with a wipe from the left over
  10 frames from frame 4.
- **Headline.** Bottom left, baseline 96 px above the bottom edge, 72 px 800.
  S4a reads "Sorted before you look.". Words slide up 30 px and fade in, with
  a word stagger of 60 ms, `easeOutExpo`, from frame 10.
- **Scrim.** A full-frame linear gradient from transparent at 55% down to
  `INK` at 85% alpha at the bottom. It sits under the headline.

### S4b Summarize (350–455)

**In.** A `whip` transition to the left, 250 ms.

**The card.** A long email card, 900×700, centred at x +160. The subject reads
"Q3 planning: notes from Tuesday". Twelve skeleton lines stagger in from the
top. A chip reads "6 min read".

**The scan, frames 30–50.** A 4 px `DUSK` bar with a `glow` (radius 24)
sweeps from the top of the card to the bottom. The skeleton lines collapse
behind it: `scaleY` 1 → 0, staggered 25 ms from the top.

**The summary, frames 50–64.**

- The card height eases from 700 to 300 with `spring(170,18,1)`.
- Three bullets appear, each with a wipe from the left over 300 ms, 150 ms
  apart. They are 28 px 400 `TEXT`:
  - "Launch moves to Nov 12"
  - "Budget approved, +8%"
  - "You own the pricing page"

**The chip.** Its text changes from "6 min read" to "20 sec read" with a
`scramble` at frame 56. The chip border turns `DUSK`.

**Labels.** Kicker "02 — SUMMARIZE", headline "The gist, in three lines."

### S4c Reply (456–561)

**In.** A `gradientWipe` with `map: "noise"`, 350 ms, `easeInOutExpo`.

**The composer.** A composer card, 1000×460, centred at x +140.

- Header: "To: Maya Chen", 22 px 600 `DIM`.
- Body: "Signed. Thanks for chasing this. Sending the countersigned copy
  now." It types with the `typewriter` preset over 1400 ms from frame 8, with
  a caret (`#a78bfa`, 3 px, blink period 533 ms).
- Tone chips, in a `row` layout under the body: "Formal", "Brief" and "Warm".
  A selection pill (fill `#a78bfa` at 25% alpha) slides from "Formal" to
  "Warm" at frame 14, with `spring(170,18,1)`.
- A send button: a pill filled with `DUSK` and "Send" in 24 px 600 `INK`, at
  the bottom right of the card.

**The send, frames 64–90.**

- At frame 64 the button presses: its scale goes 1 → 0.94 → 1 with a spring.
- A paper plane (an SVG path shape, 60 px) launches from the button along a
  curve to the upper right and leaves the frame. Use `followPath`.
- The plane has per-clip motion blur (`samplesPerFrame 8`, `shutterAngle 180`)
  and a `temporalEcho` trail of 6 copies.
- The composer slides 40 px down and fades to 0 over frames 70–86.
- A toast "Sent · 0.4 s" enters at the top centre over frames 76–88.

**Labels.** Kicker "03 — REPLY", headline "Drafts in your voice."

### S4d Inbox zero (562–614)

**In.** An `iris` transition from the centre, 300 ms.

**The counter.** "2,847" at 320 px 800 `TEXT`, centred at y −40. A `ticker`
counts it down to 0 over frames 0–38 with `easeInOutExpo`.

**The slam, frame 38.**

- The "0" scales 1.4 → 1 and its blur goes 30 → 0 over 7 frames,
  `easeOutExpo`.
- Its fill changes to `DUSK`.
- A `generator` `particles` burst in `DUSK` colours runs over frames 38–52,
  with a fixed seed.

**The backdrop.** The gradient field's second colour moves from `INK2` to
`CALM` over frames 30–52 (style track on the effect's `colorB`).

**Subline.** "Inbox zero. Every morning.", 48 px 600 `TEXT`, at y +170. It
fades and rises from frame 40.

**Labels.** Kicker "04 — ZERO". No headline in this scene.

### S5 Promise (615–667)

There are two word cards. Each card has these layers, back to front:

1. The S1 card wall at opacity 0.22 with a blur of radius 60, scrolling
   slowly.
2. A vignette.
3. A word slam: 200 px 800. The scale goes 1.45 → 1, the blur goes 42 → 0,
   and the opacity goes 0 → 1 over the first 2 frames. The scale and the blur
   ease with `easeOutExpo` over 7 frames.
4. A flash: opacity 0.2 → 0 over 3 frames.

| Frames | Word | Fill |
|---|---|---|
| 615–641 | Private by design. | `TEXT` |
| 642–667 | Runs on-device. | `DUSK` |

A 150 ms `glitch` transition joins the two cards.

### S6 End card (668–779)

**In.** A hard cut on the final bar hit, with a flash (opacity 0.8 → 0 over
10 frames). Then a `lightLeak` transition in `#fda4af` over 400 ms.

**Backdrop.** The gradient field in `INK` and `CALM`, plus the S2 glow.

**The column.** It is centred as a group:

- The logo row (mark and wordmark, as in S2, at 100% scale). It scales
  1.2 → 1 with `spring(170,18,1)`.
- The tagline "The inbox that sorts itself.", 56 px 600, filled with `DUSK`,
  40 px under the logo. It enters 10 frames after the logo, with a fade and a
  20 px rise.
- A call-to-action pill 36 px under the tagline: "Early access · Mac &
  iPhone", 30 px 400 `TEXT`, with a 1 px `rgba(248,250,252,0.3)` border and
  a fully rounded shape. It enters 10 frames after the tagline.

**Out.** Everything fades to `INK` over frames 765–779, linear.

## 7. Tools and workflow

The NodeTool server runs at `http://localhost:7777`. The MCP server is
`nodetool`. Read `docs/timeline-custom-animations.md` (the motion design
guide) and the timeline sections of `docs/harnesses.md` before you start.

| Need | Tool |
|---|---|
| Author the timeline | `execute_code` with `import { create_timeline, edit_timeline, get_timeline, set_timeline_document, validate_timeline, preview_timeline_frame, render_timeline } from "@nodetool-ai/sandbox-nodetool/timelines"` |
| Download the export or a preview | `download_asset` with an absolute `output_path`. The folder must exist. |
| Look at a preview | `view_image`, or read the file on disk at `~/.local/share/nodetool/assets/1/<asset-id>.png` |

Work in this order:

1. Write the whole build as one script that you can run again. Keep the source
   in `demo/benchmarks/serein/build.js`. Paste it into `execute_code` in
   parts. `edit_timeline` accepts at most 60 ops per call, and a partial batch
   keeps the ops that succeeded.
2. After each scene, run `preview_timeline_frame` at the checkpoint frames
   (section 8) and at the midpoint of each animation. Compare with this brief
   and fix the differences before you go on.
3. Run `validate_timeline`. Then run `render_timeline` with `wait: true`,
   download the result and check the frame count with `ffprobe`.
4. Check the export at the checkpoints too. The preview and the export can
   differ (defect D10).

## 8. Known engine behaviour and defects

The last sizzle benchmark rebuild found these. Plan around them and record
any that you see again.

| # | Behaviour | What to do |
|---|---|---|
| D1 | `fontWeight: 500` renders as 400. | Use 400 or 600. |
| D2 | A keyframe's `easing` shapes the segment that **ends** at that keyframe. The default for custom curves is linear. | Put the easing on the `t: 1` keyframe, or set `easing` on the animation. |
| D3 | A `blur` radius of r gives a Gaussian sigma of r/3. CSS `blur(r)` has sigma r. | Multiply CSS blur values by 3. This brief already gives engine radii. |
| D4 | The sign of 2D `rotation` is the opposite of CSS `rotate()`. | Verify the direction in a preview. |
| D5 | A shape's radial fill is circular, with a radius of half the box diagonal. | For an ellipse, draw a circle and stretch it with `scale.x`. Put the transparent stop at 0.7071. |
| D6 | A shape is rasterized inside the frame before its transform applies. Parts outside 1920×1080 are cut off. | Draw a large shape small and scale it up. |
| D7 | Style tracks on shape geometry (`shape.x`, `shape.width`) had no visible effect. A custom animation with only `styleTracks` was refused. | Add at least one curve. Test geometry tracks early, and fall back to transform scale. |
| D8 | `add_shape_clip` refuses `blendMode`. | Set it with `set_clip_params` after the clip is added. |
| D9 | The typewriter refuses `stagger.offsetMs: 0`. | Leave out `stagger`. `durationMs` is the time for the whole text. |
| D10 | A preview once showed a white grid where the export was correct. | Trust the export. Record any preview/export difference. |
| D11 | Text has no x/y. It is placed with `align`, `verticalAlign`, `maxWidthFrac` and `transform.position`. A left-aligned block starts at `(1 − maxWidthFrac) / 2 × 1920 + position.x`. | Measure one preview, then correct the offsets. |
| D12 | A media clip is fitted to the frame at scale 1. | Scale is relative to the fitted size. |

## 9. Deliverables

1. `demo/out/serein-launch.mp4`: 1920×1080, 30 fps, 780 frames, with no
   audio stream.
2. `demo/benchmarks/serein/build.js`: the complete build source, so that a
   rerun reproduces the timeline.
3. `demo/benchmarks/serein/DEFECTS.md`: one entry for each harness defect
   that you meet. Each entry has what you tried, what happened, the smallest
   repro (ops JSON), your workaround and the visual cost.
4. `demo/benchmarks/serein/COVERAGE.md`: a table of the features in
   section 10, each with worked, worked with a workaround, or failed.
5. A final message with the timeline ID, the asset ID of the export, and the
   three worst gaps between the film and this brief.

## 10. Acceptance

### Automatic checks

- The format is exactly 1920×1080, 30/1 fps, 780 frames.
- Hard cuts are found at 123, 245, 615, 642 and 668 (±1 frame) with
  `ffmpeg … scdet=threshold=12`.

### Checkpoints

A judge compares the export frame at each checkpoint with the text below and
grades it 0 (missing or wrong), 1 (present but visibly off) or 2 (as
described).

| # | Frame | Expected |
|---|---|---|
| C1 | 40 | Tilted 3D card wall with depth blur, and the counter near 300 in the centre. |
| C2 | 110 | Counter at 2,847, glitch and RGB split visible, wall scrolling fast. |
| C3 | 140 | Mark fully drawn, wordmark complete, flash gone. |
| C4 | 175 | Logo row and tagline, calm glow. |
| C5 | 225 | One large email card with a decoded subject, and the chip reading. |
| C6 | 244 | Chip reads "Sorted → Now" in rose, card lifted. |
| C7 | 262 | Cards in flight, some already in their columns, board tilted. |
| C8 | 330 | All 18 cards in 3 columns, counts 5 / 8 / 5, headline complete. |
| C9 | 420 | Summary card with 3 bullets, chip reads "20 sec read". |
| C10 | 480 | Reply typing with a caret, tone pill moving to "Warm". |
| C11 | 530 | Paper plane in flight with blur and a trail, toast entering. |
| C12 | 604 | "0" in the dusk gradient with particles, teal backdrop. |
| C13 | 630 | "Private by design." over the dim wall. |
| C14 | 655 | "Runs on-device." in the gradient. |
| C15 | 740 | End card: logo row, gradient tagline, CTA pill. |
| C16 | 778 | Near black. |

### Craft score

A judge also grades the film as a whole from 0 to 2 on each point:

- The motion is smooth, with no pops, jumps or linear starts.
- The type is crisp and correctly weighted.
- The cuts land on the beat grid.
- The dark gradients show no banding.
- It looks like a launch film that a design-led company would ship.

`score.sh` runs the automatic checks, and two independent judges grade the
picture with [JUDGE.md](JUDGE.md). [EVAL.md](EVAL.md) describes the whole
evaluation and the pass rule. The builder may read both files but must not
change them.
