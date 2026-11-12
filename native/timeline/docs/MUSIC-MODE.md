# Music mode in the native timeline: design and implementation plan

| | |
|---|---|
| Status | Design. No code exists yet. |
| Target | `native/timeline/` (C++20, Qt 6.12), the NodeTool server, acestep.cpp `ace-server` |
| Read at | `nodetool-ai/nodetool` `4ca80f25`, `ServeurpersoCom/acestep.cpp` `07abf07` |

Paths that start with `src/`, `qml/`, `scripts/` or `docs/` are relative to `native/timeline/`. Paths that start with `packages/`, and paths with a leading slash, are relative to the repository root. Paths that start with `acestep.cpp:` are in that repository, and `ARCHITECTURE.md` without a prefix is `acestep.cpp:docs/ARCHITECTURE.md`.

Codes in this document: MF is a finding, MD a decision, MR a risk, MQ an open question, MM a milestone. The M prefix keeps them apart from the D, R and Q codes of [DESIGN.md](DESIGN.md). Requirement IDs such as MT-5 and GN-2 are listed in section 21.

## 1. Summary

Music mode makes the native timeline editor an arranging tool for generated audio. A person selects a bar range on one track, writes a prompt, and receives candidate audio as takes that sit on the project's bar grid. There are three operations:

1. **Generate** creates a clip from a prompt in an empty range (ACE-Step `text2music`).
2. **Regenerate** replaces selected bars inside a clip and leaves the rest of the clip unchanged (`repaint`).
3. **Add instrument** creates a clip on one track that follows what the other tracks play (`lego`).

The work is split across three processes. The native app selects the target, plans the request, renders context audio with its own mixer, and places the results. The NodeTool server owns the generation backend, measures alignment, and cuts and splices the audio, so the web editor can use the same path later. Generation runs in ACE-Step 1.5 through `ace-server` from acestep.cpp, which the server starts and supervises.

The plan in section 17 has eight milestones and takes about 11 weeks for one engineer.

## 2. Scope

### In the first release

- A music project stores tempo, time signature, key and track roles, and opens with a bar ruler and a music layout (MT-1, MT-2, UI-1, UI-3).
- A bar range on one track is the generation target. It snaps to the grid and has a free-placement modifier (MT-3, MT-5).
- Generate, Regenerate and Add instrument are inferred from the selection and can be overridden (GN-1 to GN-7).
- Results arrive as takes with a generation record, alignment measurements and a drift badge (TK-1 to TK-6, AL-1 to AL-5).
- A job list queues, cancels and retries jobs, and resubmits an interrupted job once (JB-1 to JB-5).
- The selected range loops without a gap, and the engine runs at 48 kHz (MT-6, AU-4).
- The app installs, starts, health-checks and restarts `ace-server` on macOS with Apple Silicon and downloads its models (BE-1, BE-3, BE-5).

### Not in the first release

- The requirements exclude MIDI, virtual instruments, plug-in hosting, live recording, time-stretch and tempo changes (section 21).
- The web editor gets no music UI. The server half of this design is shared, so the web editor needs only its own selection, panel, loop and bounce work later.
- Lyrics and vocals are left out. Every request sends `[Instrumental]` (MQ4).
- The `extract`, `cover` and `complete` tasks are not called (GN-9). The backend interface carries their names.
- Workflow nodes and the MCP server cannot run the three operations (GN-8). Two of the three need a bounce, and only the native mixer renders one in this design. The native assistant gets the three commands.
- No adapter is built for the upstream Python API server (BE-4). The interface in section 12.1 allows one.
- `acestep-core` is not linked into the app. A crash in GGML would end the editor, and the web editor would gain nothing.
- Windows and Linux get no local generation. Those machines can point at a remote `ace-server` (BE-7, MQ5).

### Assumed decisions

Three decisions are open. This design assumes an answer for each.

| Decision | Assumed answer | What changes if the answer differs |
|---|---|---|
| Which editor gets music mode first | Native | Nothing in the server half. The web editor needs its own selection, panel, loop and bounce in place of the native half |
| acestep.cpp as the only backend | Yes, behind the interface in section 12.1 (MQ1) | A second adapter adds about one week to MM6 |
| Per-launch token for the backend (BE-6) | Loopback only on a random port, and a `--api-key` flag proposed upstream (MQ2) | A local fork of `ace-server` adds a patch to carry in the MM6 build |

## 3. Findings that shape the design

MF1. **The native app cannot generate by itself.** It sends `generate_media` to the NodeTool server over a WebSocket and records takes from the assets that come back (`src/ai/GenerationController.cpp:515-524`). [AI-WORKFLOWS.md](AI-WORKFLOWS.md) tells contributors to reuse that contract. The backend therefore belongs in the server.

MF2. **The native generation controller runs one generation per timeline.** A second submission is refused with "A generation is already in progress for this timeline" (`src/ai/GenerationController.cpp:120-132`, `481`). Music mode needs several queued jobs, so it gets its own job module (MD18).

MF3. **Switching a take does not move the clip's source window unless the take's recorded window still fits.** `selectTake` writes `currentAssetId` and applies the take's `sourceMapping` only while the mapping's span equals the clip length within 1 ms (`packages/timeline/src/takes.ts:75-84`, `212-243`, mirrored in `src/ai/Take.cpp:39-51`). After a trim or a split the mapping is skipped. Takes whose audio starts at different offsets would then play out of time. Every take of a clip must share one asset layout (MD14).

MF4. **`ace-server` changes the level of every output except `wav32`.** It scales the audio so the 99.999th percentile reaches full scale and hard-clips the rest (`acestep.cpp:tools/ace-server.cpp:872-874`, `acestep.cpp:src/audio-io.h:306-345`). A repaint returned as `wav16` or `wav24` would come back louder or quieter than its source. The provider requests `wav32`.

MF5. **Repaint output is close to the source outside the region, not identical.** The source stays as latents outside the region, the region boundaries snap to 40 ms latent frames, and the whole clip passes through the VAE decoder (`acestep.cpp:docs/ARCHITECTURE.md:431-449`). GN-2 asks for identical samples outside the selection, so the splice happens on our side in PCM.

MF6. **The model accepts a narrower range of musical settings than the editor.** `AceRequest.bpm` is an integer, and the language model's grammar accepts 30 to 300 BPM, the time signatures 2, 3, 4 and 6, and keys from A to G with an accidental and major or minor (`acestep.cpp:src/metadata-fsm.h:170-214`). The native tempo edit accepts fractional BPM from 20 to 300 and 1 to 16 beats per bar (`src/server/TimelineList/ProjectSettingsEdit.cpp:37-39`).

MF7. **A loop wrap is a seek.** The GUI-thread clock sees the end of the range, raises the seek serial and re-anchors (`src/playback/PlaybackClock.cpp:519-523`). The decode worker then builds a new session, and the device callback writes silence until 250 ms of PCM is primed (`src/audio/AudioEngine.cpp:38`, `228-231`). The loop has an audible gap.

MF8. **Playback runs at the device rate, and bounce and export run at 48 kHz.** The app opens the output device at its own rate (`src/audio/AppAudio.cpp:28`), and the export calls `renderOffline` at 48 kHz (`src/export/ExportEngine.cpp:315`). On a 44.1 kHz device a 48 kHz take is resampled for playback and not for the bounce.

MF9. **`renderOffline` renders any range with the device's own mixer.** It takes a start and a duration and uses the same plan and `mixBlock` as the device callback (`src/audio/AudioEngine.h:130-135`). It has no track filter. A caller that wants a subset passes a changed copy of the timeline.

MF10. **The server removes document fields that the protocol schema does not list.** The native model keeps unknown JSON on save, and the server strips it (`docs/DESIGN.md` D4). Every new field goes into `packages/protocol/src/api-schemas/timeline.ts` first.

MF11. **The server already marks generations that a dead process left running.** At start it sets those rows to `interrupted` (`packages/models/src/prediction.ts:709-728`, `packages/websocket/src/server.ts:409`), and `lookup_generations` reports that status (`packages/websocket/src/session/commands.ts:67-72`). The native controller treats it as final (`src/ai/GenerationController.cpp:984`). The resubmit rule of JB-2 attaches here.

MF12. **Lego is the least certain operation.** acestep.cpp's documentation says that whether the output is the new stem or the full mix "is model-dependent and unverified in this codebase" (`acestep.cpp:docs/ARCHITECTURE.md:635-638`). Lego also needs the base DiT and the language model, while Generate and Regenerate run on the turbo DiT (`ARCHITECTURE.md:395-407`).

MF13. **Text-to-music is two backend jobs.** `POST /lm` writes the audio codes and `POST /synth` renders them (`ARCHITECTURE.md:271-301`, `907-913`). The language model draws its own random seed, so a seed alone does not reproduce a take. The audio codes do.

MF14. **acestep.cpp publishes no tagged release and no macOS binary.** NodeTool has to build, sign and host `ace-server` at a pinned commit.

## 4. Architecture

```
 native app (Qt, C++)                 NodeTool server (Node.js)              ace-server (C++, GGML)
 ---------------------------------    -----------------------------------    ----------------------
 MusicSelection   track + bar range
 MusicPlan        operation, windows
 MusicBounce      renderOffline -> WAV ---- asset upload --->  asset store
 MusicJobs        ---- generate_media { mode: "music", music: {...} } --->
                                      music-generation.ts
                                      acestep provider (music_task) ---- POST /lm, /synth -->  FIFO worker
                                                                    <--- GET /job?id=N&result=1 (wav32)
                                      align, gain, cut, splice
                                      take assets -> asset store
                  <--- rpc_response { asset_ids, music_takes } ----
 music.applyResult  takes on the clip, one undo step
 AudioEngine      48 kHz, loop wrap in the callback
```

| Piece | Location | State |
|---|---|---|
| Document fields | `packages/protocol/src/api-schemas/timeline.ts`, `packages/timeline/src/types.ts` | Changed |
| Frame math, planner, alignment, cut, splice | `packages/timeline/src/music/` | New, pure functions |
| Planner and frame math in C++ | `src/music/MusicTime.*`, `src/music/MusicPlan.*` | New, held to the TypeScript by an oracle test |
| Range selection | `src/music/MusicSelection.*`, `qml/music/MusicRangeOverlay.qml` | New |
| Context bounce | `src/music/MusicBounce.*`, `src/assets/AssetWav.*` | New, float WAV writer added |
| Jobs | `src/music/MusicJobs.*` | New |
| Edits | `src/music/MusicEdits.cpp` through `registerEdit` | New |
| Panel and layout | `qml/music/`, `qml/dock/DockLayout.js` | New panel, new preset |
| Loop and engine rate | `src/audio/AudioEngine.*`, `src/audio/AppAudio.cpp`, `src/playback/` | Changed |
| Request schema | `packages/protocol/src/ws-commands.ts` | Changed |
| Server handler | `packages/websocket/src/session/music-generation.ts`, `inference.ts`, `commands.ts` | New file, two changed |
| Provider capability | `packages/runtime/src/providers/types.ts`, `base-provider.ts` | Changed |
| acestep provider | `packages/runtime/src/providers/acestep-{provider,server,models}.ts` | New |
| Runtime package | `packages/config/src/acestep-runtime.ts`, `packages/runtime-install/src/packages/AceStepRuntimePackage.ts` | New |
| Backend build | `/.github/workflows/acestep-build.yml` | New |

The native module follows the extension points in [`src/app/README.md`](../src/app/README.md): a `module.cmake` under `src/music/` and `qml/music/`, edits through `registerEdit`, the panel through an `nt-panel` marker, menu items through `registerShellMenuItem`, and a launch flag through `registerCliMode`. No existing native class gains a music-specific branch except the audio engine and the gesture controller.

## 5. Document model

**MD1.** Every new field is optional and enters the protocol schema before any client writes it (MF10). Existing documents open unchanged and need no migration step (PS-2).

**MD2.** The key is stored on the tempo object, because the model takes tempo, signature and key together and MT-1 lists them together.

**MD3.** A `music` object on the sequence marks a music project. Reopening such a sequence restores the music layout. The object also holds the prompt history (TK-6), capped at 50 entries.

**MD4.** A track carries `musicRole`, one of the twelve ACE-Step track names (UI-3). The role names the stem for Add instrument and is the default label of a new track.

**MD5.** A take carries `musicGeneration`, the generation record of TK-3. Fields that `ClipVersion` already has are reused: `provider`, `model` (the DiT), `prompt` (the caption), `requestId`, `batchId`, `variationIndex`, `parentTakeId`, `durationMs`, `label` and `createdAt`.

**MD6.** The tempo lock is derived, not stored (MT-7). The tempo edit is refused while the sequence holds an audio clip, with a message that names the reason. With no audio clip the edit works as it does today.

**MD7.** Tempo changes can arrive later as an optional `tempo.changes` array beside the constant fields (MT-8). Nothing is added for them now.

```ts
interface TimelineTempo {
  bpm: number;
  offsetMs: number;
  timeSignature: { beatsPerBar: number; beatUnit: number };
  key?: { tonic: "C" | "C#" | "Db" | /* ... */ "B"; mode: "major" | "minor" };   // new
}

interface TimelineSequence {
  music?: { promptHistory?: string[] };   // new
}

type MusicRole =
  | "vocals" | "backing_vocals" | "drums" | "bass" | "guitar" | "keyboard"
  | "percussion" | "strings" | "synth" | "fx" | "brass" | "woodwinds";

interface TimelineTrack {
  musicRole?: MusicRole;   // new
}

interface ClipVersion {
  musicGeneration?: MusicGenerationRecord;   // new
}

interface MusicGenerationRecord {
  task: "text2music" | "repaint" | "lego";
  backend: string;            // "acestep.cpp@07abf07"
  lmModel?: string;
  steps: number;
  instruction?: string;       // only for a backend that takes an instruction string
  trackRole?: MusicRole;
  bpm: number;
  key?: TimelineTempo["key"];
  beatsPerBar: number;
  beatUnit: number;
  seed: number;
  audioCodes?: string;        // language model output, lets a replay skip the language model (MF13)
  candidateIndex: number;
  segmentIndex: number;
  targetStartFrame: number;   // timeline position at 48 kHz
  targetEndFrame: number;
  contextAssetId?: string;
  contextStartFrame?: number; // timeline position at 48 kHz
  contextEndFrame?: number;
  requestFrames: number;      // length asked of the model
  splice?: {
    parentAssetId: string;
    startFrame: number;       // in the parent asset
    endFrame: number;
    crossfadeFrames: number;
  };
  alignment?: {
    offsetFrames: number;
    corrected: boolean;
    confidence: number;
    tempoRatio: number;       // measured tempo divided by project tempo
    lastBeatErrorMs: number;
  };
  gainDb?: number;
}
```

## 6. Musical time

**MD8.** Milliseconds stay the stored clock, and every position that music mode writes is a whole 48 kHz frame expressed in milliseconds. `barStartFrame(bar, tempo)` computes `round((offsetMs / 1000 + (bar - 1) * beatsPerBar * (4 / beatUnit) * 60 / bpm) * 48000)` from the bar number each time and never adds bar lengths (MT-4). A clip start is `frame / 48` ms, which a double holds exactly enough to return the same frame. The function lives in `packages/timeline/src/music/frames.ts` beside the existing `barStartMs` (`packages/timeline/src/midi/grid.ts:44-67`) and is ported to `src/music/MusicTime.cpp`.

**MD9.** A music project uses an integer tempo from 30 to 300 BPM and one of 2/4, 3/4, 4/4 or 6/8 (MF6). The New music project dialog and the tempo edit enforce it for sequences that carry the `music` object. A fractional tempo would be rounded for the model and would drift against the grid by about 57 ms over 10 seconds at 87.5 BPM. The editor counts BPM in quarter notes in every signature (`packages/timeline/src/midi/grid.ts:44-48`). MM0 checks which note value the model counts when the signature is 6.

## 7. Track range selection

**MD10.** The selection is view state in `MusicSelection`, a GUI-thread `QObject` owned by the editor window. It holds one track id and a start and end frame, or nothing. It is not saved with the document and it is not an undo step, the same as the sequence In and Out range in `TimelineViewState`.

**MD11.** A Range tool creates the selection. `ClipGestureController` already has an `activeTool` property (`src/edit/ClipGestureController.h:68`). With the Range tool active, a drag on a lane selects a range on that track, over clips or over empty space, and a double-click on a clip selects the clip's span. The Selection tool keeps today's behaviour, including the rubber band. The music layout makes the Range tool the default.

Range edges snap to the ruler's grid division, bar by default and beat when the division is finer (MT-3). Holding Alt places an edge freely, as it does for clip gestures today. The range draws as a band on its lane with the bar numbers at both edges. A second control turns the range into the loop region (section 14.2).

## 8. Planner

**MD12.** The planner is one pure function from the tempo, the selection and the audio clips to a plan. The TypeScript in `packages/timeline/src/music/plan.ts` is the reference, `src/music/MusicPlan.cpp` is the port, and an oracle test compares them on generated cases, as the targeting and take modules do today. The panel calls it on every selection change to show the inferred operation. The job module calls it once at submission.

### Operation inference (GN-4)

| Selection on the target track | Other tracks in the range | Operation |
|---|---|---|
| Inside one clip | Any | Regenerate |
| No clip overlaps the range | At least one audible audio clip | Add instrument |
| No clip overlaps the range | None | Generate |
| Overlaps a clip partly, or spans several clips | Any | None. The panel asks for a range inside one clip or an empty range |

"Audible" follows the mixer: unmuted, and soloed when any track is soloed. The panel preselects the inferred operation and lets the person choose another one that is valid. Regenerate needs a clip. Add instrument needs audible audio on another track and a role on the target track.

Regenerate is refused for a clip that plays at a speed other than 1 or has a time remap, with a message that names the reason.

### Windows

All values are frames at 48 kHz. `L` is the target length.

**Generate (GN-6).** There is no context. The request length is `k * L + one beat`, where `k` is the smallest whole number with `k * L` of at least 10 seconds. The extra beat leaves room for the alignment shift of section 11. The plan lists `k` segments of length `L`. Each segment of each candidate becomes a take, so a 2-bar target at 120 BPM with two candidates returns six takes.

**Regenerate and Add instrument (GN-5).**

1. The window starts on the bar line at or before the target start.
2. It moves back by up to two bars while the context has audio there. For Regenerate the context is the target track. For Add instrument it is every other audible track.
3. It ends on the bar line at or after the target end.
4. It grows to the right in whole bars until it is at least 10 seconds long.

The region is the target range inside the window. A request or a window longer than 600 seconds is refused, because `ace-server` caps latents at 15000 frames (`ARCHITECTURE.md:955-958`).

## 9. Operations

**MD13.** Context audio is rendered by the native mixer and uploaded as an asset. The native mixer is the only one held to playback by tests, the server's stored document can lag behind the editor by the autosave delay, and the generation record needs an asset id for the context anyway (TK-3).

**MD14.** Every take of a clip has the same length and the same placement against the clip (MF3). A generated clip uses `inPointMs: 0` and `outPointMs` equal to its duration, and each take asset holds exactly the target range. A repaint take is a copy of its parent asset with the window replaced. Switching takes then needs no source mapping and stays correct after trims and splits.

**MD15.** Results become takes at once, and the first candidate becomes the active take in the same undo step. The video flow holds candidates outside the document until one is accepted. GN-1 asks for takes directly, and auditioning in the loop needs them on the clip.

**MD16.** A job captures its context when it is submitted. A job that is queued behind another does not hear that job's result.

### 9.1 Generate

1. The panel submits the plan, the prompt, the candidate count and the seed.
2. `music.insertPlaceholder` adds a clip with `status: "queued"` in the target range, `audioRole: "music"`, and 5 ms fades at both edges (GN-7, AL-3). This is one undo step.
3. The job module sends the request (section 10).
4. The server runs the two backend jobs, measures the grid offset, applies one gain per candidate, cuts the segments, stores the take assets and answers (section 11).
5. `music.applyResult` writes the takes into the clip, sets the first as active and sets `status: "generated"`. This is one undo step.

If the placeholder was deleted or undone before the result arrives, the job keeps its takes in its record and the job list offers to place them.

### 9.2 Regenerate

1. The app renders a dry bounce of the target track over the context window (section 14.3) and uploads it.
2. The job module sends the request with the context asset, the region inside the window, the clip's active take asset as splice parent, and the window's position inside that asset. The position is `inPointMs` plus the distance from the clip start, in frames.
3. The server sends the context and the region to the backend, takes the region from each candidate, and splices it into a copy of the parent asset with 20 ms equal-power crossfades that lie inside the window (GN-2).
4. `music.applyResult` records the original asset as a baseline take when the clip has none, appends the new takes, and activates the first. The clip's position, source window, gain and fades do not change.

While the job runs, the clip shows a hatched band over the window. The band is job state and is not written to the document.

### 9.3 Add instrument

1. The app renders a mix bounce of every other audible track over the context window and uploads it.
2. `music.insertPlaceholder` adds the clip on the target track.
3. The job module sends the request with the context asset, the region, and the target track's role.
4. The server sends a `lego` request with the role as `track`, cuts the region from each candidate, and stores the take assets with no gain change.
5. `music.applyResult` writes the takes.

## 10. Server contract

**MD17.** Music requests extend `generate_media` with a `music` object under `mode: "music"`. The request keeps the existing request id, cancel command, generation row and `lookup_generations` recovery. A `mode: "music"` request without the object runs today's text-to-music path, so other providers and the web editor are unaffected.

| Field in `music` | Type | Used by |
|---|---|---|
| `task` | `"text2music" \| "repaint" \| "lego"` | All |
| `bpm`, `key`, `beats_per_bar`, `beat_unit` | Numbers, and `{ tonic, mode }` | All |
| `candidates` | 1 to 4 | All |
| `seed`, `steps` | Optional numbers | All |
| `request_frames` | Window length | All |
| `beat_phase_frames` | Position of the first beat inside the window | Generate |
| `segments` | `{ start_frame, end_frame }[]` inside the window | Generate |
| `align` | Boolean | Generate |
| `context_asset_id` | Asset id of the bounce | Regenerate, Add instrument |
| `region` | `{ start_frame, end_frame }` inside the window | Regenerate, Add instrument |
| `splice` | `{ parent_asset_id, start_frame, end_frame }` in the parent asset | Regenerate |
| `track_role` | `MusicRole` | Add instrument |

The response adds two fields to `{ asset_ids }`:

```ts
interface MusicGenerationResponse {
  asset_ids: string[];                 // candidate by candidate, segment by segment
  music_takes: Array<{
    asset_id: string;
    candidate: number;
    segment: number;
    record: MusicGenerationRecord;     // the server fills seed, audio codes, alignment, gain, backend
  }>;
  timing: { queue_ms: number; lm_ms: number; synth_ms: number };
}
```

`music_takes` and `timing` are also stored in the generation row's parameters, the way `media_edit_references` is today, so `lookup_generations` returns them after a reconnect.

The handler validates the object with a Zod schema in `packages/protocol/src/ws-commands.ts`: the region and the segments lie inside the window, the window is between 10 and 600 seconds, and the splice span equals the region length. It does not recompute the plan.

## 11. Result processing on the server

`music-generation.ts` decodes each candidate to 48 kHz stereo float with `@nodetool-ai/runtime/media` and calls pure functions in `packages/timeline/src/music/`. No step resamples audio that is already at 48 kHz (AL-1).

**Alignment (AL-2).** Only Generate is corrected. Repaint and lego output is anchored by the source latents outside the region. `align.ts` builds an onset-strength envelope with the existing detector (`packages/timeline/src/audioOnsets.ts:153`) and correlates it with a pulse train at the project's beat period, shifted by `beat_phase_frames`, over lags within half a beat in both directions. The lag with the highest correlation is the offset. Its confidence is the peak divided by the mean correlation. An offset is applied only above a confidence threshold that MM3 sets from fixtures. A positive offset moves every cut later by that many frames. A negative offset pads the head with digital silence. An uncorrected take is marked in its record.

**Tempo deviation (AL-4).** The same correlation runs at beat periods from 97% to 103% of the project tempo. The best period gives `tempoRatio`. `lastBeatErrorMs` is the deviation times the take length. All three operations are measured. A take with more than 20 ms of error is badged as drifting and is not corrected.

**Gain.** A Generate candidate gets one gain that puts its sample peak at -3 dBFS, applied to the whole window before cutting, so the segments of one candidate keep their relative level. Repaint and lego results keep the backend's level, because they must match their context (MF4).

**Cut (AL-3).** Segments and regions are cut at whole frames. The 5 ms edge fades are the clip's own `fadeInMs` and `fadeOutMs`, so they stay editable and the asset stays untouched.

**Splice (GN-2).** `splice.ts` copies the parent's PCM, replaces `[start_frame, end_frame)` with the generated region, and crossfades over the first and last 960 frames of the window with gains whose squares sum to 1. Samples outside the window are copied without arithmetic. A parent that is not 48 kHz stereo is decoded and resampled once, and the record says so.

**Storage.** Take assets and context assets are 48 kHz stereo 32-bit float WAV. Float holds the backend's output without clipping or requantising. The cost is 23 MB per minute per take (MR8).

## 12. Backend

### 12.1 Interface (BE-2, BE-4)

A new provider capability `music_task` sits beside `text_to_music` in `packages/runtime/src/providers/base-provider.ts`.

```ts
interface MusicTaskParams {
  task: "text2music" | "repaint" | "lego" | "extract" | "cover" | "complete";
  model: string;              // DiT
  lmModel?: string;
  caption: string;
  lyrics?: string;            // default "[Instrumental]"
  instruction?: string;       // for a backend that takes an instruction string
  trackRole?: MusicRole;
  sourceAudio?: Uint8Array;   // WAV, 48 kHz stereo
  regionStartSec?: number;
  regionEndSec?: number;
  bpm: number;
  key?: string;               // "A minor"
  timeSignature: number;      // beats per bar
  durationSec: number;
  seed?: number;
  audioCodes?: string;        // replay without the language model
  candidates: number;
  steps?: number;
  signal?: AbortSignal;
}

interface MusicTaskResult {
  candidates: Array<{ audio: Uint8Array; seed: number; audioCodes?: string }>;
  backend: string;
  timing: { queueMs: number; lmMs: number; synthMs: number };
}
```

The interface carries both the track role and an instruction string. `ace-server` builds its instruction from `task_type` and `track`. The upstream Python API takes the string. Each adapter uses the one it needs.

### 12.2 acestep provider

| Interface | `AceRequest` | Note |
|---|---|---|
| `task` | `task_type` | Same names |
| `caption`, `lyrics` | `caption`, `lyrics` | |
| `trackRole` | `track` | Lego |
| `sourceAudio` | Multipart part `audio` | |
| `regionStartSec`, `regionEndSec` | `repainting_start`, `repainting_end` | Repaint and lego |
| `bpm` | `bpm` | Integer |
| `key` | `keyscale` | |
| `timeSignature` | `timesignature` | Numerator as a string |
| `durationSec` | `duration` | Text-to-music. Source tasks take the source length |
| `seed` | `seed` | |
| `audioCodes` | `audio_codes` | When set, `/lm` is skipped |
| `candidates` | `lm_batch_size` for text-to-music and lego, `synth_batch_size` for repaint | MQ3 |
| `steps` | `inference_steps` | 0 keeps the model default |
| `model`, `lmModel` | `synth_model`, `lm_model` | |
| Always | `output_format: "wav32"` | MF4 |

Text-to-music and lego run `POST /lm` and then `POST /synth` with the returned request (MF13). Repaint runs `/synth` only. With tempo, key, signature, duration and `[Instrumental]` all supplied, the language model skips its metadata pass (`ARCHITECTURE.md:292-299`). A project without a key leaves `keyscale` empty, and the language model then picks a key for each request, so takes can differ in key.

Model routing follows BE-3: the turbo DiT for Generate and Regenerate, the base DiT for Add instrument. Both are named per request, and `ace-server` swaps them (`ARCHITECTURE.md:108-130`). The provider adds `--keep-loaded` when a setting allows it. The default leaves it off, so one module is resident at a time.

### 12.3 Supervision (BE-5, JB-3)

`acestep-server.ts` follows `packages/runtime/src/providers/sdcpp-server.ts`: one child process, a free port on `127.0.0.1`, a readiness wait on `GET /health`, the last 30 log lines kept for error messages, and an exit after 10 idle minutes. Two things differ. The process is not restarted to change models, because models are a request field. And the provider does not restart or lock the process around a call, because `ace-server` runs one job at a time from its own FIFO queue (`ARCHITECTURE.md:991-996`). The provider still sends its own requests one at a time: Generate and Add instrument are two backend jobs each, `/lm` then `/synth`, and a second request sent at once would have its `/lm` run between the first request's two jobs. The provider reports a job as `queued` while an earlier job of its own is not finished, since the documented `GET /job` statuses have no queued state (`ARCHITECTURE.md:931`).

The child runs at lowered priority through `os.setPriority`, so the editor's decode worker keeps its share of the CPU during a generation (PF-3).

Cancel maps to `POST /job?id=N&cancel=1`. The worker checks the flag between steps.

If the process exits during a job, or `GET /job` no longer knows the id, the provider starts the process again and resubmits that job once. A second failure ends the request with the log tail as the error.

### 12.4 Install and models

`AceStepRuntimePackage` follows `SdCppRuntimePackage`. It differs in the source of the binary: a NodeTool workflow builds `ace-server` at the pinned commit with Metal for macOS arm64, signs and notarises it, and attaches the archive to a NodeTool release (MF14). `packages/config/src/acestep-runtime.ts` pins the commit, the archive name and its SHA-256, and the installer checks the digest before unpacking.

Models come from `Serveurperso/ACE-Step-1.5-GGUF` through the existing Hugging Face downloader, with progress in the music panel. The first-run set is the text encoder, the language model, the turbo DiT and the VAE, about 7.7 GB at Q8 with the 4B language model (`ARCHITECTURE.md:61-82`). The base DiT downloads on the first Add instrument. MM0 picks the language model size (MQ6).

A provider setting takes the URL of a remote `ace-server` in place of the local one (BE-7), the way the Wan2GP provider takes a server URL. The new fetch sites get a row in the [URL egress inventory](../../../docs/url-egress-inventory.md).

### 12.5 Access (BE-6)

The local `ace-server` listens on `127.0.0.1` on a port chosen at launch. It has no authentication, so the per-launch token of BE-6 is not met (MR5, MQ2).

## 13. Jobs

**MD18.** `MusicJobs` is a new GUI-thread `QObject` in `src/music/`. It is separate from `GenerationController`, which holds one job and a video-centred state machine (MF2). It owns its own `GenerationTransport`, so it has its own socket and the two controllers never route each other's replies.

Each job has a record file, written before the request is sent, at `<timelineId>.music-job-<requestId>.json` in the sequence's backup folder. The name does not match the `.ai-generation-` pattern that the existing controller scans. The record holds the full request, the plan, the clip and track ids, the context asset id, the state, the resubmit count, and the takes of a finished job that are not yet placed (JB-2).

| State | Meaning |
|---|---|
| `rendering` | The context bounce is rendering or uploading |
| `queued` | Sent. An earlier job is running on the backend |
| `running` | The backend is working |
| `placing` | The result is being written to the clip |
| `done`, `failed`, `cancelled` | Final |

The module polls `lookup_generations` for all active request ids in one call every 3 seconds, the interval the existing controller uses for its one job. At most eight jobs are active per timeline.

**Resubmit (JB-2).** Two layers cover the two failures. A backend crash is handled inside the provider (section 12.3) and the client sees nothing. A server restart leaves the row `interrupted` (MF11). The acestep provider stays outside the durable queue lifecycle, because an `ace-server` job does not outlive its process, so its rows are among those the sweep closes. `MusicJobs` then sends the stored request again under a new request id and raises the resubmit count to 1. A second interruption fails the job. The rule applies only to the `acestep` provider, where a repeated request costs time and no money. The paid-provider rule that never resubmits stays as it is.

**Cancel (JB-4).** Cancel sends `cancel_generation` with the request id. The server aborts the provider call, which cancels the backend job. The placeholder is removed in one undo step.

**Expected duration (JB-4).** `ace-server` reports no progress. The response's `timing` gives the run time, and the app keeps a moving average of run seconds per generated second for each task and model in its settings. A job row shows elapsed time against that estimate, and elapsed time alone until one job of that kind has finished.

**Errors (JB-5).** A failed job shows the backend's `{"error": ...}` text or the log tail, and a Retry action that sends the stored request under a new id.

## 14. Audio engine

### 14.1 Engine rate

A music project starts the system backend with `Options::sampleRate = 48000` in place of the device rate (MF8). miniaudio converts for a device that runs at another rate. The mix then happens at 48 kHz, 48 kHz takes pass through without resampling, and playback, bounce and export use the same sample values up to the device conversion. Projects without the `music` object keep the device rate.

### 14.2 Gapless loop (MT-6)

**MD19.** The device callback crosses the loop wrap itself, from one primed session to another, with no seek.

1. `TransportCommand` gains `loopStartMs` and `loopEndMs`. `PlaybackClock` sets them when the loop is on, the rate is 1 and the audio device is the clock.
2. While a looping session plays, the decode worker builds a second session that starts at the loop start, fills it to the prime amount, and publishes it in a second atomic slot.
3. When a block reaches the loop end, the callback mixes the frames before the wrap from the current session and the frames after it from the wrap session, with two `mixBlock` calls. It writes a new anchor for the wrap frame, as it already writes anchors for commands, so the playhead wraps when the wrapped audio is heard.
4. For the first 3 ms after the wrap, the callback also mixes the outgoing session past the loop end into a fixed scratch buffer and crossfades it out. Audio that crosses the loop end then wraps without a click.
5. The worker makes the wrap session current and prepares the next one.

`PlaybackClock` stops issuing its own seek at the range end while the engine loops. If the wrap session is not primed in time, the callback counts a `loopMisses` stat and the clock falls back to today's seek. An edit during a loop rebuilds the wrap session as it rebuilds the current one. Shuttle rates and reverse play keep today's seek.

`mixBlock`, `PcmRing` and the offline render do not change, so the oracle tests that hold the mixer to the web's rules stay valid. The loop length is a whole number of frames by MD8.

Ownership and threads, as [`/native/AGENTS.md`](../../AGENTS.md) rule 16 asks: the wrap session is a `std::unique_ptr<Session>` in the worker's session list, like every session. The callback reads it through a second hazard slot beside `inUse`, and the worker frees a session only when neither slot names it. The scratch buffer is a fixed array inside `AudioEngine::Impl`, sized at `start()`, and only the callback touches it. No new lock, allocation or decode enters the callback.

### 14.3 Context bounce (AU-4)

`MusicBounce` builds a changed copy of the timeline snapshot and calls `renderOffline(copy, 48000, startMs, durationMs, report, cancelled)` on a worker thread that it owns and joins in its destructor.

- The **mix bounce** for Add instrument mutes the target track and changes nothing else. Mute, solo, gain, pan, fades, effects and automation apply as in playback.
- The **dry bounce** for Regenerate keeps only the target track and sets clip gain and track gain to 0 dB, pan to centre, and removes fades, effects and automation. The generated region then has the level of the asset it is spliced into, whatever the fader says.

The result is written as 32-bit float WAV by a new writer beside `writeStereoWav` in `src/assets/AssetWav.*` and uploaded with `nt::assets::importFile`. The upload marks the asset as generation context so the asset browser can leave it out (MR10).

### 14.4 Take audition (TK-2)

Switching a take is an edit, and edits already reach the engine without a transport seek (`src/playback/tst_liveaudioedit.cpp`). With the loop of 14.2 a person can loop the range and step through takes. MM4 measures the time from the switch to the first frame of the new take.

## 15. User interface

**Entry (UI-1, UI-5).** The timeline list and the File menu get New music project. It asks for tempo, signature and key, and creates a sequence with the `music` object and four audio tracks with the roles drums, bass, keyboard and guitar. A `--music` launch flag opens the app on that dialog.

**Layout (UI-4).** A Music preset in `qml/dock/DockLayout.js` shows the tracks, the music panel on the right and the mixer below. The ruler is in bars mode and the Range tool is active. The program monitor is hidden while the sequence has no video track and shown when it has one. Video behaviour does not change.

**Music panel (UI-2).** `qml/music/MusicPanel.qml` registers in the right slot. From top to bottom it shows:

1. The target: track name, role picker, bar range and length.
2. The operation: three choices with the inferred one selected, and one line that says why.
3. The prompt, with the project's prompt history.
4. Candidates (2 by default), seed (random or fixed), and the model for the operation.
5. The Generate button.
6. The job list: state, elapsed against expected, Cancel, Retry, error text.
7. The take list of the clip under the range: label, seed, offset in milliseconds, a drifting badge, and Delete. Clicking a take makes it active.

On first use the panel shows the install state of the backend and the models in place of the Generate button.

**Tracks.** A track header shows its role as a chip. A placeholder clip shows its job state. A clip with more than one take shows the existing take badge.

**Assistant (GN-8).** Three `ui_timeline_music_*` commands call the same submission as the panel. `music.applyResult` and `music.insertPlaceholder` are denied to the assistant in `src/aiassist/AssistantCommandTable.cpp`, as `ai.insertGeneration` is.

## 16. Tests and checks

| What | How |
|---|---|
| Schema round trip | A protocol compatibility test parses a music document through the schema and compares the new fields, following `packages/timeline/tests/nativeFields.protocolCompat.test.ts`. A native save test asserts an empty stripped-fields report |
| Frame math and planner | Vitest for the TypeScript. A conformance suite in `scripts/conformance/suites/` compares the C++ port on seeded cases |
| Alignment, cut, splice | Vitest on synthetic click tracks and noise with known offsets and tempi |
| Provider | Vitest against a fake `ace-server` on a local port: golden `AceRequest` bodies, multipart source, cancel, crash and resubmit |
| Server handler | A scripted provider through the provider resolver, asserting the stored assets and the response |
| Loop and engine rate | Qt tests on the fake device and the null backend, with the counters in `AudioEngine::Stats` |
| Bounce | A `--music-bounce` CLI mode writes a window to WAV, compared with a null-device recording |
| Jobs | `tst_musicjobs` against a scripted server: queue order, recovery on reopen, resubmit once, cancel |
| UI | Qt Quick tests with synthetic drags for the range, and for the panel states |
| Sanitizers | ASan, UBSan and TSan builds of the loop, transport and live-edit tests |
| Real backend | Hand-run on the reference Mac in MM0, MM3, MM5 and MM6. A provider probe in `npm run probe:providers` runs where the binary is installed |

Each new check is shown to fail on a deliberately wrong input before it is trusted, as the repository rules require. Native changes run `npm run test:affected:native`. Server changes run the four checks in [`/AGENTS.md`](../../../AGENTS.md#mandatory-post-change-verification).

## 17. Implementation plan

The reference machine is the one in [PLAN.md](PLAN.md): an Apple M1 Pro or later with a release build.

### Order and parallel work

| Milestone | Starts after | Needs for its exit |
|---|---|---|
| MM0 Backend spike | Nothing | Nothing |
| MM1 Document and musical time | Nothing | Nothing |
| MM2 Music project, range, panel | MM1 | Nothing |
| MM3 Generate end to end | MM1 | MM0 results, MM2 for the UI part |
| MM4 Engine rate and loop | Nothing | MM2 for the loop control |
| MM5 Regenerate and Add instrument | MM3 | MM0 lego result, MM4 for the bounce comparison |
| MM6 Packaging and durability | MM3 | Nothing |
| MM7 Finish | MM5, MM6 | Nothing |

MM0, MM1 and MM4 can start on the first day. The server and native halves of MM3, MM5 and MM6 can be built by different people against the contract in section 10.

### MM0: Backend spike (3 days)

- **Scope.** This milestone builds `ace-server` at the pinned commit with Metal and answers the questions the design depends on.
- **Exit.** A results file reports these measurements from the reference Mac:
  1. The run time of a 16-second text-to-music job with two candidates on the turbo DiT, of a 4-second repaint in a 16-second source, and of a 16-second lego on the base DiT.
  2. The time to swap between the turbo and the base DiT, and the peak memory of each job.
  3. The measured tempo of ten outputs each at 90, 120 and 150 BPM against the requested tempo, and the note value the model counts in signature 6.
  4. The level difference in dB between a `wav32` repaint and its source outside the region.
  5. The correlation between a lego output and its source, which tells a stem from a mix.
  6. Whether `lm_batch_size` or `synth_batch_size` gives the more useful candidates (MQ3).
  7. Whether `--models` accepts a Hugging Face snapshot directory.
- **Check.** A script in `scripts/` runs the requests and prints the table.
- **Risk.** Lego may return the mix (MR1). The spike then tests an `extract` pass on the lego output.

### MM1: Document and musical time (4 days)

- **Scope.** This milestone adds the fields of section 5, `barStartFrame`, the planner in TypeScript and C++, and the tempo rules MD6 and MD9.
- **Files.** `packages/protocol/src/api-schemas/timeline.ts`, `packages/timeline/src/types.ts`, `packages/timeline/src/music/{frames,plan,roles}.ts`, `src/music/{MusicTime,MusicPlan}.*`, `src/music/module.cmake`, `src/ui/Tempo/TempoJson.*`, `src/server/TimelineList/ProjectSettingsEdit.cpp`, `scripts/conformance/suites/music.mjs`.
- **Exit.**
  1. A document with every new field saves through `timeline.update` and reads back with those fields equal. The native stripped-fields report is empty.
  2. `barStartFrame` in C++ equals the TypeScript value for bars 1 to 10000 at 87, 120 and 173 BPM in 3/4, 4/4 and 6/8, with a frame error of 0.
  3. The planner port equals the reference on 200 seeded cases, and on the four rows of the inference table.
  4. The tempo edit is refused on a sequence with an audio clip and accepted on one without.
- **Check.** Vitest in `packages/timeline`, `tst_musicplan` and the conformance suite cover the four items.
- **Risk.** The schema is shared with the web editor. The fields are optional, and the web type check runs in the same change.

### MM2: Music project, range selection, panel (1 week)

- **Scope.** This milestone adds New music project, the Music preset, the Range tool and its overlay, the role chip, and the panel with target, operation and prompt. The Generate button is present and disabled.
- **Files.** `src/music/{MusicSelection,MusicProject}.*`, `qml/music/{MusicPanel,MusicRangeOverlay}.qml`, `src/edit/ClipGestureController.*`, `src/edit/KeymapData.h`, `qml/dock/DockLayout.js`, `qml/Tracks/TrackHeader.qml`, `src/server/TimelineList/TimelineListController.cpp`.
- **Exit.**
  1. New music project produces a sequence with the `music` object, the chosen tempo and key, four audio tracks with roles, bars ruler and the Music layout.
  2. A range drag ends on frames equal to `barStartFrame` values. With Alt held it ends on the pointer's frame.
  3. The panel shows the inferred operation for 12 fixture selections, equal to the planner's answer.
  4. With the Selection tool, the rubber band and every clip gesture test pass unchanged.
  5. A sequence with a video track shows the monitor in the Music layout.
- **Check.** Qt Quick tests drive the range and the panel with synthetic pointer events.
- **Risk.** The Range tool may collide with an existing shortcut or gesture. The keymap test lists conflicts.

### MM3: Generate end to end (2 weeks)

- **Scope.** This milestone adds the `music_task` capability, the acestep provider with a supervised `ace-server` installed by hand, the `music` request object, alignment, gain and cut, `MusicJobs`, the placeholder, and the take list.
- **Files.** `packages/runtime/src/providers/{types,base-provider,index,acestep-provider,acestep-server,acestep-models}.ts`, `packages/protocol/src/ws-commands.ts`, `packages/websocket/src/session/{commands,inference,music-generation}.ts`, `packages/timeline/src/music/{align,gain,cut}.ts`, `/docs/url-egress-inventory.md`, `src/music/{MusicJobs,MusicEdits}.*`, `qml/music/{MusicJobList,MusicTakeList}.qml`.
- **Exit.**
  1. On the reference Mac, bars 5 to 12 at 120 BPM with a prompt and two candidates give a clip that starts on `barStartFrame(5)`, is 768000 frames long, and has two takes with records.
  2. A 2-bar target at 120 BPM gives three takes per candidate of 192000 frames each (GN-6).
  3. On synthetic click tracks with offsets from -200 to +200 ms, the measured offset is within 2 ms and the cut starts on the measured frame.
  4. The provider sends the golden `AceRequest` for each task, with `output_format: "wav32"`.
  5. The placeholder appears in the same event-loop turn as the submission. With eight tracks playing on the null backend during a job, `underruns` is 0 (JB-1, AU-3).
  6. A second job submitted during the first is `queued` and runs after it (JB-3).
  7. Undo after a result restores the placeholder state. Redo restores the takes. No asset is deleted (TK-5).
- **Check.** Vitest with the fake backend covers items 3 and 4, `tst_musicjobs` covers items 5 to 7, and a hand run covers items 1 and 2.
- **Risk.** The alignment confidence may be too low on material without clear onsets (MR9).

### MM4: Engine rate and gapless loop (1.5 weeks)

- **Scope.** This milestone implements sections 14.1, 14.2 and 14.4 and the loop control on the range.
- **Files.** `src/audio/AudioEngine.*`, `src/audio/AppAudio.cpp`, `src/playback/{AudioClockFeed.h,PlaybackClock.*}`, `src/playback/tst_looptransport.cpp`, `src/music/MusicLoop.cpp`.
- **Exit.**
  1. On the fake device at 48 kHz, 1000 wraps of a 0.5-second loop are exactly 24000 frames apart, and `waitBlocks`, `underruns` and `loopMisses` are 0.
  2. A sine with a whole number of periods in the loop shows no sample step at a wrap larger than the sine's own largest step plus 1e-4.
  3. On the null backend in real time, 60 seconds of a 2-second loop over eight clips keep the same three counters at 0.
  4. The playhead wraps within one display frame of the audible wrap.
  5. A take switch during the loop is audible with no `waitBlocks`.
  6. A null-device recording at 48 kHz equals `renderOffline` of the same range within 1e-6 per sample (AU-4).
  7. On the reference Mac with the real device, eight stereo tracks play for 10 minutes under scripted zoom and scroll with 0 underruns (PF-1).
  8. The loop, transport and live-edit tests pass under ASan, UBSan and TSan.
  9. The existing `--av-sync` check passes with the 48 kHz option (AU-5).
- **Check.** `tst_looptransport` and the sanitizer builds cover items 1 to 6, 8 and 9. Item 7 is a recorded run.
- **Risk.** The second hazard slot can introduce a race on the real-time thread (MR6).

### MM5: Regenerate and Add instrument (2 weeks)

- **Scope.** This milestone adds the two bounces, the float WAV writer, the splice, the repaint and lego paths in the provider and the handler, the base DiT, and the offset and drift display.
- **Files.** `src/music/MusicBounce.*`, `src/assets/AssetWav.*`, `packages/timeline/src/music/splice.ts`, the MM3 files for the two new tasks.
- **Exit.**
  1. The splice test shows every sample outside the window equal to the parent's, two crossfades of 960 frames, and gains whose squares sum to 1 within 1e-6.
  2. On the reference Mac, a repaint of bars 3 and 4 of an 8-bar clip gives a take asset with the parent's frame count and equal hashes for the audio before and after the window. The clip's position, source window and length are unchanged, and the original is a take.
  3. The dry bounce of a 48 kHz clip at unity equals the asset's PCM within 1e-6 over the window.
  4. The mix bounce equals a null-device recording of the same range with the target track muted, within 1e-6.
  5. With drums and keys audible, Add instrument on a bass track for bars 1 to 8 sends `task_type: "lego"`, `track: "bass"` and the base model, and gives a clip on that track in exactly that range.
  6. After a head trim of one bar, switching between the original and the repainted take keeps the audio outside the window in place, measured as a correlation peak at lag 0.
  7. A fixture that runs 1% fast over 16 seconds is badged as drifting. A fixture that runs 0.1% fast is not.
- **Check.** Vitest covers items 1 and 7, `--music-bounce` covers items 3 and 4, and a hand run covers items 2, 5 and 6.
- **Risk.** Lego may return the mix (MR1), and the swap between models may be slow (MR4).

### MM6: Packaging and durability (2 weeks)

- **Scope.** This milestone adds the backend build, the runtime package, model download, the remote URL setting, idle exit, both resubmit layers, cancel, retry, and expected duration.
- **Files.** `/.github/workflows/acestep-build.yml`, `packages/config/src/acestep-runtime.ts`, `packages/runtime-install/src/packages/{AceStepRuntimePackage,registry,definitions}.ts`, `qml/music/MusicSetup.qml`, the provider and `MusicJobs`.
- **Exit.**
  1. On a fresh macOS account, New music project, Install, model download with progress and a first Generate succeed with no terminal (BE-5).
  2. Killing `ace-server` during a job leads to one automatic resubmit and a finished job. Killing it a second time fails the job with the error shown and Retry offered.
  3. Quitting the app during a job and reopening leads to one resubmit and one set of takes.
  4. Cancel on a running job ends the backend job within 5 seconds and removes the placeholder.
  5. A connection to the backend port from a non-loopback address is refused.
  6. After 10 idle minutes the process is gone, and the next job starts it.
  7. With eight tracks looping on the real device and two jobs running back to back, `underruns` is 0 (PF-3).
  8. An archive with a wrong digest is refused.
- **Check.** Provider tests with the fake backend cover items 2, 4 and 6. Hand runs cover the rest.
- **Risk.** Notarising a Metal binary built from a GGML fork may need entitlements we have not used before, and upstream changes arrive without tags (MR3).

### MM7: Finish (1 week)

- **Scope.** This milestone adds:
  1. Regenerate from a record with the same or a new seed (TK-4).
  2. A clean-up command that lists inactive takes with their size and deletes them after confirmation (TK-5).
  3. The prompt history (TK-6).
  4. The three assistant commands (GN-8).
  5. Peaks at more than one resolution for takes longer than a minute (AU-7).
  6. A 24-bit WAV export preset (AU-8).
  7. The interchange check (PS-3).
  8. Rows in `docs/AI-WORKFLOWS.md` and `/docs/harnesses.md`.
- **Exit.**
  1. A replay with stored audio codes and seed gives a take whose correlation with the original is at least 0.99.
  2. The UI bench with 32 audio tracks and 500 clips stays inside the frame budget of the existing bench (PF-2).
  3. A Premiere export of a music project with takes imports again with the active takes in place.
- **Check.** A hand run on the reference Mac covers item 1, and a Vitest case asserts that the replay request carries the stored codes and seed. `--ui-bench` with an audio fixture covers item 2, and an interchange round trip covers item 3.
- **Risk.** Replay is not exact across hardware or builds. The exit asks for correlation, not equal samples.

### Estimate

| Milestone | Weeks |
|---|---|
| MM0 | 0.6 |
| MM1 | 0.8 |
| MM2 | 1 |
| MM3 | 2 |
| MM4 | 1.5 |
| MM5 | 2 |
| MM6 | 2 |
| MM7 | 1 |
| Total | About 11 |

Two people finish in about 7 weeks, because MM4 runs beside MM3 and the server and native halves split at the contract.

## 18. Risks

MR1. **Lego may return the full mix.** The clip would then double the backing. MM0 measures it. The fallback is an `extract` pass on the lego output with the same track name, which costs a second DiT run. If neither gives a usable stem, Add instrument moves out of the first release and MM5 shrinks by about a week.

MR2. **The model may not hold the requested tempo.** There is no time-stretch, so a drifting take can only be badged. MM0 measures adherence at three tempi. If most takes drift by more than 20 ms over 16 seconds, the feature needs time-stretch or shorter windows before it ships.

MR3. **We own the backend build.** Upstream has no tags, a patched GGML fork and an API that can change between commits. The commit is pinned, the golden request tests catch a changed field, and an update is a deliberate change with a new MM0 run.

MR4. **Memory and swap time.** In the default mode one module is resident at a time, so every job reloads the DiT, and a change between Generate and Add instrument swaps several gigabytes. MM0 measures both on the reference Mac. `--keep-loaded` is the remedy where memory allows.

MR5. **The backend has no authentication.** Until upstream accepts a token flag, another local process, or a web page that finds the port, can queue jobs on it. By the request reference it cannot read files, because a request names models and adapters by registry entry and carries its own audio (`ARCHITECTURE.md:517-523`). The server source was not audited for this.

MR6. **The callback reads two sessions.** A mistake in the second hazard slot is a use-after-free on the real-time thread. The TSan and ASan builds of the loop tests gate MM4, and the fallback to today's seek stays in place.

MR7. **Generation speed on Apple Silicon is unknown.** The architecture does not depend on it. The default of two candidates does, and MM0 measures it.

MR8. **Storage grows quickly.** Float WAV costs 23 MB per minute per take, so a 4-minute piece with 8 tracks and 3 takes each is about 2.2 GB. The clean-up command is the first remedy. FLAC for take assets is the second and needs a check of every decoder on the path.

MR9. **Alignment can lock onto the wrong beat.** Pads and sparse material give a flat correlation. The confidence threshold leaves such takes uncorrected and marks them.

MR10. **Context bounces clutter the asset library.** Each Regenerate and Add instrument uploads one. They are marked on upload and hidden in the browser, and the clean-up command removes those that no take record names.

MR11. **Float WAV in other clients.** The web editor decodes take assets with the browser and the server computes peaks with libav. Both should read 32-bit float WAV. MM3 verifies both before the format is fixed.

## 19. Open questions

MQ1. Is acestep.cpp the only backend for the first release? This design assumes yes.

MQ2. Is loopback without a token acceptable for the first release (BE-6)? This design assumes yes, with a `--api-key` flag proposed upstream.

MQ3. Should candidates differ in composition (`lm_batch_size`) or only in rendering (`synth_batch_size`)? This design assumes composition for Generate and Add instrument. MM0 compares them.

MQ4. Should the first release take lyrics? This design assumes no. One text field and the `vocals` role would be the whole change.

MQ5. Is macOS on Apple Silicon the only target for local generation? This design assumes yes, with a remote URL for other machines.

MQ6. Which language model size ships by default, 4B at 4.2 GB or a smaller one? MM0 decides from quality and memory.

MQ7. Should a generated clip keep audio past its range as handles for a later trim? This design assumes no, because MD14 needs every take of a clip to have one layout.

## 20. Requirement coverage

| ID | Where | Milestone |
|---|---|---|
| MT-1 | MD2 | MM1 |
| MT-2 | Exists. Bars is the default in a music project | MM2 |
| MT-3 | Section 7 | MM2 |
| MT-4 | MD8 | MM1 |
| MT-5 | MD10, MD11 | MM2 |
| MT-6 | Section 14.2 | MM4 |
| MT-7 | MD6 | MM1 |
| MT-8 | MD7 | No work now |
| AU-1 | Exists | Measured in MM4 |
| AU-2 | Exists | None |
| AU-3 | Sections 12.3, 13 | MM3, MM6 |
| AU-4 | Sections 14.1, 14.3 | MM4, MM5 |
| AU-5 | Exists | Checked in MM4 |
| AU-6 | Exists | Checked in MM4 |
| AU-7 | Peaks at more than one resolution | MM7 |
| AU-8 | Exists at 16 bit. 24-bit preset | MM7 |
| TK-1 | Exists. MD14 keeps assets immutable | None |
| TK-2 | MD15, section 14.4 | MM3, MM4 |
| TK-3 | MD5 | MM1, MM3 |
| TK-4 | Replay from the record | MM7 |
| TK-5 | No edit deletes an asset. Clean-up command | MM3, MM7 |
| TK-6 | MD3 | MM7 |
| GN-1 | Section 9.1 | MM3 |
| GN-2 | Sections 9.2, 11 | MM5 |
| GN-3 | Section 9.3 | MM5 |
| GN-4 | Section 8 | MM1, MM2 |
| GN-5, GN-6 | Section 8 | MM1 |
| GN-7 | Sections 9.1, 9.2 | MM3, MM5 |
| GN-8 | Native assistant commands. Headless tools are out of scope | MM7 |
| GN-9 | Interface only | None |
| AL-1 | Section 11 | MM3 |
| AL-2 | Section 11 | MM3 |
| AL-3 | Section 11 | MM3 |
| AL-4 | Section 11 | MM3 measures, MM5 shows |
| AL-5 | MD5, section 15 | MM3, MM5 |
| JB-1 | Section 13 | MM3 |
| JB-2 | Section 13 | MM6 |
| JB-3 | Section 12.3 | MM3 |
| JB-4 | Section 13 | MM6 |
| JB-5 | Section 13 | MM3 shows the error, MM6 adds Retry |
| BE-1 | Section 12.2 | MM3 |
| BE-2 | Section 12.1 | MM3 |
| BE-3 | Section 12.2 | MM3 turbo, MM5 base |
| BE-4 | Interface only | None |
| BE-5 | Sections 12.3, 12.4 | MM6 |
| BE-6 | Loopback only. Token not met (MR5, MQ2) | MM6 |
| BE-7 | Section 12.4 | MM6 |
| UI-1 | Section 15 | MM2 |
| UI-2 | Section 15 | MM2, MM3, MM5 |
| UI-3 | MD4 | MM2 |
| UI-4 | Section 15 | MM2 |
| UI-5 | `--music` launch flag | MM2 |
| PS-1 | MD1 | MM1 |
| PS-2 | MD1 | MM1 |
| PS-3 | Interchange check | MM7 |
| PF-1 | MM4 exit 7 | MM4 |
| PF-2 | MM7 exit 2 | MM7 |
| PF-3 | MM6 exit 7 | MM6 |

## 21. Requirements

The IDs come from the product brief for music mode. P0 is needed for the three operations, P1 for a usable first release, and P2 is later. The brief also sets these limits: music mode is a distinct mode of the timeline with its own entry point, it is audio only, every generation result is a non-destructive take, and the backend sits behind an interface. MIDI and piano roll, virtual instruments, plug-in hosting, live recording, time-stretch, tempo changes within a project and clip launching are out of scope.

### Musical time

| ID | Requirement | Priority |
|---|---|---|
| MT-1 | A project stores tempo (BPM), time signature and an optional key | P0 |
| MT-2 | In music mode the timeline shows a bar and beat ruler and grid, alongside or in place of timecode | P0 |
| MT-3 | Moving, trimming and range selection snap to bars and beats, with a modifier for free placement | P0 |
| MT-4 | Bar-to-time conversion is computed from the tempo for each position, never by adding bar lengths, and resolves to a sample frame at 48 kHz | P0 |
| MT-5 | The user can select a bar range on one specific track. Track plus range is the generation target | P0 |
| MT-6 | A bar range can be looped during playback without a gap or click at the loop point | P1 |
| MT-7 | Tempo is locked, or changing it warns, once the project contains audio | P1 |
| MT-8 | The stored tempo representation can later hold tempo changes without a format break | P2 |

### Audio playback and mixing

| ID | Requirement | Priority |
|---|---|---|
| AU-1 | At least eight stereo audio tracks play together, with clip starts sample-accurate relative to each other | P0 |
| AU-2 | Each track has gain, mute and solo. Each clip has gain, fade in and fade out | P0 |
| AU-3 | Playback does not glitch while a generation runs, a result is imported, or the user scrolls and zooms | P0 |
| AU-4 | Any time range and any subset of tracks can be rendered offline to 48 kHz stereo WAV, and the result matches what playback produces | P0 |
| AU-5 | Audio and video on the same timeline stay in sync. Music mode does not change video behaviour | P0 |
| AU-6 | Edits are audible without stopping and restarting playback | P1 |
| AU-7 | Waveforms draw at every zoom level from cached peak data | P1 |
| AU-8 | The full mix exports as WAV | P1 |

### Clips and takes

| ID | Requirement | Priority |
|---|---|---|
| TK-1 | A clip references an immutable audio asset by offset and length. Trim and split never rewrite audio | P0 |
| TK-2 | A clip can hold several takes with one active. Switching takes is instant and undoable | P0 |
| TK-3 | Every generated take stores a generation record: task type, model, step count, prompt, instruction, BPM, key, time signature, seed, context audio and its timeline range, target range, alignment measurements, backend version | P0 |
| TK-4 | A take can be regenerated from its record, with the same or a new seed | P1 |
| TK-5 | Undo never deletes audio. Unused takes stay until the user runs an explicit clean-up | P1 |
| TK-6 | Prompts are kept in a per-project history | P1 |

### Generation operations

| ID | Requirement | Priority |
|---|---|---|
| GN-1 | Generate: `text2music` into the selected range, passing project BPM, key and time signature automatically, returning at least two candidates as takes | P0 |
| GN-2 | Regenerate: `repaint` the selected bars of a clip. The new take is built from the original audio outside the window and generated audio inside, joined by 20 ms equal-power crossfades, so audio outside the selection is bit-identical | P0 |
| GN-3 | Add instrument: `lego` with a bounce of all other audible tracks as source audio. The target track's role (drums, bass, synth and so on) sets the instruction | P0 |
| GN-4 | The operation is inferred from the selection and can be overridden. An empty range with no other audio gives Generate, an empty range with other tracks sounding gives Add instrument, and a range inside a clip gives Regenerate | P0 |
| GN-5 | The context window sent to the model starts on a bar line, includes up to two bars of pre-roll where audio exists, and is extended in whole bars to at least 10 seconds | P0 |
| GN-6 | For a target shorter than 10 seconds with no context, the request length is the smallest multiple of the target length that reaches 10 seconds. Surplus bars become additional takes | P0 |
| GN-7 | A pending job shows as a placeholder clip in its target range | P1 |
| GN-8 | The three operations are also callable from workflow nodes and the MCP server, so agents can arrange | P2 |
| GN-9 | The `extract`, `cover` and `complete` operations | P2 |

### Result import and alignment

| ID | Requirement | Priority |
|---|---|---|
| AL-1 | Results are decoded to 48 kHz stereo and stored without resampling when already at 48 kHz | P0 |
| AL-2 | The start offset of a result against the beat grid is measured (onset-strength envelope correlated with the grid, within half a beat either way) and corrected by shifting the read position | P0 |
| AL-3 | The target range is cut from the generated window and 5 ms fades are applied at clip edges | P0 |
| AL-4 | Tempo deviation is measured within 3% of project BPM either way. A take whose last beat would land more than about 20 ms off the grid is badged as drifting | P1 |
| AL-5 | Alignment measurements are stored in the generation record and visible in the take list | P1 |

### Jobs

| ID | Requirement | Priority |
|---|---|---|
| JB-1 | Generation is asynchronous. Neither the UI nor playback waits on it | P0 |
| JB-2 | Jobs are persisted with their full request and survive an app restart or a backend crash. An interrupted job is resubmitted once automatically | P0 |
| JB-3 | Local generations run one at a time from a queue | P0 |
| JB-4 | A job can be discarded. Its status shows elapsed time against an expected duration, since the ACE-Step API reports no progress | P1 |
| JB-5 | A failed job shows the backend error and can be retried | P1 |

### Generation backend

| ID | Requirement | Priority |
|---|---|---|
| BE-1 | ACE-Step 1.5 runs locally on Apple Silicon and is reachable through NodeTool's model or provider layer | P0 |
| BE-2 | The backend interface carries task type, source audio, repaint window in seconds, instruction, caption, BPM, key, time signature, duration, seed, candidate count, step count and model name | P0 |
| BE-3 | A turbo model (Generate, Regenerate) and a base model (Add instrument) are both available, swapped on demand if they do not fit in memory together | P0 |
| BE-4 | The backend is swappable between the upstream Python API server and acestep.cpp's `ace-server` without changes above the interface | P1 |
| BE-5 | The app installs, starts, health-checks and restarts the backend and reports model download. The user never opens a terminal | P1 |
| BE-6 | The backend listens on localhost only and requires a per-launch token | P1 |
| BE-7 | A remote backend can be configured in place of the local one | P2 |

### User interface

| ID | Requirement | Priority |
|---|---|---|
| UI-1 | A "new music project" entry point opens the timeline in music mode: bar grid, audio tracks, AI panel | P0 |
| UI-2 | An AI panel bound to the current selection shows the inferred operation, prompt, model choice, a generate action, and the take list with audition | P0 |
| UI-3 | Audio tracks carry a role chosen from the ACE-Step track names | P1 |
| UI-4 | Music mode works in a project that also has video tracks | P1 |
| UI-5 | Music mode can be reached and presented on its own (deep link or dedicated window) for separate marketing | P2 |

### Persistence and performance

| ID | Requirement | Priority |
|---|---|---|
| PS-1 | Tempo, key, clips, takes and generation records save with the project and reopen identically | P0 |
| PS-2 | Existing projects open unchanged. New fields arrive through a schema migration | P1 |
| PS-3 | Interchange export still works for projects that use takes and music mode | P1 |
| PF-1 | Eight tracks play for ten minutes with zero dropouts while the user scrolls and zooms | P0 |
| PF-2 | The timeline stays responsive with 32 tracks and 500 clips | P1 |
| PF-3 | No added dropouts while a local generation runs at full load | P1 |
