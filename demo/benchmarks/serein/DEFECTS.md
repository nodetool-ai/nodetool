# Serein build: harness defects

One entry for each harness defect met while building the film with the
NodeTool MCP tools. Timeline `1336a629714e`. The build source is
[build.js](build.js).

## 1. The sandbox cannot read an asset that `upload_asset` created

- **Tried:** upload the generated document JSON with `upload_asset`
  (`file_path`), then read it in `execute_code` with `nodetool.assets.read`.
- **Happened:** `Asset not found` for the full id, the `asset://` URI and the
  12-character prefix. `nodetool.assets.list` returns an empty list for the
  same user. `view_image` also refuses the 12-character ids that
  `preview_timeline_frame` returns.
- **Repro:** `upload_asset {file_path: "/abs/doc.json"}`, then
  `execute_code: return await nodetool.assets.read("<asset_id>")`.
- **Workaround:** the document is generated inside the sandbox action. The
  minified action is made by [guest.mjs](guest.mjs) from `build.js`. Previews
  are read from `~/.local/share/nodetool/assets/1/<id>*.png` on disk.
- **Visual cost:** none. The cost is about 7k tokens per build run.

## 2. A wiggle link has a fixed amplitude

- **Tried:** the brief's wiggle on the wall, growing 0 → 6 px over frames
  96–122.
- **Happened:** `animationLinks` `{kind: "wiggle", amplitude, frequencyHz}`
  has no curve for the amplitude, and a link cannot start mid-clip.
- **Repro:** `{"target": "positionX", "kind": "wiggle", "amplitude": 6, "frequencyHz": 8}`
  on a clip: the full amplitude plays from frame 0.
- **Workaround:** the wiggle is baked as per-frame `offsetX`/`offsetY` custom
  keyframes with a growing amplitude.
- **Visual cost:** none.

## 3. A repeater cannot tile a grid

- **Tried:** the skeleton cards as one rect with a repeater of 40 that tiles a
  grid.
- **Happened:** `repeater.positionStep` is one vector, so 40 copies form one
  line.
- **Repro:** `repeater: {count: 40, positionStep: {x: 460, y: 0}, timeStepMs: 0}`
  gives one row of 40 cards, 18 400 px wide.
- **Workaround:** five repeaters of 8, one per column, each for the rect and
  its two placeholder bars.
- **Visual cost:** none.

## 4. A row layout cannot hold a group

- **Tried:** the logo row as `layout: {kind: "row", children: [mark, wordmark]}`.
  The mark is a group of three shapes.
- **Happened:** `clipLayoutBox` measures a group as the full canvas, so the
  row places the wordmark one frame width away.
- **Repro:** a row with a group child and a text child.
- **Workaround:** the mark and the wordmark are placed by hand at x −221 and
  +76.
- **Visual cost:** none. The row does not follow text changes.

## 5. Camera depth applies to each drawn clip, not to its group

- **Tried:** each wall card as a group with `depthPx` on the group.
- **Happened:** `resolveCamera2D` runs on each media layer's own transform.
  A group's `depthPx` is ignored, and a child's depth scales only its local
  offset inside the group, so a grouped card comes apart under the camera.
- **Repro:** a group with `depthPx: -300` and two children, under a
  `camera2d` with `depthPx: 260`.
- **Workaround:** the wall cards are not grouped. Every rect, dot and text
  carries the card position plus its local offset, and its own `depthPx`.
- **Visual cost:** none. The wall has 21 × 6 leaf clips instead of 21 groups.

## 7. A full-film write and preview blocks the server until the watchdog kills it

- **Tried:** one `execute_code` action: `set_timeline_document` with the
  whole film (657 clips, 318 tracks), then `preview_timeline_frame` at 16
  checkpoints in two calls of 8.
- **Happened:** the server wrote no log line from about 21:57 on. The Electron
  watchdog health check failed three times (21:59:29–22:00:29) and the
  watchdog tried a restart. The restart failed with `EADDRINUSE 127.0.0.1:7777`,
  because the blocked process still held the port. At 22:06:02 the old process
  got SIGTERM and exited, and the MCP call ended with `Connection closed`.
  After that no server ran at all.
- **Repro:** the action made by `node guest.mjs 40 110 140 175 225 244 262 330 420 480 530 604 630 655 740 778`.
- **Measured after a restart:** the document write finished (the saved
  document has all 657 clips). The preview is the call that blocks.
  `preview_timeline_frame` at frame 145 (S2, 7 layers) took 5.1 s. At frame 40
  (S1, 252 layers) it took 188 s, about 0.75 s per layer. The server answered
  no health check for that whole time, and the watchdog killed it again at
  22:48 with the same `EADDRINUSE` restart failure. The frame itself was
  correct.
- **Cause, verified with a CPU profile** (an in-process run of
  `renderTimelineFrames` on frame 40 took 164 s, and 130 s of it is in
  `gaussian` in `packages/timeline/src/render/cpuLegacyEffects.ts`):
  1. `resolveSceneMotionBlur` (`render/motionBlur.ts`) takes the largest
     `motionBlur.samplesPerFrame` of all clips in the document. The paper
     plane in S4c asks for 8 samples, so every frame of the film composites
     8 times, also frame 40, where the plane is not active.
  2. The camera depth of field gives each wall layer a blur of radius 2.1 to
     2.3. `applyCpuGaussianBlur` blurs the whole 640×360 surface for each
     layer. The layer content covers 0.7% of that surface on average. One
     call takes about 87 ms.
  3. Frame 40 makes 1632 blur calls (204 layers × 8 samples). The colour
     grade of the skeleton cards also runs over the full surface (17 s).
  4. The preview runs on the server's main thread, so the server answers no
     health check until the frame is done.
- **Status:** fixed in the engine after this report. Frame 40 now takes 3.8 s
  in-process instead of 164 s, and the 16 checkpoint previews run in one call.
- **Visual cost:** none after the fix.

## 6. The 2D rotation sign is the opposite of CSS (D4 again)

- **Tried:** `rotation: -12°` for the counter-clockwise wall tilt.
- **Happened:** the wall turns clockwise.
- **Workaround:** `rotation: +12°`.
- **Visual cost:** none.

## Resolution checks

- **1:** The exact `upload_asset` `file_path` → same-session `execute_code`
  `nodetool.assets.list/read` path now passes with full and 12-character IDs.
  `view_image` also accepts a short ID for an uploaded PNG. The reported failure
  did not reproduce in this checkout, so no asset implementation changed.
- **2:** Wiggle links accept clip-local `amplitudeKeyframes` and interpolate
  the amplitude between keys.
- **3:** Repeaters accept `columns` and `rowStep` to place copies in a grid.
- **4:** Row layout measures a group's child bounds.
- **5:** A camera applies authored group depth to the shared parent transform
  and blurs the composed group. Groups without authored depth leave child depth
  behavior intact.
- **6:** Positive 2D rotation now follows the CSS clockwise convention. The
  compensating angles in [build.js](build.js) were reversed for a future film
  rebuild. Existing saved documents retain their authored angle values.
- **7:** Frame motion blur is selected from clips active in the frame window.
  Frame 40 now resolves to one sample. Sparse CPU blur and color grade work
  within content bounds. [profile-frame40.ts](profile-frame40.ts) renders frame
  40 of the generated document at width 640 in-process. It took about 3.9 seconds
  with child depth blur active,
  compared with the recorded 164 seconds before the fix. The 780-frame export
  has not been rerun.

## 8. The typewriter preset shows nothing until its window ends

- **Tried:** the S4c body with `preset: "typewriter"`, `durationMs: 1400`, a
  266 ms delay and a caret.
- **Happened:** the preview draws no character and no caret for the whole
  window. At the window end the full text appears at once.
- **Repro:** one text clip with `{role: "in", preset: "typewriter",
  durationMs: 1400}` and no delay. The frames at 100, 400, 1000, 1300 and
  1399 ms are empty. The frame at 1401 ms shows the whole text.
- **Workaround:** use the `typewriter` preset with `durationMs: 1`, a character
  stagger of 1399 / (length − 1) ms, and a caret. This matches the timing
  generated by `animate_clip`. The local frame-480 preview shows the caret.
- **Visual cost:** the caret appears in the local full export at frame 480.

## 9. `followPath` writes top-left pixels into a centre-relative position

- **Tried:** the paper plane on a path authored in frame units (0..1), as the
  preset describes: "normalized 0..1 the same way as ClipShapeStyle.d".
- **Happened:** the preset writes `positionX`/`positionY` in canvas pixels from
  the top-left corner. `sceneModel` uses them in place of `transform.position`,
  which is an offset from the frame centre. The plane is drawn 960 px right and
  540 px down, off the frame.
- **Repro:** a centred shape with `followPath` on `M0.5 0.5 L0.6 0.5`. It
  draws at the bottom-right corner, not at the centre.
- **Workaround:** the path is shifted by −0.5 in x and y.
- **Visual cost:** none.

## 10. A custom `in` animation does not hold its end value

- **Tried:** mid-clip moves that end away from the rest pose: the tone pill
  slide, the summary header drop, the composer fade-out.
- **Happened:** `compile.ts` sets `holdBefore` for `in` and `holdAfter` only
  for `out`. After an `in` window ends, the value snaps back to the rest pose:
  the pill returns to "Formal" and the faded composer shows again.
- **Repro:** a clip of 3 s with a custom `in` animation `offsetX` 0 → 200 over
  0–500 ms. At 1 s the offset is 0.
- **Workaround:** `on()` in build.js turns such an animation into an `out`
  with the delay counted from the clip end. Custom curves are not reversed
  for `out`, so the end value holds.
- **Visual cost:** none. The rule is not in the custom-animation docs.

## 11. The particles generator paints `colorA` as an opaque background

- **Tried:** a `particles` generator in blue and rose (`colorA`, `colorB`)
  with the screen blend over the teal backdrop.
- **Happened:** the generator mixes from `colorA` to `colorB` by particle
  coverage, so the whole frame fills with `colorA`.
- **Workaround:** set `colorA: "#000000"` with screen blend so the black drops
  out. The launch film uses one faint generator behind the zero, plus
  animated shape dots for the radial burst that the generator cannot draw.
- **Visual cost:** the generator supplies texture, while the shape dots carry
  the burst motion.

## 12. The GPU export draws S1 wrong, and differently from run to run

- **Tried:** `render_timeline` on the whole film (job `6235f4168d75`, asset
  `36ac845c2923`).
- **Happened:** frames 0–4 are black. From frame 5 to 122 the S1 backdrop is
  solid orange, not navy, and most wall cards are missing. Every other scene
  matches the CPU preview. At the render start the server logged 44 WebGPU
  validation errors: `[Buffer "uniform-ring-N"] used in submit while
  destroyed`, in `CommandEncoder "timeline-headless-frame"`.
- **Repro:** `renderTimelineComposited` in a fresh process on the S1 clips
  only gives a navy backdrop, with no GPU errors. So the fault depends on the
  GPU state of the long-lived server. Some fresh processes also stall before
  the first frame.
- **Workaround:** none found. A second server render was cut off when the
  dev server restarted.
- **Visual cost:** C1 and C2 fail. The first five frames are black.
- **Later local export:** `demo/out/serein-launch-fixed.mp4` has a navy wall
  from frame 0. Frames 40 and 110 show the intended wall and counter. This
  establishes a correct local render, but the server failure remains intermittent.
- **Full local check:** `demo/out/serein-launch-validate-20260925.mp4` rendered
  all 780 frames in a fresh process without GPU errors. The long-lived server
  failure has not been retested there.

## 13. The `glitch` transition is a dissolve, not a cut

- **Tried:** S5b with `transitionIn: {type: "glitch", durationMs: 150}`,
  overlapping S5a by 4 frames.
- **Happened:** the two words blend across 640–644. scdet finds no hard cut
  at 642, so G2 fails with 4 of 5 cuts.
- **Workaround:** S5a ends at 641, S5b starts at 642 with no transition, and
  a glitch plus RGB-split adjustment clip on its own track covers 640–644.
- **Local full export:** `score.sh` detects the cut at frame 642 exactly.

## 14. The brief's RGB split amount is below one source pixel

- **Tried:** the S1 `rgbSplit` ramp from 0 to 0.4 specified in BRIEF.md.
- **Happened:** the effect interprets `amount` as source-pixel displacement.
  At frame 110 the ramp reaches 0.216 pixels, about 0.072 pixels on the
  640-pixel checkpoint image. Its coloured edges are not visible there.
- **Workaround:** build.js ramps to 14 source pixels. At frame 110 this gives
  7.54 source pixels, or about 2.5 pixels on the checkpoint image. This
  departs from the brief's numeric endpoint to meet its visible-split test.
- **Visual cost:** the split affects the whole frame, including the wall.
