# Sizzle Benchmark Recipe

This recipe specifies the 32.6-second NodeTool sizzle cut completely. An agent
uses it to rebuild the video with any toolchain. `score.sh` then compares the
result with the reference render.

The source of truth is `demo/src/sizzle/Sizzle.tsx` with the SHA-256 prefix
`2b7c624db3c48d70`. When the recipe and the source disagree, the source is
correct and the recipe has a defect.

An earlier 25.5-second cut used four beats for each montage shot and four
word cards. It is at commit `88a9c279850d73eccc1076b8429adcbfafd68a8b`. This
recipe replaces it.

## Tiers

| Tier | Task | What it measures |
|---|---|---|
| A, re-render | Render the `Sizzle` composition from the pinned source. | The toolchain and the pinned inputs. |
| B, rebuild | Build the video from this recipe. Do not read or run `Sizzle.tsx`. | The agent and its tools. This is the benchmark. |

Tier B allows any tool: the NodeTool timeline harness, another editor, or new
code. The agent may use every pinned input below.

## Pinned inputs

All paths are relative to `demo/public/`. The hashes are the first 16
characters of SHA-256.

| File | SHA-256 | Use |
|---|---|---|
| `casts/promo/trailer-music-long.mp3` | `3ae286bfe565eb37` | Score. MP3 320 kb/s, 48 kHz stereo, 31.379 s. |
| `casts/promo/trailer-music.mp3` | `a7044d0a38a1d6e7` | Source of the score. 24.320 s. |
| `casts/promo/logo.png` | `01cc56566ff9aae5` | Mark. 1121×1104, drawn stretched to a square. |
| `casts/promo/take-rider.webm` | `a4c36f7269066509` | Take 1. VP9 960×540, 2.000 s. |
| `casts/promo/take-sparks.webm` | `0213d2a827d1cfba` | Take 2. |
| `casts/promo/take-drift.webm` | `f1e5a662612adac2` | Take 3. |
| `casts/promo/take-wheel.webm` | `e5869a5df345420d` | Take 4. |
| `casts/promo/take-blower.webm` | `231726a65c3a9494` | Take 5. |
| `casts/promo/shot-chained.webm` | `c59a43be354fd1fb` | Take 6. |
| `promo/Inter-Regular.woff2` | `e06f6b1bc553aaea` | Inter 400. |
| `promo/Inter-Medium.woff2` | `0ff3e94614e1493e` | Inter 500. |
| `promo/Inter-SemiBold.woff2` | `5cb7103e4e605989` | Inter 600. |
| `promo/Inter-ExtraBold.woff2` | `6f75025856f8db1b` | Inter 800. |

The montage shows real product UI. The reference replays recorded casts
through the product's own components. The casts are in `web/src/demo/`:

| Cast | File |
|---|---|
| `heroBriefCast` | `web/src/demo/hero/heroBriefCast.ts` |
| `heroStoryboardCast` | `web/src/demo/hero/heroStoryboardCast.ts` |
| `heroTimelineCast` | `web/src/demo/hero/heroTimelineCast.ts` |
| `promoTrailerCast` | `web/src/demo/promoTrailerCast.ts` |
| doc cast `sketch-assistant` | `web/src/demo/doc/sketchAssistantCast.ts` |
| doc cast `script-assistant` | `web/src/demo/doc/scriptAssistantCast.ts` |

A Tier B agent may produce this footage in any way. The options include the
demo players, the `render_demo_surface` NodeTool tool, and a screen recording.
The scene specification states the exact cast range and framing of each shot.

The toolchain for the reference is Remotion 4.0.481 on Node 22.22 (the version
in `.nvmrc`).

## Output

| Property | Value |
|---|---|
| Size | 1920×1080 |
| Frame rate | 30 fps |
| Length | 977 frames (32.567 s) |
| Video | H.264 High, yuvj420p, about 4.6 Mb/s in the reference |
| Audio | AAC LC, 48 kHz stereo, about 317 kb/s in the reference |

## Notation

- `f` is a frame number. "Local" frames count from the start of the scene or
  shot. "Global" frames count from the start of the video.
- `lerp(f, [a, b], [u, v])` is linear interpolation, clamped at both ends.
  A list of more than two points is piecewise linear.
- `expoOut(x) = 1 − 2^(−10x)`, with `x` clamped to 0..1 first. Note that
  `expoOut(1) = 0.99902`, not 1.
- `cubicIn(x) = x³`, with `x` clamped to 0..1.
- `E(f, a, n)` is shorthand for `expoOut((f − a) / n)`.
- Colours: `BG = #04060d`, `TEXT = #f8fafc`, `DIM = #94a3b8`,
  `FUCHSIA = #e879f9`.
- `ACCENT` is `linear-gradient(90deg, #fb7185, #e879f9, #fcd34d)`. Text with
  ACCENT uses the gradient as its fill, clipped to the glyphs.
- The font is Inter for all text. `letter-spacing` values are in px.

## Timebase

The score runs at 136 BPM. One beat is 60/136 s = 0.441176 s, and one bar is
four beats (1.764706 s). The music has a hit at 4.09 s, a quiet section from
6.4 s, and a drop at 8.15 s.

`beat(k) = round((8.15 + k × 60/136) × 30)` gives the global frame of beat `k`,
counted from the drop. A montage shot lasts `SHOT_BEATS = 6` beats, and a word
card lasts `HONESTY_BEATS = 2` beats.

| Constant | Frame | Rule |
|---|---|---|
| HIT | 123 | round(4.09 × 30) |
| BRIEF | 192 | round(6.4 × 30) |
| DROP | 245 | beat(0) |
| HONESTY | 800 | beat(42), after 7 shots of 6 beats |
| CLOSE | 880 | beat(48), after 3 cards of 2 beats |
| MUSIC_END | 941 | round((24.32 + 16 × 60/136) × 30) |
| END | 977 | MUSIC_END + 36 |

### The extended score

`trailer-music-long.mp3` is `trailer-music.mp3` with four groove bars added.
With `D = 8.15` s and `L = 1.764706` s, it joins three pieces of the original
track:

1. From 0 to `D + 4L` (15.209 s), which is the intro and groove bars 0–3.
2. From `D + L` (9.915 s) to `D + 5L` (16.974 s), which is a copy of bars 1–4.
3. From `D + 4L` (15.209 s) to the end, which is bar 4 onward.

Each join is exact to the 48 kHz sample, with no offset. Each join has a
10 ms equal-power crossfade. The new piece fades in against the audio that
follows the previous piece in the original track. The result is 31.379 s long,
and the original final bar starts at 29.33 s, which is global frame 880.

### Scenes

| # | Scene | Global frames | Length |
|---|---|---|---|
| 1 | Open | 0–122 | 123 |
| 2 | Hit | 123–191 | 69 |
| 3 | Brief | 192–244 | 53 |
| 4 | Montage | 245–799 | 555 |
| 5 | Honesty | 800–879 | 80 |
| 6 | Close | 880–976 | 97 |

### Hard cuts

The reference has 13 hard cuts. The scorer detects them in each candidate:

`25 123 245 324 403 483 562 642 721 800 827 853 880`

Frame 192 is not a hard cut, because the Hit scene fades out into the Brief.

## Shared elements

### Backdrop(e)

The backdrop is a full-frame stack, back to front. `a = localFrame / 90`,
where the local frame counts from the start of the scene or montage shot that
contains the backdrop.

1. A solid `BG` fill.
2. At opacity `0.55e`: `radial-gradient(40% 50% at X1% Y1%, rgba(232,121,249,0.35), transparent 70%)`,
   with `X1 = 30 + 12·sin(a)` and `Y1 = 35 + 10·cos(0.7a)`.
3. At opacity `0.45e`: `radial-gradient(45% 45% at X2% Y2%, rgba(251,113,133,0.3), transparent 70%)`,
   with `X2 = 72 + 10·cos(0.8a)` and `Y2 = 70 + 8·sin(0.6a)`.
4. At opacity 0.5: a grid of 1 px lines every 80 px in both axes, in
   `rgba(148,163,184,0.06)`. It is masked by
   `radial-gradient(70% 70% at 50% 50%, black, transparent)`.

The energy `e` is 0.6 in Open, 1.4 in Hit, 0.35 in Brief, 1 in each montage
shot, and 1.2 in Close. Honesty has no backdrop.

### Flash(s, n)

A full-frame white layer with `mix-blend-mode: screen`. Its opacity is
`lerp(f, [0, n], [s, 0])` from its own start frame. It is the top layer of its
scene.

### Slam(text, size = 190, gradient = false)

This is a centred single line with its own local frame `f`, and
`t = E(f, 0, 7)`.

- Type: weight 800, `size` px, letter-spacing `−0.045 × size`, line-height 1.
- Fill: `TEXT`, or `ACCENT` when `gradient` is true.
- Shadow: `0 10px 60px rgba(0,0,0,0.6)`, only when `gradient` is false.
- Motion: scale `1.45 − 0.45t`, blur `(1 − t) × 14` px, and opacity
  `min(1, f/2)`.

### Mark(size)

The mark is a horizontal row with its items centred vertically.

- The row has `logo.png` drawn at `size × size`, then a gap of `0.28 × size`,
  then the word `NodeTool`.
- The word is weight 800, `0.82 × size` px, letter-spacing `−0.035 × size`,
  line-height 1, in `TEXT`.

## Scene 1: Open (global 0–122)

Layers, back to front:

1. Backdrop(0.6).
2. **Take grid.** The grid has 3 columns and 2 rows of 560×315 cells, with a
   24 px gap. The total is 1728×654, centred in the frame.
   - Grid transform: scale `lerp(f, [25, 96], [1.08, 1]) × (1 − 0.92c)`,
     rotation `−8c` degrees, and opacity `1 − 0.6c`.
   - `c = cubicIn((f − 96) / 27)`, so the collapse ends at frame 123.
   - The cells hold the takes in reading order: rider, sparks, drift, wheel,
     blower, chained.
   - Cell `i` (0-based) appears at `at = 25 + 4i`, with `t = E(f, at, 8)`.
   - Each cell has corner radius 18, clips its content, and has the shadow
     `0 30px 80px rgba(0,0,0,0.5)`.
   - Each cell has opacity `0.5t` and scale `0.7 + 0.3t`.
   - Each take plays muted from its own frame 0 at global frame `at` and fills
     its cell with object-fit cover. The takes last 2 s, and each holds its
     last frame after it ends.
3. **Words**, in a layer with opacity `1 − c`.
   - Slam("Every model.") shows from global frame 2 to frame 24.
   - Slam("One canvas.") starts at frame 25 and stays to the end of the scene.
4. Flash(0.35, 6), starting at global frame 25.

## Scene 2: Hit (global 123–191, local f = 0–68)

The whole scene has opacity `lerp(f, [61, 69], [1, 0])`. The animation values
are:

- `t = E(f, 0, 10)`
- `ring = E(f, 0, 24)`
- `tag = E(f, 18, 12)`

Layers, back to front:

1. Backdrop(1.4).
2. **Ring.** A circle centred in the frame, with diameter `1800 × ring` px.
   It has no fill and a border of `6(1 − ring) + 1` px in
   `rgba(232,121,249, 0.8(1 − ring))`.
3. **Mark(170)**, centred in the frame, with scale
   `(1.6 − 0.6t) × lerp(f, [10, 80], [1, 1.04])` and blur `(1 − t) × 18` px.
4. **Tagline** "The open-source, agent-first creative workspace."
   - Type: weight 500, 40 px, `DIM`, letter-spacing −0.5.
   - Place: centred horizontally, with its top edge at y = 660.
   - Motion: opacity `tag`, translateY `(1 − tag) × 20` px.
5. Flash(0.9, 10).

## Scene 3: Brief (global 192–244, local f = 0–52)

Layers, back to front:

1. Backdrop(0.35).
2. **Prompt box**, centred in the frame. The whole box layer scales by
   `lerp(f, [0, 53], [1, 1.06])`.
   - Box: width 1460, padding 40 px top and bottom and 52 px left and right,
     minimum content height 130 px, and corner radius 28.
   - Box fill: `rgba(15,23,42,0.85)` with a 1 px border in
     `rgba(148,163,184,0.25)`.
   - Box shadows: `0 40px 120px rgba(0,0,0,0.6)` and
     `0 0 0 1px rgba(232,121,249,0.08)`.
   - Text: weight 500, 50 px, line-height 1.3, letter-spacing −0.8, `TEXT`,
     left-aligned.
   - The text is the 76-character brief
     `Make me a 12-second teaser for SCRAPHEART — a desert chase across the flats.`
     It wraps after "desert".
   - The box shows the first `round(lerp(f, [4, 43], [0, 76]))` characters.
3. **Caret**, after the last visible character.
   - Shape: a 4×54 px `FUCHSIA` bar with a 4 px left margin, moved down
     8 px from the text baseline.
   - It is visible while the text still types. After that it is visible
     when `floor(f / 8)` is even.

## Scene 4: Montage (global 245–799)

The montage has seven shots of six beats each. Shot `i` (0-based) starts at
`beat(6i)` and lasts until `beat(6i + 6)`.

| # | Global frames | Word | Line | Logical width | Source, cast range (ms) |
|---|---|---|---|---|---|
| 1 | 245–323 | Direct. | An agent plans the whole project | 1040 | Chat, `heroBriefCast`, 1500→11400 |
| 2 | 324–402 | Board. | Pre-vis every shot before you spend | 1440 | Storyboard, `heroStoryboardCast`, 700→7600 |
| 3 | 403–482 | Render. | Stills become clips, in place | 1440 | Storyboard, `heroStoryboardCast`, 7600→18400 |
| 4 | 483–561 | Compare. | Seedance · Wan · any model, your keys | 1920 | Graph, `promoTrailerCast`, 2600→9400 |
| 5 | 562–641 | Paint. | Layers, masks and diffusion | 1700 | Sketch, doc cast `sketch-assistant`, 500→14800 |
| 6 | 642–720 | Voice. | The script is the source of truth | 1400 | Script, doc cast `script-assistant`, 600→18000 |
| 7 | 721–799 | Cut. | Generate at the playhead | 1600 | Timeline, `heroTimelineCast`, 200→11400 |

Cast time is `lerp(localFrame, [0, 79], [fromMs, toMs])`. The span 79 is
`beat(6) − beat(0)`, and every shot uses it. So the last frame of an 80-frame
shot holds the end of the range.

Some shots have extra settings:

- **Storyboard shots:** media inside the surface plays at the shot's own clock,
  which is `localFrame / 30` s.
- **Graph shot:** the viewport is `{x: 408.883, y: 60.457, zoom: 0.954315}`.
  This frames the graph rectangle from (−60, 10) to (1215, 995) with 70 px
  padding and a maximum zoom of 1.3.
- **Timeline shot:** the track area is 300 px high, and the editor chrome is
  hidden.

Each shot has these layers, back to front, with local frame `f` and length `L`:

1. Backdrop(1).
2. **Window.** It sits in a full-frame layer with CSS perspective 2400 px and
   is centred in the frame.
   - Size: 1560×878 with corner radius 22. It clips its content.
   - Fill: `#0b1020`, with a 1 px border in `rgba(148,163,184,0.25)`.
   - Shadows: `0 60px 160px rgba(0,0,0,0.7)` and
     `0 0 120px rgba(232,121,249,0.12)`.
   - Content: the surface is laid out at the shot's logical width. It is then
     scaled by `1560 / logicalWidth` from the top-left corner, so it fills the
     window width.
   - Motion values: `enter = E(f, 0, 9)` and `drift = lerp(f, [0, L], [0, 1])`.
   - The bump is `lerp(f − 26, [0, 2, 10], [0, 1, 0])`, a pulse on the third
     beat.
   - `tilt` is +1 for shots 1, 3, 5 and 7, and −1 for shots 2, 4 and 6.
   - Transform, applied in this order:
     1. `translateX(−160 × tilt × (1 − enter))`
     2. `translateY(−20px)`
     3. `rotateX(6 − 3·drift deg)`
     4. `rotateY(tilt × (14(1 − enter) + 7 − 6·drift) deg)`
     5. `scale((1.14 − 0.14·enter + 0.05·drift) × (1 + 0.015·bump))`
   - Blur: `(1 − enter) × 10` px.
3. **Label.** The label is drawn with `u = E(f, 2, 8)`.
   - A full-frame scrim:
     `linear-gradient(to top, rgba(4,6,13,0.9) 0%, rgba(4,6,13,0.4) 22%, transparent 40%)`.
   - A text block, positioned 90 px from the left edge and 70 px from the
     bottom edge. It has opacity `u` and translateX `(1 − u) × −60` px.
   - The word, in the text block: weight 800, 150 px, letter-spacing −7,
     line-height 0.95, `TEXT`, shadow `0 8px 50px rgba(0,0,0,0.7)`.
   - The line, 14 px under the word: a row with an 18 px gap, 34 px weight 500
     `TEXT` at opacity 0.85. It starts with a bar `64u` wide and 6 px high,
     with radius 3, filled with ACCENT. The line text follows the bar.
   - The counter `01 / 07` to `07 / 07`, positioned 90 px from the right edge
     and 64 px from the top edge. It is weight 600, 28 px, letter-spacing 2,
     `DIM`, with tabular numerals.
4. Flash. Shot 1 uses Flash(0.7, 10). All other shots use Flash(0.22, 4).

## Scene 5: Honesty (global 800–879)

The scene has three word cards of two beats each:

| # | Global frames | Word | Take behind | Fill |
|---|---|---|---|---|
| 1 | 800–826 | Your keys. | take-rider | TEXT |
| 2 | 827–852 | No markup. | take-sparks | TEXT |
| 3 | 853–879 | Open source. | take-drift | ACCENT |

Each card has these layers, back to front:

1. A solid `BG` fill.
2. The take, full frame with object-fit cover, muted, at opacity 0.28, with
   `saturate(1.2)`. The take starts 20 frames (0.667 s) into its file.
3. A vignette: `radial-gradient(60% 60% at 50% 50%, rgba(4,6,13,0.4), rgba(4,6,13,0.9))`.
4. Slam(word, 220, gradient as in the table).
5. Flash(0.18, 3).

## Scene 6: Close (global 880–976, local f = 0–96)

The whole scene has opacity `lerp(f, [83, 97], [1, 0])`. The animation values
are:

- `t = E(f, 0, 10)`
- `sub = E(f, 10, 12)`
- `cta = E(f, 20, 12)`

Layers, back to front:

1. Backdrop(1.2).
2. A column of three items, centred horizontally and vertically as a group.
   - **Mark(150)**, with scale `(1.3 − 0.3t) × lerp(f, [10, 97], [1, 1.04])`
     and blur `(1 − t) × 14` px.
   - **Subtitle** "Every model. One canvas. Yours.", 44 px under the mark.
     It is weight 600, 64 px, letter-spacing −2, filled with ACCENT. It has
     opacity `sub` and translateY `(1 − sub) × 24` px.
   - **Pill** "Free & open source · nodetool.ai", 40 px under the subtitle.
     - Type: weight 500, 34 px, `TEXT`.
     - Shape: padding 16 px top and bottom and 34 px left and right, radius
       999, with a 1 px border in `rgba(248,250,252,0.3)`.
     - Motion: opacity `cta`, translateY `(1 − cta) × 20` px.
3. Flash(0.8, 10).

## Audio

The only audio is `trailer-music-long.mp3`, which starts at global frame 0.
Its volume is piecewise linear over the frames `[0, 3, 921, 941]`, with the
values `[0, 0.9, 0.9, 0]`. The file ends at 31.379 s, so frames 941 to 976 are
silent.

## Checkpoints

A reviewer or a vision model can use these frames to check the content. `score.sh`
does not test them.

| # | Frame | Expected content |
|---|---|---|
| C1 | 12 | "Every model." slam, centred, over the dark backdrop. No takes visible. |
| C2 | 60 | 3×2 take grid at half opacity, "One canvas." slammed over it. |
| C3 | 115 | Grid shrunk and tilted counter-clockwise, text fading out. |
| C4 | 150 | Mark and "NodeTool" centred, tagline below, ring gone. |
| C5 | 235 | Prompt box, both lines typed: "…a desert / chase across the flats." |
| C6 | 250 | Chat window entering, flash still bright, "Direct." lower left, counter "01 / 07". |
| C7 | 300 | Chat window settled, plan text "Board is up: six shots" visible. |
| C8 | 390 | Storyboard with two stills, "Board.", "02 / 07". |
| C9 | 420 | Storyboard with clip play badges, "Render.", "03 / 07". |
| C10 | 560 | Graph with four take nodes that show frames, "Compare.", "04 / 07". |
| C11 | 600 | Sketch editor with the "HELLO WORLD" cat, "Paint.", "05 / 07". |
| C12 | 700 | Script editor with dialogue lines, "Voice.", "06 / 07". |
| C13 | 740 | Timeline with the engine close-up, "Cut.", "07 / 07". |
| C14 | 815 | "Your keys." over a dim take. |
| C15 | 870 | "Open source." in the accent gradient. |
| C16 | 960 | Mark, gradient subtitle, and pill, centred. |

## Reference render (Tier A)

1. Check out a revision where `demo/src/sizzle/Sizzle.tsx` has the SHA-256
   prefix `2b7c624db3c48d70`.
2. Run `nvm use` and `npm install` in the repository root.
3. Run `npx remotion render src/index.ts Sizzle out/sizzle-reference.mp4` in
   `demo/`. The render took about 2 minutes on an Apple Silicon laptop.

The render does not need the NodeTool backend. The log shows one
`TRPCClientError`, from a query in the embedded UI. The render ignores it.

The encoder output is not byte-stable. Two renders from the same source had
different hashes, but their frames were visually identical. So compare
renders with the scoring below, not with hashes. The reference used for the baselines below had the
SHA-256 prefix `337d614f0c2b563b`.

## Scoring

Scoring has two parts. `score.sh` checks the format, the cuts and the audio
automatically. An agent with image input then judges the picture, with the
sheets from `sheets.sh` and the rubric in [JUDGE.md](JUDGE.md).

### Automatic checks

Run the checks with the candidate first:

```bash
demo/benchmarks/sizzle/score.sh candidate.mp4 demo/out/sizzle-reference.mp4
```

The script needs `ffmpeg` and `ffprobe`. It prints a verdict for each check,
then `PASS` or `FAIL`. The exit status is 0 on a pass and 1 on a fail.

| Check | Pass condition |
|---|---|
| G1, format | Exactly 1920×1080, 30/1 fps, 977 frames, and one audio stream. |
| G2, cuts | All 13 reference cuts are found within ±1 frame. |
| G3, audio | The mean RMS difference over 0.5 s windows is 1.0 dB or less. |

### Picture judge

```bash
demo/benchmarks/sizzle/sheets.sh candidate.mp4 demo/out/sizzle-reference.mp4 out/judge 2
```

This writes 8 sheets of 9 cells. Each cell puts the reference frame above the
candidate frame at the same frame number. The judge grades content, layout,
moment and look from 0 to 2 for each cell. [JUDGE.md](JUDGE.md) has the
rubric, the report format and the commands that compute the score.

The picture passes at a video score of 0.95 or more. A candidate passes the
benchmark when G1, G2 and G3 pass and the picture passes.

The judge replaces an earlier SSIM check. SSIM stayed near 0.75 for a frame
with no content at all, and it fell below 0.95 for a 1% scale error. So SSIM
mostly measured geometry and grain, not whether the video was right.

### Baselines

| Candidate | G1 | G2 | G3 | Judge score |
|---|---|---|---|---|
| Second render of the same source | pass | 13/13 | 0.00 dB | 1.00 by construction. The spot-checked sheet was identical. |
| NodeTool harness rebuild of the earlier 25.5 s cut, judged against that cut | fail, 765 frames | 14/14 on that cut | 1.06 dB on that cut | 0.69 (content 0.76, layout 0.73, moment 0.77, look 0.50) |
| Unrelated 16 s NodeTool promo | fail, 480 frames | 0/13 | 21.30 dB | not judged |

The harness rebuild is `demo/out/sizzle-harness.mp4`, from NodeTool timeline
`199e38b33195`. It was judged against a re-render of the earlier cut, with
`SCENE_LABELS=0`, because the scene names in `sheets.sh` follow the current
cut.
