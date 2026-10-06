# Native game editor audit

Scope: the 2D and 3D game editor in `web/src/components/game/`, the draft store and merge code in `web/src/stores/game/`, and the games API (`packages/websocket/src/trpc/routers/games.ts`, `packages/models/src/game.ts`). Line numbers refer to `main` as of 2026-10-03.

Confidence labels:
- **Reproduced** means a test or script showed the failure.
- **Traced** means the code path was read end to end.
- **Plausible** means the mechanism is in the code but the bad outcome depends on timing.

## Fixed in PR #6040

| ID | Finding | Evidence |
|---|---|---|
| F1 | Undoing the addition of a parent and its child generated `remove_entity` for both. The parent's removal deletes the child, so the child op failed, and every later 2D draft save failed until a reload. Reloading discards the edits. | Reproduced: `diffGameDocuments.test.ts` failed with "Entity child does not exist" before the fix. |
| F2 | Ctrl+V kept a pasted child attached to the original parent. Pasting into another scene left a dangling `parentId`. | Traced. `gameClipboard.test.ts` covers the new behavior. |
| F3 | The toolbar showed "Unpublished changes" for both unsaved edits and failed saves. | Traced. A test was added. |

## Open findings, highest priority first

### Data loss and stuck saves

**F4. High, plausible. One rejected batch blocks every later save (2D and 3D).**
- Where: `GameDraftStore.ts:54-59`, `GameEditor.tsx:155-185`, `games.ts:349-353`.
- Cause: after a merge, `applyMerged` diffs the merged document into `pendingOps` without validating it.
- Scenario: the user adds a sprite on slot `hero` while the agent unbinds `hero`. The merge has no conflict, the server rejects the result with "references missing asset", and the client resends the same ops on every edit.
- Plain `Error`s from `trackGameAuthoringEdits` behave the same way and are reported as INTERNAL_ERROR.
- Fix direction: validate after a merge, and when the server rejects with an unchanged token, drop the bad ops or reload the draft instead of retrying.

**F5. High, plausible. The 3D editor can silently lose edits made while a save is in flight.**
- Where: `GameEditor3D.tsx:51-69`.
- Cause: `pull()` does not wait for the save in progress. The 2D editor does, at `GameEditor.tsx:103`.
- Scenario: the save's own `resource_change` echo triggers a merge. `applyMerged` resets `savingCount`. `acknowledge` then drops the edits made during the save.

**F6. Medium, traced. `restore`, and `publish` with an explicit document, delete unpublished draft work without a draft token.**
- Where: `games.ts:198-228`, `games.ts:431-439`, `game.ts:465-506`.
- After the publish, the server deletes the draft file and the whole change history, so the overwritten draft cannot be recovered.

**F7. Medium, traced. A missing draft version file makes the game uneditable and unpublishable.**
- Where: `game.ts:215-221`.
- `readDraft` throws, and every API path calls it first.
- Triggers are plausible: change-history pruning or post-publish cleanup can delete a hash-named file that a concurrent writer has just made current again (`game.ts:429-442`, `game.ts:498-503`).

**F8. Medium, traced. After a failed save, the 2D save stays "error" until the next edit.**
- Where: `GameEditor.tsx:155-185`.
- If the user keeps their version on every conflict, nothing triggers autosave, and the red error stays visible.
- The 3D editor has a similar problem (`GameEditor3D.tsx:83-88`):
  - a merge that resolves cleanly is overwritten with "error".
  - an offline `pull` leaves the status at "saving".
- Accepting a conflict also moves `baseUpdatedAt` back to the token captured when the conflict was raised (2D and 3D). The next save is then guaranteed to be rejected as stale.

### Editing correctness

**F9. High, reproduced. Dragging, scaling or rotating a child entity in the 2D viewport moves it to the wrong place.**
- Where: `GameViewport.tsx:284`, `:339`, `:342-344`.
- Cause: the viewport reads world coordinates from the rendered sprite and writes them into `transform2d`, which is local to the parent.
- Reproduced: with the parent at x=5 and the child at local x=2, the sprite is at x=7, and a drag writes local x=7+d, so the child jumps to world x=12+d.
- The same local/world mix-up affects:
  - icon hit-testing, marquee selection, the collider and camera overlays, and the F (frame selection) key, which all treat `transform2d` as world (`viewportGeometry.ts:34-38`, `GameViewport.tsx:117-167`, `:352-354`).
  - reparenting in the scene tree and inspector, which keeps local values, so the entity jumps.

**F10. Medium, traced. Delete and arrow-key nudge act only on the first selected entity, while copy takes every selected entity.**
- Where: `GameEditor.tsx:319-346`.
- Dragging also moves only one entity.
- A multi-delete must skip descendants of other removed entities, the same rule as F1.

**F11. Medium, traced. In the 3D editor, Ctrl/Cmd+Z is captured for every text field in the main row.**
- Where: `GameEditor3D.tsx:158-163`.
- This includes the assistant chat box and inspector inputs. The keystroke undoes the game document instead of the text, and it also fires during play.

**F12. Medium, traced. The inspector's Parent list offers the entity's own descendants.**
- Where: `GameInspector.tsx:204-206`.
- Choosing one creates a cycle. Validation flags it, but the editor preview then fails with "Missing world transform".

**F13. Medium, traced. While the script pane shows "draft changed", typing is silently not saved.**
- Where: `GameScriptPane.tsx:63-67`.
- The only option offered is "Use draft version", which discards the typed text.

**F14. Medium-low, traced. In the 3D editor, concurrent `flush()` callers can send the same ops twice.**
- Where: `GameEditor3D.tsx:72`, `:91`.
- Publish, model install or authoring preview can then fail with "modified concurrently".

### Performance

**F15. High, traced. Every edit rebuilds the whole play stack.**
- Where: `useGamePlaySession.ts:156-235` (2D) and `useGamePlaySession3D.ts:122-227` (3D).
- After a 100 ms debounce, each edit recreates:
  - the session.
  - the GPU renderer (WebGPU or three.js).
  - the font loader.
  - the audio player, which in 3D means a new `AudioContext` and audio re-preload.
- In 3D every GLB is re-fetched and re-parsed, the toolbar flickers to "Initializing", and a gizmo drag started right after an edit is cut off.

**F16. Medium, traced. Each frame during play re-renders the whole 2D editor.**
- Where: `GameEditor.tsx:72`, `:352`.
- Each render runs a JSON diff of the full play and draft documents (`diffGameDocuments`) and `validateGame(document)`.
- The 3D editor does the same work at about 10 Hz (`GameEditor3D.tsx:137`, `GameInspector3D.tsx:76`).
- Fix direction: memoize both on `document`.

**F17. Medium, plausible. 3D change history grows without bound.**
- Every 3D undo, redo and merge is a single `set_document` op holding the full document. Each one becomes a change row, up to 500 rows are kept, and `draftChanges` returns all of them every 5 s.
- `saveDraft` has no limit on the number of ops.

### Publish

**F18. Low-medium, traced. Publish sends a stale `baseRevision` from the React Query cache.**
- Where: `GameEditor.tsx:256`, `GameEditor3D.tsx:120`.
- After another session publishes, publish keeps failing until the query refetches.

**F19. Low-medium, traced. Publish ships the server's draft, not the document the user validated.**
- Agent edits that land between `flushDraft` and the publish call are published unseen.
- The 3D publish has no validation, no change list and no loading state, so a double click publishes twice.

**F20. Medium, traced. Publish can report failure after it has committed.**
- Where: `games.ts:225-228`.
- The cleanup after the commit is not wrapped in try/catch, so a storage hiccup returns a 500 although the revision is live. Retrying then fails as a concurrent modification.

### Smaller issues

- **F21.** In the 3D editor, `operationError` never clears after a later success (`GameEditor3D.tsx:39`).
- **F22.** 3D mouse input differs from the standalone player:
  - pointer down never sends `Mouse0`, so the "fire" action cannot fire from the mouse.
  - look works only while the right button is held, with no pointer lock (`GameViewport3D.tsx:223-234`).
- **F23.** 3D input pressed while play is paused piles up and fires on resume.
- **F24.** In the 3D editor, the authoring preview's "highlight" callback clears the selection, and hovering a change in the Changes list highlights nothing (`GameEditor3D.tsx:154-156`).
- **F25.** Restoring a revision to the draft has no confirmation step and clears the undo history.
- **F26.** `restoreDraft` and `saveDraft` turn validation errors into 500s instead of INVALID_INPUT.
- **F27.** Orphaned draft files are left behind when a compare-and-set fails. Revision files are never pruned.
- **F28.** The replay history (`inputHistoryRef`) grows by one entry per tick for the whole play session.
- **F29.** "Save play state" calls `localStorage.setItem` without a try/catch, so a full quota throws an uncaught error.

### Reported by another thread and not reproduced

**F30. Unconfirmed. A crash after Stop in the 2D editor.**
- The "Game Editor UI redesign" thread reported that `web/tests/journeys/native-game-editor.spec.ts` crashed after Stop on `main` in its container. It gave no error text.
- In the audit's cloud container the same journey passed 5 times out of 5 on `main`'s game code, and once with PR #6040 applied.
- This container differs in two ways: it has a Vulkan ICD (`mesa-vulkan-drivers`), and its headless Chromium is aliased from build 1194.
- Possible cause, inferred and not verified: the crash could depend on the WebGPU fallback path. Stop rebuilds the renderer (see F15).
- The error text is needed before this can be diagnosed.

The 3D journey's save conflict while installing a model matches F5 and F14.

## Feature gaps in 3D compared with 2D

- No Delete, nudge, duplicate, copy or paste shortcuts.
- No multi-select.
- No Revisions panel.
- No script error tools: no replay, no "Run 10 s", no "Ask the assistant".
- No hierarchy or reparenting UI.
- No mobile layout.
- The script pane follows the behavior index, not the entity. Selecting another entity silently retargets the open pane.

Neither the 2D nor the 3D editor has UI to add or remove scenes.

## Checked and found sound

- Draft tokens strictly increase, and the compare-and-set saves are atomic.
- Every games API procedure checks ownership.
- The 3D merge adapter fields match the schemas.
- Overlay, gizmo and session disposal in 3D.
