# Script ↔ Storyboard Link — Technical Design

> Status: Proposed · Companion: [prd.md](prd.md), [tasks.md](tasks.md).

The design links the two documents with keys and derives everything else. No
document is merged, no ownership moves: the script keeps words and voice, the
storyboard keeps visuals and motion, the timeline keeps placement. Every
mapping is a pure function in a shared package, consumed identically by the
web editors, the server-side agent tools, and the evals — the pattern
`buildStoryboardTimeline` and `buildScriptTimeline` already follow.

## 1. Data model

### 1.1 Storyboard document (the link lives here)

The storyboard references the script, not the other way around, because the
board is the consumer of the words: it projects line text into shots and
reads take durations for timing. Additions to
`packages/protocol/src/api-schemas/storyboards.ts` and the mirrored
interfaces in `packages/protocol/src/creative.ts`:

```
Screenplay
└─ script_id?: string | null        // the linked script resource

Shot
├─ script_line_ids?: string[]       // ordered lines this shot covers
├─ script_text_snapshot?: string    // linked line texts as last projected,
│                                   // joined "\n" — drift comparison only
└─ duration_source?: "audio" | "manual"
                                    // "audio": derived from takes (default
                                    // when linked); "manual": user override,
                                    // audio never touches duration_seconds
```

Tool-surface aliases (`SHOT_KEY_ALIASES` / `SCREENPLAY_KEY_ALIASES` in
`api-schemas/storyboards.ts`): `scriptId` → `script_id`, `scriptLineIds` →
`script_line_ids`, `scriptTextSnapshot` → `script_text_snapshot`,
`durationSource` → `duration_source`.

All fields optional; the schemas are `passthrough`, so old documents load
unchanged and new fields travel through old clients.

### 1.2 Script resource (back-pointer for navigation)

`scripts` table and `scriptResponse` / `patchScriptInput`
(`packages/protocol/src/api-schemas/scripts.ts`,
`packages/models/src/schema/scripts.ts`): add nullable `storyboard_id`,
exactly like the existing `timeline_id` back-pointer. Set when a board is
derived from or linked to the script; cleared when the board is deleted
(same log-and-continue posture as timeline back-sync). The script document
itself gains **no** shot references — line↔shot membership is owned by the
board and read by inverting `script_line_ids`.

### 1.3 Invariants (validated, not assumed)

Checked by a new pure `validateScriptLink(screenplay, scriptDoc)`:

- A line id appears in at most one shot's `script_line_ids` (error).
- Every referenced line id exists in the script (error, names the shot).
- `script_id` set but script missing/deleted (warning — board still works,
  link affordances disable).
- A shot with `script_line_ids` on a board without `script_id` (error).

Runs wherever storyboard documents are normalized and saved (the
`normalizeStoryboard*` path every `ui_storyboard_*` write already goes
through), and in the headless tools before acting.

## 2. Pure mappings (shared packages)

### 2.1 Extract: screenplay → script document

New module `packages/protocol/src/script-link.ts` (protocol because it maps
between two protocol document shapes and must stay dependency-free, like
`entitiesForShot`):

```ts
extractScriptFromScreenplay(
  screenplay: Screenplay,
  entities: Entity[]
): { document: ScriptDocumentSchema; lineIdsByShotId: Record<string, string[]> }
```

Deterministic, no model call:

- One section per screenplay (or per scene grouping if shots carry scene
  slugs later — V1: single section titled from the screenplay).
- Per shot, in `index` order: `dialogue` becomes a line whose `speakerId` is
  the character entity matched by the existing `entitiesForShot` rules;
  `narration` becomes a line with the narrator speaker.
- Cast: one narrator speaker plus one speaker per character entity that
  contributed a line; `Entity.voice_id` seeds `voice.voice` when the entity
  carries one (provider/model left for the cast panel or Studio's curated
  lineup to fill).
- Returns the shot→lines map so the caller can stamp `script_line_ids` and
  `script_text_snapshot` onto the shots in the same save.

### 2.2 Derive: script → shot scaffold

Same module:

```ts
deriveShotScaffold(
  script: { id: string; cast: Speaker[]; sections: ScriptSection[] },
  options?: { maxLinesPerShot?: number }   // default 1; sections never split
): ShotScaffold[]   // { script_line_ids, dialogue|narration, index }
```

The scaffold pins linkage, order, and the projected text deterministically.
Shot *content* — `action`, `camera`, `motion`, `slug`, entities — is the
Director agent's job: the director prompt gains a variant that receives the
scaffold plus line texts and must return shots that keep `script_line_ids`
untouched (the normalizer enforces it: a director response that drops or
reassigns linkage keys is rejected and retried, the same posture the
storyboard normalizer takes on missing `action`). Headless fallback when no
model is configured: scaffold shots with `action` copied from line text,
status `planned`.

### 2.3 Timing: takes → shot durations

`packages/timeline/src/script-link.ts` (timeline package because it needs
`currentTake` from `script.ts`):

```ts
linkedShotDurationMs(shot: Shot, linesById: Map<string, ScriptLine>): number | null
```

Sum of linked lines' current-take durations plus `pauseAfterMs`, or `null`
when any linked line is unvoiced (caller falls back to `duration_seconds` /
`DEFAULT_SHOT_MS`). Applied only when `duration_source !== "manual"`. The
storyboard editor recomputes on script changes through the existing
server-sync refresh; nothing is stored — `duration_seconds` is only written
on assemble and render so prompts see the real target length.

### 2.4 Joint assemble: linked pair → one timeline

`packages/timeline/src/linked.ts`:

```ts
buildLinkedTimeline(input: {
  boardId: string;
  shots: Shot[];
  musicPrompt?: string | null;
  script: { scriptId: string; cast: Speaker[]; sections: ScriptSection[] };
}): AssembledTimeline & { skippedLineIds: string[] }
```

- Video track: as `buildStoryboardTimeline` — assemblable shots end to end —
  except each shot's duration is `linkedShotDurationMs(...) ?? shotDurationMs(...)`.
- Voiceover track: one clip per voiced line, starting at
  `shotStartMs + offset` where offset is the sum of preceding linked takes
  and pauses within the same shot. Clip payload identical to
  `buildScriptTimeline`'s (caption words, speaker, voice, `scriptId` +
  `scriptLineId`) **plus** `storyboardBoardId`/`storyboardShotId`, so both
  existing back-sync paths (`stores/storyboard/timelineSync`,
  `stores/script/timelineSync`) patch the same clips with no changes.
- Music: as today. The whole-cut narration draft clip is **not** emitted —
  the script supersedes it.
- Lines whose shot is skipped (unrendered) are reported in `skippedLineIds`,
  not silently dropped.

`buildStoryboardTimeline` and `buildScriptTimeline` stay untouched; linked
assembly is a third function, so unlinked behavior is provably unchanged
(regression tests assert identical output on existing fixtures).

### 2.5 Drift

Derived helpers next to `needsVoicing` (same "derived, never stored" rule):

```ts
shotDialogueDrifted(shot, linesById): boolean   // joined texts ≠ snapshot
orphanedLineIds(screenplay, scriptDoc): string[] // lines with no shot, on a linked board
```

"Re-project" recomputes `script_text_snapshot` and the shot's
`dialogue`/`narration` projection in one document update; it never touches
rendered assets — re-rendering stays a separate, explicit action.

## 3. Server surface

### 3.1 tRPC

- `scripts` router: `patchScriptInput` accepts `storyboardId` (nullable),
  same CAS update as `timelineId`.
- `storyboards` router: no new procedures — the link is document content.
- New procedures are not needed for derive/extract in the web app: both run
  client-side over the stores (they are document→document mappings) and save
  through the existing CAS updates. Headless runs use the agent tools below.

### 3.2 Agent tools (headless, `packages/agents/src/tools/`)

Extend the storyboard/script tool files
(`storyboard-render-tools.ts` re-exports, `capabilities/storyboards.ts`,
`capabilities/scripts.ts`):

- **`extract_script_from_storyboard`** `{storyboard_id, name?}` — runs
  `extractScriptFromScreenplay`, creates the script row, stamps
  `script_id`/`script_line_ids`/snapshots onto the board, sets the script's
  `storyboard_id`. Errors if the board already links a script (idempotence:
  pass `relink: true` to re-project instead).
- **`derive_storyboard_from_script`** `{script_id, provider?, model?, name?}` —
  scaffold + director pass (provider/model resolved like the render tools:
  from the call or the board's selection, unset is an error naming
  `find_model`); creates the board linked and back-pointed. With no
  provider: deterministic scaffold only, shots `planned`.
- **`assemble_storyboard_timeline`** (existing) — when the board carries
  `script_id`, load the script and call `buildLinkedTimeline`; otherwise
  unchanged. One tool, no new name: "assemble this board" always does the
  right thing.
- `get_storyboard` / `get_script` responses gain the link fields and derived
  drift/orphan summaries so an agent can decide what to fix without a second
  round trip.

### 3.3 `ui_*` tools (web, `web/src/lib/tools/builtin/`)

- `ui_storyboard_extract_script`, `ui_storyboard_relink_script`,
  `ui_storyboard_set_duration_source` in `builtin/storyboard.ts`.
- `ui_script_derive_storyboard` in `builtin/script.ts`.
- `ui_storyboard_assemble_timeline` and `ui_script_send_to_timeline` gain the
  linked path (both call `buildLinkedTimeline` when linked; the script-side
  button becomes "Assemble video" when a board is linked).
- The headless eval bridges (`packages/agents/src/evals/surfaces/storyboard.ts`,
  `script.ts`, `creative-pipeline.ts`) mirror the new tools, keeping the
  tool-loop suites honest.

## 4. Web UX

- **Storyboard shot inspector**: a "Script" section listing linked lines with
  speaker chip, voice status (draft/stale/voiced — `needsVoicing`), play
  button on the current take, and the drift badge with *Re-project*. Voicing
  a line from here calls the script store's existing `scriptVoicing` path.
- **Storyboard header**: *Extract script* (unlinked) / *Open script* (linked).
  Assemble button label unchanged; behavior switches on the link.
- **Script editor gutter**: per line, the linked shot's keyframe thumbnail
  chip (click → open board, select shot). Orphan badge when linked board has
  no shot for the line.
- **Script header**: *Create storyboard* (unlinked) / *Open storyboard*.
- **Studio** (`web/src/studio/`): home groups documents sharing a link into
  one project card (script + board + timeline); the prompt-first flow runs
  derive right after the director drafts, so the user lands linked. Curated
  models stamp as today.
- **Deletion**: deleting a linked script downgrades the board to unlinked
  (link fields cleared, projected text kept — it is ordinary shot text);
  deleting a board clears the script's `storyboard_id`. Both are
  log-and-continue, never blocking the delete.

## 5. What deliberately does not change

- `buildStoryboardTimeline`, `buildScriptTimeline`, both `timelineSync`
  modules, the transcript layer, and all timeline editor code.
- Unlinked storyboards keep the narration/music draft-clip behavior.
- The `nodetool.script.*` and storyboard node families (a `LinkedAssemble`
  node can come later; the agent tools cover headless first).

## 6. Testing and harnesses

- Unit (Vitest, `packages/protocol` + `packages/timeline`): extract, scaffold,
  duration, joint assemble, drift, link validation — including regression
  fixtures proving unlinked assembly output is byte-identical.
- Tool-loop evals: extend `storyboard-tools` and `script-tools` cases for the
  new tools; add a `creative-pipeline` case script → derive → render (stub) →
  joint assemble → `validate_timeline`.
- Web (Jest): inspector line panel, gutter chips, assemble switch, deletion
  downgrade.
- `nodetool timeline validate` already checks the assembled output; the joint
  assembler's tests feed it the built document.
- Harness registry (`packages/cli/src/harness/registry.ts`): the linked
  flow is part of the storyboard and script surfaces; extend their harness
  entries' selfchecks with the new deterministic tests so `harness gate`
  picks them up on diffs touching these paths.

## 7. Risks

- **Director drops linkage keys.** Mitigated by normalizer enforcement +
  retry, and the deterministic scaffold as the floor.
- **Drift snapshot bloat.** `script_text_snapshot` is bounded by line text
  length; no take/audio data is ever copied into the board.
- **Two documents, one save race.** Extract/derive write two resources; both
  writes are CAS and the link is only stamped after the created row exists.
  A failed second write leaves an unlinked-but-valid document and a toast,
  never a half-link that fails validation.
