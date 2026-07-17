# video-nodes: handover for remaining work

Status of the video-nodes review/fix effort on branch
`claude/video-nodes-critique-3jab65`, and what still needs doing. Delete this
file once the items below are ticked off or turned into issues.

## Done on this branch

- `801e036` — yt-dlp node: typed empty output refs, `sub_langs` prop,
  `new URL()` validation, real prop types, malformed-metadata errors, 15 tests.
- `5936afc` — video.ts: removed the silent ffmpeg-failure fallback (terminal
  failures now throw with stderr), `MissingBinaryError` for ffmpeg *and*
  ffprobe, AddSubtitles `textfile=` escaping fix, Concat probe-then-normalize,
  input-side Trim seek, real two-pass `crop_black` in Stabilize, shared
  `ffmpeg-helpers.ts`, typed props (no `any`), save-filename de-dup, provider
  output validation, streaming raw-frame writes. 16 new tests.
- `a727bc1` — timeline.ts deduped against `ffmpeg-helpers.ts`; base-nodes
  tests updated for the throw-on-missing-binary contract.
- Small follow-ups (item 5 below): `FrameToVideo` declares `fps` as a wireable
  input (the previously-dead stream branch is now reachable); Save nodes default
  the folder to the run's workspace dir instead of the server cwd; `Trim` gained
  an `accurate` toggle that re-encodes with output-side seeking for frame-exact
  cuts. 7 new tests.

Verified: video-nodes 151/151; typecheck clean.

## Remaining work

### 1. Media refs hold full video bytes as base64 in memory (large, cross-cutting)

Every node output goes through `videoRef()` → base64 `data` on the ref: +33%
size, duplicated across `Uint8Array` + string, shipped over msgpack per node in
a chain. Worst offenders:

- `combineFramesToVideo` / all effect nodes — output re-encoded to base64 even
  though the bytes already sit in a temp file.
- `YtDlpDownload` reads the entire download into one base64 ref; a long 4K
  video can OOM the process.
- `LoadVideoAssets` reads every file in the folder into memory; its buffered
  `process()` additionally accumulates the whole list.
- `ForEachFrame` extracts all frames to PNGs before yielding the first one.

Fix direction: emit `file://` temp URIs or auto-saved assets (`autoSaveAsset`
plumbing and `loadMediaRefBytes` already exist) instead of inline `data`.
Needs coordination with the runtime and web preview, which currently expect
inline bytes for in-flight refs — hence a dedicated PR, not a drive-by.

### 2. Regenerate the DSL package wholesale (drift, pre-existing)

`npm run codegen --workspace=packages/dsl` produces a large diff against the
committed `packages/dsl/src/generated/`: 18 missing namespace files
(`nodetool.timeline`, `xai.*`, `lib.image.*`, `lib.comfy`, …), changed output
shapes (`lib.sqlite.Insert` now has `row_id`/`rows_affected`/`message`), and
missing nodes (`VideoToVideo`, `LipSync`). Only the one-line `sub_langs`
addition caused by this branch was committed; the rest was reverted to keep
this PR reviewable. Also check one suspicious regen change before committing:
`ConcatInputs` loses its `[video: string]` index signature for dynamic inputs —
verify that is intended codegen behavior for `supportsDynamicInputs` nodes and
not a codegen regression.

### 3. Move model3d out of video-nodes

`src/nodes/model3d/` (plus ~1200 lines of model3d tests) lives in a package
named video-nodes. Extract to its own package or fold into an existing 3D/media
package. Mechanical, but touches package registration and the DSL codegen.

### 4. Model-aware provider parameter validation

TextToVideo/ImageToVideo offer fixed aspect-ratio/resolution/duration enums
regardless of what the selected model supports; mismatches surface only as
provider errors mid-run. The model manifests in `packages/runtime` providers
know per-model capabilities — validate (or filter the UI choices) against them.

Note for the next session: none of the current `*-manifest.json` files carry
per-model aspect-ratio/resolution/duration constraints (checked 2026-07-17), so
this needs that capability data added to the manifests first — it's a runtime
change, not a video-nodes drive-by.

### 5. Small follow-ups — DONE

- ~~`FrameToVideoNode.run` has an `fps` stream-handle branch but `fps` is not in
  `inputFields`.~~ Declared `fps` in `inputFields`; the branch is now reachable
  when an `fps` value is wired in.
- ~~Save nodes default `folder` to `"."` (the server cwd).~~ They now fall back
  to `context.workspaceDir` (then `"."` only when no workspace is assigned) via
  the shared `saveFolder()` helper.
- ~~Trim keeps `-c copy`.~~ Added an `accurate` bool: off keeps the fast
  keyframe-aligned stream copy; on re-encodes with output-side `-ss`/`-to` for
  frame-exact cuts.

## Environment notes for the next session

- Sandboxed installs: `npm install --ignore-scripts` skips the better-sqlite3
  native rebuild; base-nodes/websocket tests then fail on missing bindings.
  Run `npm run rebuild:native` afterwards (worked in this sandbox).
- Tests import `@nodetool-ai/video-nodes` from `dist/` — run
  `npm run build --workspace=packages/video-nodes` before `npx vitest run`.
- ffmpeg/ffprobe are not installed in the sandbox; all tests mock
  `node:child_process`. The timeline tests' mock covers the shared helpers via
  a `promisify.custom` handler — keep that if you touch the exec plumbing.
