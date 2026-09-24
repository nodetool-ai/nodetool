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
- **Workaround:** none within the brief. At this rate, and at about 100
  layers per frame, a 780-frame render would take many hours. Every preview
  over about 120 layers is killed by the watchdog.
- **Visual cost:** the film cannot be rendered.

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
