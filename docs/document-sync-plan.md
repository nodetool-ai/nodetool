# Document sync: merge external changes into a dirty draft

Decisions: [ADR 0001](adr/0001-document-sync-draft-wins.md). Terms: [CONTEXT.md](../CONTEXT.md).

Today `documentSync.ts` reloads a clean editor and warns a dirty one. A dirty editor's next autosave fails the CAS and the only recovery is a refresh. This plan replaces the warning with a per-merge-unit merge, draft wins, one conflict banner.

Eight slices. S0 is shared and ships first. S1 to S7 are independent after S0 and can go in any order; the ADR names storyboard first.

## S0 Foundation

### S0.1 Ops on the write

`ModelObserverCallback` (`packages/models/src/base-model.ts:22`) takes no context. Add an optional third argument `meta?: { ops?: unknown[] }` to `ModelObserver.notify` and to every `updateFieldsIfUnchanged` / `updateDocumentIfUnchanged` / `mutateDocumentData` static (`storyboard.ts:181`, `script.ts:224`, `js-script.ts:139`, `image-document.ts:245`, `timeline-sequence.ts:293`, `application.ts:352`, `workflow.ts:132`). Do not use AsyncLocalStorage: the ops belong to one write, not to a request.

`onModelChange` (`packages/websocket/src/unified-websocket-runner.ts:9217`) copies `meta.ops` into `resource.ops`. `ResourceChangeMessage` in `packages/protocol/src/messages.ts:902` gets `ops?: DocumentOp[]`.

`DocumentOp` lives in `packages/protocol/src/document-ops.ts`: `{ tool: string; input: unknown }`, the same shape the headless bridges replay. The web narrows per surface.

### S0.2 Merge engine

`web/src/stores/documentMerge.ts`, pure, no store access:

```ts
interface MergeResult<TDoc> {
  doc: TDoc;
  conflicts: Conflict[];
}
interface Conflict {
  unit: { kind: string; id: string; label: string };
  external: unknown;   // the value the draft refused
  reason: "edited" | "deleted" | "dangling" | "replaced";
}
mergeByUnits<TDoc>(base, draft, server, adapter): MergeResult<TDoc>
```

`adapter` lists the unit collections of a document (`shots`, `clips`, `layers`, …), the id field per collection, and the scalar fields that are last-write-wins. The engine is a three-way merge by unit id:

- unit changed on the server only: take the server value
- unit changed in the draft only: keep the draft
- both changed: keep the draft, emit `edited` conflict with the server value
- deleted on the server, changed in the draft: keep the draft, emit `deleted`
- server-only write with no ops (`resource.ops` missing): whole document is one unit; a dirty draft keeps everything and emits one `replaced` conflict

Ops are used for one thing: to know which units the external write touched, so a unit the draft and the server both differ in but the write did not touch is not a conflict. Without ops, "touched" is "differs from base".

### S0.3 documentSync changes

`documentSync.ts` subscriber gains `merge(server, ops)` next to `reload`. `handleDocumentResourceChange` calls `merge` when dirty, `reload` when clean. `warnChangedElsewhere` goes.

Conflict state: `web/src/stores/ConflictStore.ts`, keyed `${type}:${id}`, holds `Conflict[]`. Actions `accept(unitId)` and `discard(unitId)`. Accept applies the external value through the surface store's own mutation so it lands on the undo stack.

### S0.4 Banner

`web/src/components/ui_primitives/ConflictBanner.tsx`, one component, props `{ conflicts, onAccept, onDiscard }`. Mounted by each editor shell. Text: "N changes made outside the editor conflict with your edits."

### S0.5 Undo

Merged external values must bypass undo. Per surface the mechanism differs and is listed in the slice. Rule: apply the merged document through a store path that does not push history.

### S0.6 Agent CAS retry

The capabilities already retry CAS five times (`storyboards.ts:88`, `scripts.ts:94`, `timelines.ts:465`). The ADR says one reapply. Drop the constant to 1 in each. Not blocking.

Tests: `documentMerge.test.ts` covers every branch above with a generic adapter. `documentSync.test.ts` covers dirty → merge, clean → reload, echo → ignore, no-ops → replaced.

## S1 Storyboard

- Store: `web/src/stores/storyboard/StoryboardStore.ts`, history via `documentHistory.ts`.
- Sync: `web/src/hooks/storyboard/useStoryboardServerSync.ts:311`.
- Write: `packages/agents/src/capabilities/storyboards.ts:1339`, ops `add_shot / update_shot / remove_shot / reorder_shot / set_board`.
- Units: `shots[]` by `shot.id`. Board scalars (`brief`, `style`, `aspectRatio`, model refs) last-write-wins. `index` renumbered after merge with `renumberShots`.

Steps:
1. Pass `{ ops }` to `Storyboard.updateFieldsIfUnchanged` in `editStoryboard` and in the render tools (`render_storyboard_stills` writes one `update_shot` per shot).
2. Adapter `storyboardMergeAdapter` in `web/src/stores/storyboard/merge.ts`.
3. `useStoryboardServerSync` registers `merge`: run the engine, write the result with a store setter that does not call `pushHistory`, roll `serverRevisions[id]`.
4. Mount `ConflictBanner` in `StoryboardBoard`. Accept for `update_shot` calls the store's `updateShot` (checkpoints history).
5. Test: agent still lands on shot 2 while shot 3 action text is dirty → no conflict, still present. Agent rewrites shot 3 action → conflict, draft text kept.

## S2 Timeline

- Store: `web/src/stores/timeline/TimelineStore.ts`, per-sequence instance, `temporal()` undo.
- Sync: `web/src/hooks/timeline/useTimelineExternalSync.ts:27`.
- Write: `packages/agents/src/capabilities/timelines.ts:661`, ops are the `ui_timeline_*` names.
- Units: `tracks[]`, `clips[]`, `markers[]`, `transcript[]` by `id`. Scalars `fps`, `width`, `height`, `scriptEnabled` last-write-wins.

Steps:
1. Pass `{ ops }` to `TimelineSequence.updateDocumentIfUnchanged` in `editTimeline`, `assemble_script_timeline`, `assemble_storyboard_timeline`.
2. Adapter in `web/src/stores/timeline/merge.ts`. A clip whose `trackId` names a track deleted in the draft is `dangling`, dropped and listed.
3. `useTimelineExternalSync.merge`: apply with `temporal.getState().pause()` / `resume()` around the set so no history entry is pushed. Then `reflowGenerated`.
4. Banner in the timeline editor shell.
5. Test: `useTimelineExternalSync.test.tsx`, dirty clip trim plus external `add_text_clip` → both present, no conflict.

## S3 Sketch

- Store: `SketchSessionStore.ts` (meta, CAS) and `components/sketch/state/useSketchStore.ts` (layers, custom delta history `historySlice.ts`).
- Sync: registered at `SketchSessionStore.ts:1018`, reload via `clearHydrated` + query invalidate.
- Write: `packages/agents/src/capabilities/sketches.ts:807`, ops `add_layer, remove_layer, rename_layer, set_layer_props, reorder_layer, duplicate_layer, select_layer, resize_canvas`.
- Units: `layers[]` by `layer.id`, `layerBindings` by layer id. Pixel data is opaque: a layer whose bitmap changed on both sides is one `edited` conflict, no pixel merge. `activeLayerId` is draft-only, never merged. `resize_canvas` is a whole-document `replaced` conflict when dirty.

Steps:
1. Pass `{ ops }` in `editSketch` and in the `generate` path (one `set_layer_props` per generated layer).
2. Adapter in `web/src/stores/sketch/merge.ts`. Order is array position, so a merged layer list is: draft order, with server-only new layers inserted at their server index.
3. Merge path in `SketchSessionStore`: apply through `useSketchStore` with `skipHistory: true` on the layer set action (add the flag to `historySlice`).
4. Banner in the sketch editor shell.
5. Test in `SketchSessionStore.autosave.test.ts`: dirty brush stroke on layer A plus external `add_layer` B → both present.

## S4 Script

- Store: `web/src/stores/script/ScriptStore.ts`, `documentHistory`.
- Sync: `web/src/hooks/script/useScriptServerSync.ts:233`.
- Write: `packages/agents/src/capabilities/scripts.ts:1170`, ops `add_speaker, set_speaker, set_speaker_voice, remove_speaker, add_section, add_line, set_line_text, set_line_speaker, remove_line`; `voice_script_lines` writes one take per line.
- Units: `cast[]` by `speaker.id`, `sections[]` by `section.id`, `sections[].lines[]` by `line.id`, `line.takes[]` by `take.id`. Nested: the adapter lists `lines` as a unit collection under each section. A take added on the server to a line whose text is dirty is not a conflict: takes and text are separate fields of the unit. The engine must merge at field level inside a unit for this case, so the adapter marks `takes` as a mergeable sub-collection.

Steps:
1. Pass `{ ops }` in `editScript` and `voice_script_lines`.
2. Adapter in `web/src/stores/script/merge.ts`.
3. `useScriptServerSync.merge` sets through `withScript` with checkpoint off.
4. Banner in the script editor shell.
5. Test: user edits line 4 text while `voice_all` runs → every line gets its take, line 4 keeps the draft text and is marked `stale`.

## S5 JS script

- Store: `web/src/stores/jsScript/JsScriptStore.ts`, `documentHistory`.
- Sync: `web/src/hooks/jsScript/useJsScriptServerSync.ts:277`.
- Write: `packages/agents/src/capabilities/js-scripts.ts:443`, no op list, `save_js_script` writes a whole document.
- Units: `code` is one unit. `inputs[]`, `outputs[]` by `port.name`, `tests[]` by `test.name`. Scalars `name`, `description`, `timeoutMs`, `secrets` last-write-wins.

Steps:
1. `save_js_script` derives ops from the diff it made (`set_code`, `set_ports`, `set_meta`, `set_tests`) and passes them. This is the one capability where the ops come from a diff, because the tool takes a whole document.
2. Adapter in `web/src/stores/jsScript/merge.ts`. A dirty `code` plus external `set_code` is one `edited` conflict; the banner shows the external body in a diff view. That is the only surface where accept needs a diff, use the existing `-diff` pack's viewer or a plain two-pane.
3. Merge sets without checkpoint.
4. Banner in the JS script editor.
5. Test: dirty code plus external `set_tests` → tests merged, code kept, no conflict.

## S6 Application

- No zustand draft. Puck holds the document, `ApplicationAppBuilder.tsx` keeps the CAS token in `revisionRef`. `isDirty` is hard-coded `true` and `reload` is a no-op, so today every external write raises the conflict banner even when the user has not typed.
- Write: `packages/agents/src/capabilities/apps.ts:337`, ops are the `ui_app_*` steps.
- Units: `ui.content[]` by `props.id` (nested by `parentId` + slot), `operations[]`, `variables[]`, `resources[]` by `id`.

Steps:
1. Pass `{ ops }` in `editApp`.
2. Real `isDirty`: compare Puck's current data with the last loaded document by reference or hash. Clean → `reload` sets Puck data from the server.
3. Adapter in `web/src/components/appbuilder/merge.ts`. Apply the merged document with Puck's `dispatch({ type: "setData" })`, which does not create a history entry in Puck; verify against the Puck version in use.
4. Replace `setConflict("external")` with the shared banner.
5. Test in `ApplicationAppBuilder.test.tsx`: clean editor reloads, dirty widget label plus external `add_component` → both present.

## S7 Workflow graph

- Store: `web/src/stores/NodeStore.ts` per workflow, `temporal()` undo, explicit `workflowIsDirty`.
- Reload path is separate: `workflowResourceReloader` → `WorkflowManagerStore.refreshWorkflow:620`, bails when dirty.
- Write: `packages/agents/src/capabilities/ui.ts:122` and `workflows.ts` (`:275`, `:435`, `:490`), ops `ui_add_node, ui_connect_nodes, ui_update_node_data, ui_delete_node, ui_delete_edge, ui_move_node, ui_set_node_title`.
- Units: `nodes[]` by `id` with fields `data`, `ui_properties.position`, `title`; `edges[]` by `id`. An edge whose `source` or `target` is not in the merged nodes is `dangling`, dropped and listed. `ui_move_node` touches only `position`, so a moved node with dirty `data` is not a conflict: the adapter marks `position`, `data`, `title` as separate fields of the unit.

Steps:
1. Pass `{ ops }` in `ui.ts` and the three `workflows.ts` writes.
2. Adapter in `web/src/stores/workflowMerge.ts`.
3. `refreshWorkflow`: when dirty and `resource.ops` present, merge instead of bail. Apply with `temporal.pause()`, set `workflowIsDirty` unchanged, roll `etag` and `updated_at`.
4. Banner in the editor shell. Accept for a node runs `updateNodeData` (history on).
5. Test in `WorkflowManagerStore.save.test.ts`: dirty node data plus external `ui_add_node` + `ui_connect_nodes` to a node the draft deleted → new node present, edge dropped and listed.

## Order and size

| Slice | LOC estimate | Depends on |
|---|---|---|
| S0 | 600 | — |
| S1 storyboard | 250 | S0 |
| S2 timeline | 300 | S0 |
| S3 sketch | 350 | S0 |
| S4 script | 300 | S0, field-level merge in S0.2 |
| S5 JS script | 250 | S0, diff view |
| S6 application | 400 | S0, Puck dirty detection |
| S7 workflow | 350 | S0 |

Each slice is one PR. S0 ships with S1 in the same PR if a standalone S0 has no consumer.

## Not in scope

- Text merge inside one field. A field is one value.
- Pixel merge in sketch layers.
- Presence or cursors.
- Locks.
