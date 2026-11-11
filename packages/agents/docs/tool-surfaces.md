# Headless tool surfaces

**Navigation**: [Agents package rules](../AGENTS.md) → **Headless tool surfaces**

Paths are relative to `packages/agents/` unless they name another package.

## Script Voicing Tools (`src/capabilities/scripts.ts`)

The headless path from a written script to voiced takes and an assembled
voiceover sequence. The editor voices a line over the chat WebSocket's
`generate_media` / `transcribe_audio` RPCs, and the `nodetool.script.*` nodes do
it inside a workflow; an agent outside the browser had neither. These call the
provider directly, save each take as an asset, and write it back onto the
persisted script.

| Tool | Does |
|---|---|
| `list_scripts` | Scripts newest first, with line and voiced counts |
| `get_script` | Cast, lines, and each line's voicing status |
| `voice_script_lines` | TTS per line → a take, current on its line |
| `assemble_script_timeline` | Voiced takes → a saved `timeline_sequences` row |

`get_script` reports the status the editor's gutter shows — `draft` (never
voiced), `stale` (text or voice changed since the take), `voiced`, `no_voice` —
and `voice_script_lines` defaults to every line that is draft or stale, so a
whole script is one call. Each line uses its own voice (its override, else its
speaker's) unless the call passes provider+model+voice to override them all; a
half-specified override is an error, not a guess. Lines are voiced concurrently
(default 3, max 8, 60 per call) and each take lands through a CAS on the row's
`updated_at`.

Synthesis delegates to `GenerateSpeechTool`, so the encoded/streaming-PCM
provider split is handled in one place. Word timings come from a best-effort ASR
pass (`whisper-1` by default, `transcribe: false` to skip it) and ride into the
assembled clips as captions. Take duration is the container's own, probed in
process through `@nodetool-ai/runtime/media`, falling back to the last word
timing and then to the 3s placeholder. A take stays assemblable without an
exact length.

The voice rule (`effectiveVoice`), the staleness rule (`needsVoicing`) and the
script → timeline mapping (`buildScriptTimeline`) live in
`@nodetool-ai/timeline`; the editor's "Send to timeline" and
`nodetool.script.ScriptToTimeline` call the same functions, so the three
surfaces cannot drift. Re-assembly rewrites this script's voiceover track in
place and keeps clips other surfaces added.

Tests: `tests/script-voice-tools.test.ts` (in-memory DB, fake provider — no
network).

## Storyboard Render Tools (`src/capabilities/storyboards.ts`)

The headless path from a directed storyboard to rendered media and an assembled
cut. The editor has always had this path — the Storyboard surface builds a
throwaway `TextToImage → Output` / `ImageToVideo → Output` graph per shot and
runs it in the browser — but an agent outside the browser had to author, save,
and run a workflow per shot, or drive the `ui_storyboard_*` tools, which only
work while that board is open. These call the provider directly, save each
result as an asset, and write it back onto the persisted board.

| Tool | Does |
|---|---|
| `list_storyboards` | Boards newest first, with per-board still/clip counts |
| `create_storyboard` | Blank board (then `edit_storyboard` adds shots) |
| `get_storyboard` | Shots with ids, status, and whether each has a still/clip |
| `direct_storyboard` | Runs the Director over the board's brief/genre/style and writes the screenplay; `redirect` keeps retained shots' ids and media |
| `render_storyboard_stills` | `text_to_image` per shot → the shot's keyframe |
| `render_storyboard_clips` | the shot's clip: `image_to_video` seeded by the keyframe, or `text_to_video` from the prompt |
| `revise_storyboard_clip` | `video_to_video` revision of one shot's clip |
| `assemble_storyboard_timeline` | Rendered clips → a saved `timeline_sequences` row |
| `derive_shot_from_clip` | Frames of a shot clip → a new reference-to-video shot after its source, and a draft clip following it on a new track above the source clip |
| `get_storyboard_one_take` | The creator's one-take prompt, the block compiled from the board, the full prompt, `[Image N]` references and warnings |
| `update_storyboard_one_take` | Sets the creator's one-take prompt and shots' `end_state` / `sound` |

`edit_storyboard` is the document half: beside the shot ops it carries the
guided flow's `set_setup`, the scene ops (`move_shot`, `duplicate_shot`,
`update_scene`, `create_scene`, `merge_scene`), `set_style`, and the version ops
(`select_version`, `delete_version`, `add_keyframe_version`). Every one mirrors
a `ui_storyboard_*` browser tool and writes the same document shape, so a board
edited headlessly and one edited in the editor cannot diverge (PRD § 7.10).

Both render tools take `targets` (shot ids, indexes, or slugs) and default to
"whatever still needs this step", so a whole board is one call. `stale_only`
narrows that to the shots whose selected version was rendered from inputs the
shot no longer has (`isVersionStale`), which is how a style change is re-rendered
without re-rendering the board. Shots render
concurrently (default 3, max 8, 24 shots per call). Every write is a CAS on the
row's `updated_at` with a bounded retry, because concurrent renders all land on
the same board document; a conflicting write re-reads and re-applies rather than
clobbering.

The provider and model come from the call, else from the board's own
`imageModel` / `videoModel`. There is no fallback default — an unset model is an
error naming `find_model`, not silent spend on a model nobody chose.

`Shot.render_mode` decides whether a clip needs a still. `"keyframe"` (the
default) animates the selected still; `"direct"` renders from the prompt and
skips the stills step entirely, for shots where first-frame conditioning is the
wrong trade — heavy motion, which I2V renders stiffer than the same model's
T2V, and native-audio models, which are weakest on their image path. A direct
shot's prompt carries framing and board style, since no still carries them.
`render_storyboard_clips` takes `mode` to override every selected shot for one
call without editing the board.

Prompt composition, entity seasoning (`entitiesForShot`, `@nodetool-ai/protocol`)
and the shot → timeline mapping (`buildStoryboardTimeline`,
`@nodetool-ai/timeline`) are the editor's, so a board rendered headlessly matches
one rendered in the UI. Board entities are library assets carrying a
`metadata.nodetool_entity` marker; their descriptors and first reference image
ride along as the `entities` param, which the runtime expands at the provider
layer.

Tests: `tests/storyboard-render-tools.test.ts` (in-memory DB, stubbed
predictions — no provider calls).

## Media Analysis (`src/capabilities/analysis.ts`, `src/analysis/`)

Five read-only capabilities that measure media instead of describing it:
`analyze_audio`, `analyze_audio_spectrum`, `detect_audio_events`,
`analyze_video`, `detect_video_scenes`. `understand_video` hands a clip to a
multimodal model and gets prose; these hand back numbers a model cannot derive
from watching — loudness against a delivery target, which octave band the
energy is in, where the silences and onsets fall, how much the picture moves,
where the cuts are.

The split is deliberate. `src/analysis/audio-dsp.ts` and `video-frames.ts` are
pure functions over `Float32Array` samples and RGBA pixels — no decoder, no
context, no I/O — so `tests/audio-dsp.test.ts` and `tests/video-frames.test.ts`
check them against signals whose answers are known without running the code: a
1 kHz sine's spectral centroid is 1 kHz, a solid grey frame has zero contrast,
and the BS.1770 reference signal reads -20.0 LUFS. `media-decode.ts` is the
Mediabunny seam (PCM out of an audio track, RGBA frames at chosen timestamps,
container metadata), and the capability file resolves the reference, picks the
analysis parameters, and shapes the answer.
The onset and tempo detector lives in `@nodetool-ai/timeline`
(`src/audioOnsets.ts`) so the timeline editor's Detect beats action runs the
same code in the browser. `audio-dsp.ts` re-exports it.

`src/analysis/mediabunny-runtime.ts` is where the Node codec adapter is
registered, once per process. `sandbox-av-media.ts` imports it rather than
keeping its own copy — two bootstraps racing to register the same adapter is
the kind of thing that works until it does not.

Audio headroom uses the original interleaved channel samples. Peak and clipping
count individual channel samples, and `channel_samples_analyzed` is the
`clipped_fraction` denominator. RMS and energy envelopes average channel powers.
Keep signed `toMono` averaging for spectra and spectral onsets, and planar
channels for LUFS. The stereo WAV regressions are in
`tests/analysis-channel-safety.test.ts`.

Video capabilities use `videoSamplingPlan` for both decode timestamps and
sampling metadata. `sampling.requested_fps` records the caller's rate, while
`sampling.fps` records the bounded schedule's effective rate. `budget_limited`
reports the decode cap independently of response series `decimated`.
`decoded_fps` and `max_gap_seconds` describe decoded coverage, including missing
frames and the clip boundaries. Scene timing notes must use that coverage,
not the requested rate. `tests/capabilities-video-analysis-sampling.test.ts`
checks the real scheduling and response paths with a controlled decoder.

Three properties worth keeping when changing any of this:

- **No ffmpeg.** Mediabunny decodes, so an install with no managed runtime
  tools still answers.
- **Every answer is bounded, and says so.** Series are decimated to a point
  budget (`decimated`), decoding stops at a duration cap (`truncated`), and
  video frames are never all held at once — `forEachVideoFrame` closes each one
  after the callback, because a few hundred 1080p RGBA frames is gigabytes.
- **A measurement that means nothing says so.** `tempo.reliable` is false below
  four onsets or below a confidence floor, and `integrated_lufs` is null rather
  than `-Infinity` for audio shorter than one 400 ms gated block.

That last one was earned. Spectral flux was raw rectified difference, and a
held 1 kHz sine reported 48 onsets at a confident 87 BPM: at a hop that is not
a whole number of cycles, a stationary tone's leakage pattern shifts between
frames, so its bin magnitudes wobble forever. `spectralFlux` normalizes by the
frame's own magnitude — the wobble is ~2%, a real onset is a large fraction of
1 — and `detectOnsets` carries an absolute `minStrength` floor beside its
adaptive one, because where the curve is flat the local deviation collapses and
every ripple clears mean + 1.5σ.

## Timeline Frame Preview (`src/timeline-preview/`)

`preview_timeline_frame` composites a timeline at chosen timecodes and returns
one image handle per frame. It is the only way an agent sees what a cut *looks*
like: `validate_timeline` reads the document, `ui_timeline_get_clip_frames`
samples one clip's source media in a browser, and neither shows the composited
picture — the title over the shot, an animation mid-flight, a transition part
way through, the track order deciding what covers what.

It resolves the scene through `@nodetool-ai/timeline/scene`, rasterizes
text, shapes and captions with the shared drawing rules, and decodes media
with Mediabunny. A lazy child uses the headless compositor and shared shaders
with 8-bit targets. FP16 stays off. The CPU route remains for A92 comparisons.

- **One renderer child per parent.** Concurrent requests wait for the preceding
  child to exit. Layout checks reuse that child across their same-size frames
  and release it at the end of the diagnostic batch. Cancelling a waiter rejects without stopping the current pass.
  A crash rejects the active request and releases ownership for the next pass.
- **Dawn and an adapter are required only for rendering.** Install the addon
  with `nodetool packs add webgpu --yes`. A host without hardware can use
  Mesa lavapipe (`mesa-vulkan-drivers`). For software qualification, unset
  `DISPLAY` and set both `VK_ICD_FILENAMES` and `VK_DRIVER_FILES` to the
  lavapipe ICD. Missing runtimes and adapters return actionable errors without
  CPU fallback. Ordinary tool registration does not initialize Dawn.
- **Frames are handles, not pixels.** `view_image` is the one mechanism that
  pulls pixels into context, so each frame is persisted with `persistOutput`
  and returned as an `asset_id`. Three inline base64 frames would sit in every
  later turn of the conversation whether or not the model looked at them.
- **What it cannot draw, it names.** Unknown enabled effects appear in
  `effects_not_applied`. Missing sources and mattes produce skipped-layer
  diagnostics. Shader-supported treatments do not inherit CPU approximation
  warnings. Invalid mask uploads and missing precompose groups fail explicitly.

Tests: `tests/capabilities-timeline-preview.test.ts`, which reads pixels off
the rendered PNGs (layer order, a fade's mid-ramp opacity, text actually drawn)
rather than asserting a call happened.

## Google Workspace Tools (`src/tools/google-workspace-tools.ts`)

Drive, Gmail, Docs, Sheets and Calendar tools that authenticate with the access
token from the user's Google sign-in — there is no API key. The Supabase Google
login hands the browser a `provider_token`, the web app posts it to
`POST /api/oauth/google/session`, and the server stores it as an
`OAuthCredential` under provider `google`. Tools read it back through the
virtual secret key `GOOGLE_ACCESS_TOKEN`, which `getSecret` routes to
`resolveGoogleAccessToken` (refreshing a stale token when `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are set).

A server without a login can never
produce a token, so the chat toolbelt adds them only when
`isGoogleWorkspaceEnabled()` (`@nodetool-ai/config`) is true — Supabase auth
mode, or `NODETOOL_GOOGLE_WORKSPACE=1`.

The fourteen `lib.google.*` nodes are gone. Each wrapped a call this module
already makes, on the same sign-in token, and the module makes six more no node
ever offered: get one Drive file, get one Gmail message, list labels, create a
spreadsheet, list calendars, delete an event. The capability is the only Google
surface now, and it is two things at once — an agent tool and a guest import.

```js
// Nothing to install — capability modules are mounted by the host, not
// resolved as packs from the catalog.
import { drive_search, gmail_send_message } from "@nodetool-ai/sandbox-nodetool/google";

const { files } = await drive_search({ query: "name contains 'invoice'" });
await gmail_send_message({ to: "a@b.c", subject: "Invoices", body: String(files.length) });
```

```ts
import { getGoogleWorkspaceTools } from "@nodetool-ai/agents";

if (isGoogleWorkspaceEnabled()) {
  toolbelt.push(...getGoogleWorkspaceTools());
}
```

A missing or revoked credential surfaces as `{ error }` telling the user to sign
in with Google again, rather than throwing — the agent can then pick another
route instead of failing the whole step.
