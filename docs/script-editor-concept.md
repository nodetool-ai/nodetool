# Script Editor — Concept

> Status: Concept / brainstorm · Owner: matti
>
> A script as a first-class resource: text plus the audio takes voiced from it,
> authored in an ElevenLabs-Studio-style editor, importable into a timeline
> sequence for video. This document scopes the idea against what already exists
> in the codebase.

## The pitch

Today the only place to write and voice narration is *inside* a timeline: the
Studio transcript layer (`TimelineTranscriptStore`) projects a document view
over voiceover clips, and the clips are the source of truth. That is the right
model for *post*-production — word-accurate ripple cuts on media that already
exists — but wrong for *pre*-production. A writer wants to draft, restructure,
assign speakers, and audition voices before any timeline exists, and wants the
same script reusable across several videos (a 60s cut and a 15s teaser).

The Script editor inverts the transcript's ownership: **text is the source of
truth, audio is derived**. A script lives on its own, line by line, each line
voiced into one or more *takes* (audio assets with word timings). "Send to
timeline" assembles the current takes into a sequence — the same move the
storyboard already makes for images and video.

## What already exists (the substrate)

The concept is mostly assembly of parts that are in `main`:

| Piece | Where | What it gives the script editor |
| --- | --- | --- |
| First-class-resource pattern | `packages/models/src/schema/storyboards.ts`, `StoryboardStore`, `StoryboardSurface` | Table shape (`id, user_id, project_id, name, document, timeline_id`), tRPC CRUD, workspace tab, autosave |
| Assemble → timeline | `web/src/components/storyboard/assembleTimeline.ts` | Resource → sequence creation with linkage keys on clips |
| Back-sync after regen | `web/src/stores/storyboard/timelineSync.ts` | Re-voiced line updates the assembled timeline clip (CAS update, never throws) |
| Voicing pipeline | `TimelineTranscriptStore.generateBeat` | text → `generate_media` (TTS) → probe duration → `transcribe_audio` (word timings) → reflow |
| Word-timing model | `captionWord` / `clipCaption` in `packages/protocol/src/api-schemas/timeline.ts` | Clip-local word timings that survive re-flow |
| Take/version model | `clipVersion` (same file), `ClipVersionHistory`, `ShotTakesGallery` | Versioned generations with param snapshots, favorites, cost |
| Document editor infra | `web/src/components/timeline/transcript/` (Lexical: `WordNode`, `SceneBreakNode`, slash commands) | The text-editing surface, word-level selection, per-word playback highlight |
| Providers | `packages/runtime/src/providers/elevenlabs-provider.ts` + every other TTS-capable provider | Voice generation; ElevenLabs also returns native timestamps |

What does *not* exist: the script document schema, the `scripts` table, the
standalone editor surface, a cast/speaker→voice binding, and the
script↔timeline linkage keys.

## Document model

Zod schema in `packages/protocol/src/api-schemas/` next to the timeline and
storyboard schemas. Sketch:

```
Script
├─ id, name
├─ cast: Speaker[]        { id, name, color,
│                           voice: { provider, model, voice, settings? } }
└─ sections: Section[]    { id, title? }          // scene / chapter breaks
   └─ lines: Line[]
      ├─ id, speakerId?, text
      ├─ direction?                // freeform performance note ("whispering,
      │                            // tired"), passed through to providers
      │                            // that accept it — no structured tag schema
      ├─ pauseAfterMs?             // authored silence between lines
      ├─ takes: Take[]
      │    { id, assetId, durationMs, words: CaptionWord[],
      │      textSnapshot, voiceSnapshot, createdAt, favorite?, costCredits? }
      └─ currentTakeId?
```

Derived, not stored:

- **Line status**: `draft` (no takes), `voiced` (current take's `textSnapshot`
  and `voiceSnapshot` match the line), `stale` (text or voice changed since the
  take — show a re-voice affordance, exactly like the timeline's
  `dependencyHash` staleness).
- **Script duration**: sum of current-take durations plus pauses. Placeholder
  duration for unvoiced lines (the transcript layer's `PLACEHOLDER_BEAT_MS`
  move).

`CaptionWord` is reused as-is; timings stay take-local so re-ordering lines
never rewrites word timings — the same invariant the timeline already relies
on.

Takes are the `clipVersion` idea relocated onto the script: `textSnapshot` +
`voiceSnapshot` play the role of `paramOverridesSnapshot`, and the take gallery
is the shot-takes gallery with an audio player instead of a thumbnail.

## Storage

`scripts` table mirroring `storyboards` byte for byte in shape: document JSON
column, `timeline_id` back-pointer once assembled, indexes on user/project/
updated. tRPC router with the same get/list/create/update(CAS)/delete surface,
autosave hook copied from the timeline's.

Audio takes are ordinary assets — the script references them by `assetId`, so
asset lifecycle, storage backends, and `.nodetool` bundle export (graph +
referenced asset bytes) all work unchanged. The script itself is a DB resource,
not an asset, matching workflows/storyboards/sequences.

## Editor surface

A new workspace tab type (`WorkspaceTabsStore` already routes storyboard /
timeline / sketch surfaces), laid out like ElevenLabs Studio:

- **Document pane** — the script as continuous prose, one paragraph per line,
  speaker chip in the gutter. Reuse the Lexical transcript editor: it already
  has word nodes, scene breaks, and slash commands. Enter splits a line,
  backspace at start merges, drag reorders.
- **Cast panel** — speakers with voice pickers (provider/model/voice) and a
  "preview voice" button. Assigning a speaker to a line inherits the voice;
  per-line overrides allowed.
- **Line affordances** — voice / re-voice button with per-line spinner
  (`clipStatus` pattern), take gallery popover, stale badge, per-line playback.
- **Play-through** — sequential playback of current takes with the word
  highlight the transcript editor already renders; unvoiced lines are skipped
  or beep-placeholded. This is a plain `Audio`-element chain, no compositor
  needed.
- **Voice all** — batch-generate every draft/stale line, bounded concurrency,
  per-speaker voices respected.

## Voicing pipeline

Identical to `generateBeat`, minus the timeline coupling:

1. line text (+ direction) → `generate_media` RPC (mode `audio`, speaker's
   provider/model/voice) → asset id
2. probe duration
3. word timings onto the take: providers that declare a `ttsTimestamps`
   capability return them natively with the synthesis (ElevenLabs
   `with-timestamps` endpoints — more accurate, one call fewer); everything
   else falls back to the `transcribe_audio` RPC (best-effort, as today —
   a failed transcription still leaves a playable take)
4. append take, set `currentTakeId`

## Timeline import ("Send to timeline")

The storyboard's assemble move, for audio:

- Create (or update) a sequence: one voiceover clip per line on an audio track
  — optionally one track per speaker — laid end to end with `pauseAfterMs`
  gaps. Each clip carries the take's asset, its `CaptionWord[]` as
  `clip.caption`, `speaker`, and two linkage keys: `scriptId` + `scriptLineId`
  (the storyboard's `storyboardBoardId`/`storyboardShotId` pattern).
- Set `script.timeline_id`. The assembled sequence opens in the timeline
  editor, where the existing transcript layer takes over for word-level
  post-production — the imported clips are indistinguishable from beats voiced
  in-timeline.
- **Re-voice after assembly**: mirror `syncShotClipToTimeline` — when a linked
  line gets a new current take, patch the matching clip's `currentAssetId`,
  duration, and caption via a CAS document update. Log-and-continue on
  failure, never block the take.
- **Structural drift**: adding/removing/reordering lines after assembly is the
  hard case. V1 answer: sync only per-line asset swaps; structural changes
  prompt "re-assemble" (which re-lays the voiceover track but preserves other
  tracks). Anything cleverer (three-way merge against the timeline's own
  edits) is explicitly out of scope until the simple thing proves limiting.
- **Reverse import**: "Extract as script" from a timeline — project the
  transcript document (`buildTranscriptDoc`) into a new script resource. Cheap
  to build because the projection already exists, and it closes the loop for
  recorded/imported media: transcribe a recording in the timeline, extract the
  script, re-voice it with a cast.

### Relation to the in-timeline transcript

Keep both, with distinct jobs: the **script** is pre-production (authoring,
casting, auditioning — text owns audio), the **transcript** is post-production
(ripple cuts on real media — clips own words). The linkage keys are what stop
this from becoming two competing sources of truth: a clip either belongs to a
script line (script wins for text/voice, timeline wins for placement/trims) or
it doesn't (transcript behaves exactly as today). Unifying them into one model
was considered and rejected for now — the transcript's clips-as-truth invariant
is load-bearing for ripple editing and undo, and inverting it underneath the
existing editor is a rewrite, not a feature.

## Automation

- **Agent tools**: `ui_script_*` mirroring the timeline set — `get_state`,
  `add_line`, `set_line_text`, `set_speaker`, `set_speaker_voice`,
  `voice_line`, `voice_all`, `send_to_timeline`. Same bridge pattern
  (`timelineAgentBridge`), same assistant panel. This is what makes "paste a
  topic, get a voiced script" a chat interaction.
- **Graph nodes**: `ScriptRef` in the protocol type system, plus a small node
  family — `LoadScript`, `VoiceScript` (batch TTS over a cast),
  `ScriptToTimeline`. Enables headless pipelines: LLM writes script → voice →
  assemble → render.
- **Exports**: SRT/VTT straight from take word timings; audio-only mixdown
  (concatenate takes + pauses) as an asset; scripts included in `.nodetool`
  bundles with their take assets.

## Open questions

- **Dialogue-mode models.** ElevenLabs v3 renders multi-speaker dialogue in
  one call with better prosody than line-by-line synthesis, but produces one
  asset spanning many lines — it breaks the line↔take 1:1. Likely modeled as a
  section-level "dialogue take" whose word timings are split back onto lines.
  Phase 4 at the earliest.
- **Take retention.** Takes are cheap to keep (assets already exist); surface
  `costCredits` per take like clip versions do, revisit pruning only if it
  hurts.
- **Collaboration.** Same last-write-wins CAS as timeline and storyboard;
  nothing script-specific.

## Phasing

1. **Author + voice** *(implemented)* — protocol schema
   (`api-schemas/scripts.ts`), `scripts` table + tRPC (`scripts` router), store
   + autosave (`ScriptStore`, `useScriptServerSync`), workspace surface
   (`ScriptSurface`, `script` tab type), cast panel, per-line voicing
   (`scriptVoicing`, reusing `generate_media` / `transcribe_audio`), take
   gallery, play-through. The document pane is a plain per-line editor rather
   than the Lexical transcript editor — that reuse is deferred to a later pass.
2. **To timeline** *(implemented)* — assemble the current takes into a
   voiceover sequence with `scriptId`/`scriptLineId` linkage keys
   (`assembleScriptTimeline`, `useAssembleScriptTimeline`, "Send to timeline"),
   per-line back-sync on re-voice / take switch (`stores/script/timelineSync`),
   re-assemble in place on structural drift (preserving foreign tracks), and
   extract-as-script from a timeline transcript (`extractScript`,
   `useExtractScript`, the transcript panel's "Extract as script").
3. **Automation** *(implemented)* — `ui_script_*` agent tools
   (`scriptAgentBridge`, `useScriptAgentBridge`, `builtin/script`:
   `get_state`, `add_speaker`, `set_speaker_voice`, `add_line`, `set_line_text`,
   `set_speaker`, `voice_line`, `voice_all`, `send_to_timeline`) + an in-surface
   assistant panel (`ScriptAgentPanel`, a Cast/Assistant dock toggle),
   `ScriptRef` in the protocol type system with a `script` data type and
   property editor, and a graph node family (`ConstantScript`, `LoadScript`,
   `VoiceScript` — batch TTS over a cast, `ScriptToTimeline`) reading/writing
   scripts through new `ProcessingContext` script methods.
4. **Depth** — dialogue-mode rendering, provider-native timestamps, SRT/VTT
   export, bundle support.

Phase 1 is deliberately shippable alone: a script you can write, cast, voice,
and listen to is already the ElevenLabs-Studio use case, before any timeline
integration.
