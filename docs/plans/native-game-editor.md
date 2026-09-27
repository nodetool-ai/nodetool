# Native game editor: assistant, drafts, and direct editing

## Purpose

Make the native game surface an agent-first editor. The assistant does the
large changes: it builds scenes, writes scripts, and generates art. The user
reviews those changes and makes precise edits directly in the viewport and
the inspector.

This plan covers five parts:

| Part | Deliverable |
|---|---|
| A1 | Assistant panel and the agent tools it needs |
| A2 | A mutable draft with reviewable agent changes |
| A3 | Direct editing in the viewport |
| A4 | An inspector generated from the game schema |
| A7 | A script editor |

The asset panel (A5), replay and debug tools (A6), and preview and share (A8)
are later work. They build on this plan without changing it.

The base is `codex/native-game-artistic-features`, which has schema version 2
(effect chain, lighting, backgrounds, visual tracks, music, fonts). Keep the
engine contracts in the [engine design](builtin-game-engine-design.md) and the
[artistic roadmap](native-game-artistic-roadmap.md). Visual edits never change
simulation determinism.

## Starting points

| Finding | Current implementation | Consequence |
|---|---|---|
| F1 | `web/src/components/workspace/GameSurface.tsx` is one component. Its inspector edits only `transform2d.x` and `y`. "Save scene" publishes a new immutable revision on every save. | Each small edit makes a revision. Most of the document cannot be edited in the UI. |
| F2 | `GameSurface.tsx` hard-codes `KEY_ACTIONS` with the arrows and WASD. `packages/game-renderer/src/standalone-player.ts` also maps `Space`. | An action that uses `space` works in the export but not in the editor. |
| F3 | `packages/agents/src/capabilities/game.ts` has create, get, publish (whole document), install, playtest, and build. Playtest reads only published revisions and stops at `MAX_PLAYTEST_TICKS = 600` (10 s). No tool returns an image. | The agent sends the full document for each edit, cannot test unpublished work, and cannot see the game. |
| F4 | `install_native_game_asset` and `games.installCandidate` map audio to `.wav` and images to `.png`. The build's `MEDIA_EXTENSIONS` has no font types. | Code reading shows that the agent path cannot install MP3 music or JPEG backdrops, and a build can omit installed fonts. This is not reproduced yet. S8 reproduces it first. |
| F5 | `Game.publish` (`packages/models/src/game.ts`) calls `ModelObserver.notify` without ops. `SyncedDocumentType` in `web/src/stores/documentSync.ts` has no game type. | An open editor does not merge external game edits. |
| F6 | `UiSurfaceType` and `ChatSource` (`packages/protocol/src/api-types.ts`) have no game entries. `UiContext.selection` has no entity ids. | The agent does not know which game or entity the user is looking at. |
| F7 | `validateGame` returns strings. Most strings start with a path such as `scenes.0.backgrounds.1.assetId:`, but not all of them. | The UI cannot put an error next to its field reliably. |

Parts that already exist and that this plan reuses:

- `AssistantChatPanel` and `ResizableSideDock` (`web/src/components/chat/assistant/`), as used by `JsScriptAgentPanel`.
- The three-way merge engine `web/src/stores/documentMerge.ts`, `ConflictStore`, and the `merge` hook in `documentSync.ts` ([document sync plan](../document-sync-plan.md)).
- `persistOutput` (`packages/agents/src/tools/asset-persist.ts`), the `imageHandle` shape, and `composeContactSheet` (`packages/agents/src/timeline-preview/sheet.ts`). With these, `preview_timeline_frame` returns images that the agent reads with `view_image`.
- `captureGameFrame` with `backend: "webgpu"` (`packages/game-renderer/src/node.ts`), which applies the effect chain in headless capture.
- `web/src/stores/temporal.ts` for undo history, and Monaco (`@monaco-editor/react`), which `JsScriptEditorPane` already uses.

## Decisions

| Decision | Contract | Reason |
|---|---|---|
| D1 | Each game has one mutable draft and immutable published revisions. Autosave and agent edits write the draft. Only "Publish" creates a revision. | Autosave must not create a revision for each change. The other editors use the same model: a document plus versions. |
| D2 | The agent edits through one server capability, `edit_native_game`, with an ordered op list. There are no `ui_game_*` frontend edit tools. | Edits then work headless (CLI, evals, closed editor), as for storyboard, sketch, and timeline. The ops also feed the merge engine. |
| D3 | One pure op reducer, `applyGameOps(document, ops)`, lives in `@nodetool-ai/game-runtime`. The capability, the web draft store, and the eval bridge all call it. | Agent edits and UI edits then have the same meaning, and one test suite covers both. |
| D4 | The agent sees the game only through rendered frames. The capture tool returns image handles, and `view_image` shows the pixels. | Text state cannot show visual defects. The showcase games found every visual bug through captures. |
| D5 | The server logs each draft write with its actor and chat turn. The UI groups agent writes into change cards. "Undo" on a card reverses that turn through the three-way merge. | The user can reverse one agent turn without losing later edits by hand. |
| D6 | Edit mode shows the authored state at tick 0 through an editor camera. Play mode runs a session from a copy of the draft. Stop discards the session. | The simulation never writes into the draft, so a play session cannot corrupt authored data. |
| D7 | The inspector is generated from the Zod schemas through `z.toJSONSchema`, with a small table of widget overrides. | New engine fields then appear in the inspector without a new form. |
| D8 | Scripts stay function expressions. Editor typings come from the script command schema, and a test detects drift. | The script contract in `packages/game-runtime/src/scripts.ts` does not change. |

## A1: Assistant panel and agent tools

### A1.1 Register the surface

1. Add `"game"` to `UiSurfaceType`, and add `game: "native game"` to `UI_SURFACE_LABELS` in `packages/websocket/src/session/chat-prompt.ts`.
2. Add `"game_assistant"` to `ChatSource` and to `CHAT_SOURCE_LABELS`.
3. Add `entity_ids` to `UiContext.selection`. The prompt formatter already prints each selection key.
4. In `formatUiContext`, add a game block like the timeline block. It tells the agent to:
   - call `get_native_game` with `view: "outline"` first;
   - edit with `edit_native_game`;
   - look at the result with `capture_native_game_frame` before it reports a visual change as done;
   - leave publishing to the user unless the user asks.

### A1.2 Panel

1. Add `web/src/components/game/GameAgentPanel.tsx`, modeled on `JsScriptAgentPanel`:
   - `chatSource: "game_assistant"`;
   - `focused: { type: "game", id, title }`;
   - `getSelection` returns `{ entity_ids }` from the editor selection.
2. Add `gameAssistantPrompt(gameId)` in `web/src/components/game/gameAssistantPrompt.ts`. It states the loop (outline, edit, capture, playtest) and the script contract. It links to the `native-game` skill and does not repeat it.
3. Dock the panel with `ResizableSideDock` (`storageKey: "game_assistant"`). On mobile, show it in `MobileBottomSheet`, as in `SketchEditor`.
4. Welcome examples: "Add a boss that appears at wave 5", "Make the forest darker and add fog", "Why does the player pass through this wall?"

### A1.3 Read the game compactly

Extend `get_native_game`:

| Argument | Values | Default |
|---|---|---|
| `source` | `"draft"` or `"revision"` | `"draft"` |
| `revision` | a full revision (with `source: "revision"`) | current |
| `view` | `"outline"`, `"full"`, or `"entity"` | `"outline"` |
| `entity_id` | required with `view: "entity"` | none |

`view: "outline"` returns:
- the game settings;
- for each scene, its backgrounds, lights, music, and a list of entities (id, name, parent, components present, behavior kinds, script byte size);
- the asset slots with kind and size.

It does not return script sources or tile arrays. The showcase documents are mostly script source, so the outline keeps a read small. `view: "entity"` returns one entity in full. The response always includes `draft_updated_at` for compare-and-swap.

### A1.4 Edit with ops

`edit_native_game { game_id, base_updated_at?, ops[] }` applies all ops to the draft, validates the result, and writes it atomically. When validation fails, it writes nothing and returns each issue with its op index and path (A4.5). When the caller omits `base_updated_at`, the tool uses the current draft and retries once on a conflict, as in the [document sync plan](../document-sync-plan.md#s06-agent-cas-retry).

An entity target is `{ entity_id, scene_id? }`. `scene_id` is required only when the id occurs in more than one scene.

| Op | Arguments | Effect |
|---|---|---|
| `add_entity` | `scene_id`, `entity` (partial), `index?` | Adds an entity. Missing fields get schema defaults. |
| `update_entity` | target, `set` | Deep-merges fields into the entity. A `null` component removes it. |
| `remove_entity` | target, `children?: "remove" \| "reparent"` | Removes the entity. Rejects the op if a behavior still references it. |
| `duplicate_entity` | target, `new_id`, `offset?` | Copies the entity and moves the copy by `offset`. |
| `add_behavior` / `update_behavior` / `remove_behavior` / `move_behavior` | target, `index`, `behavior` | Edits the behavior list. |
| `set_script` | target, `index`, `source`, `max_commands?`, `max_tick_ms?` | Replaces a script's source. |
| `add_scene` / `update_scene` / `remove_scene` | `scene_id`, fields | Edits name and music. `remove_scene` rejects the op if a transition still references the scene. |
| `set_lighting` | `scene_id`, `lighting` or `null` | Replaces the scene's lighting as one value. |
| `add_light` / `update_light` / `remove_light` | `scene_id`, `index`, fields | Edits one point light. |
| `add_background` / `update_background` / `remove_background` / `move_background` | `scene_id`, `id`, fields | Edits background layers by id. |
| `set_effects` | `effects`, `hud_effect_order?` | Replaces the effect chain. |
| `set_game` | `pixels_per_unit?`, `input_actions?`, `entry_scene_id?` | Edits the game settings. |
| `bind_asset` / `unbind_asset` | `slot`, `binding` | Binds an installed asset to a slot, or removes the binding. `unbind_asset` rejects the op if something still references the slot. |

The reducer lives in `packages/game-runtime/src/document-ops.ts`, with tests for every op, for rejection paths, and for a list of 1,000 ops, which checks for accidental quadratic work.

### A1.5 See the game

`capture_native_game_frame`:

| Argument | Meaning |
|---|---|
| `game_id`, `source`, `revision?` | What to render. The default is the draft. |
| `ticks` | Up to 8 ticks. The default is `[0]`. |
| `inputs` | Run-length input, for example `[{ pressed: ["right"], ticks: 30 }]` |
| `seed` | The simulation seed. The default is 1. |
| `camera?` | `{ x, y, zoom }` to override the game camera |
| `overlays?` | Any of `colliders`, `ids`, `lights`, `camera_bounds` |
| `scale?`, `sheet?` | Output scale, and a single contact sheet in place of separate images |

1. Run the session to each tick, and capture with `backend: "webgpu"` when the game has effects.
2. When WebGPU is unavailable, fall back to Canvas2D and return the diagnostic.
3. Return one `imageHandle` for each frame. Each frame also lists the visible entities with their screen boxes, the HUD texts, and the capture diagnostics.
4. Draw the overlays in a pass after the capture, so they never enter the game pixels.

### A1.6 Playtest the draft

Extend `playtest_native_game`:

1. Add `source: "draft"` and use it as the default.
2. Accept run-length `inputs` and raise the limit to 3,600 ticks (60 s). A run still stops at a wall-time budget, and the budget is reported.
3. Add `assertions`, for example `{ at_tick, entity_id, near: { x, y, tolerance } }`, `{ event: "win", before_tick }`, and `{ no_script_errors: true }`. Return each failed assertion with the state it saw.
4. Add `capture_ticks`, which reuses A1.5 and returns image handles.
5. Return a contact summary with counts per entity pair and phase, in place of the first 50 raw events.

### A1.7 Generate and install an asset

`generate_game_asset { game_id, slot, kind: "image" | "audio" | "music", prompt, reference_slot?, preparation?, provider?, model? }`:

1. Generate through the existing media paths (`generate_image`, `generate_speech`, `generate_music`). Use a background receipt when the model is slow.
2. Prepare the bytes with the binding's `preparation` settings, then compute the digest.
3. Stage the candidate, install it, and bind it to the draft slot.
4. Record `referenceAssetId` and provenance as the artistic roadmap (A2) specifies.
5. Fix F4 in the same slice. Install keeps the source format (png, jpg, webp, wav, mp3, ogg, ttf, otf), and the build accepts fonts. The reproduction test comes first.

### A1.8 Publish from the draft

`publish_native_game { game_id, base_revision, message? }` without `document` publishes the current draft. The `document` form stays for compatibility. The tool description says to publish only when the user asks.

### A1.9 Registration and guidance

Update the following:
- `game.specs.ts` and `packages/agents/src/capabilities/registry.ts`;
- `packages/cli/src/harness/capability-table.ts` and `packages/websocket/src/trpc/sandbox-coverage.ts`;
- `packages/system-skills/native-game/SKILL.md`;
- the [native game pipeline](../harnesses.md#native-game-pipeline-templates-staging-playtest-web-build) section.

Add an eval surface, `packages/agents/src/evals/surfaces/game.ts`. It calls the real reducer (D3), so the eval tests real edit semantics.

### A1 acceptance

- A1.a: The prompt names the focused game and the selected entity ids.
- A1.b: An agent turn that adds an entity and captures tick 0 returns an image that shows the new sprite.
- A1.c: An invalid op list writes nothing, and the tool returns the op index and path for each issue.
- A1.d: The Lumen showcase document passes a draft playtest with `{ event: "win", before_tick: 1500 }`.

## A2: Draft and change review

### A2.1 Persistence

1. Add the columns `draft_updated_at` and `draft_base_revision` to `games`, with a migration. Store the draft at `games/<id>/draft.json` through the workspace interface. A game without a draft file reads its current revision as the draft.
2. Add `Game.updateDraft(user, id, expectedUpdatedAt, ops)`, which does a compare-and-swap on `draft_updated_at`. It calls `ModelObserver.notify(game, UPDATED, { ops })`, so `resource_change` carries the ops.
3. Add `games.getDraft` and `games.saveDraft({ id, baseUpdatedAt, ops })` to `packages/websocket/src/trpc/routers/games.ts`. The web saves ops, not whole documents, so the server log (A2.4) is the same for both actors.
4. `games.publish` takes the draft when no document is given. It sets `draft_base_revision` to the new revision.

### A2.2 Merge into an open editor

1. Add `"game"` to `SyncedDocumentType`, and route it in `resourceChangeHandler.ts`.
2. Add a merge adapter, `web/src/stores/game/merge.ts`, with these units:

| Unit | Key | Rule |
|---|---|---|
| Scene | `scene.id` | The scalars `name` and `music` are last-write-wins. |
| Entity | `(scene.id, entity.id)` | The fields `transform2d`, each component, and `behaviors` are separate fields of the unit. A move and a sprite change do not conflict. |
| Script | `(scene, entity, behavior index)` | One value, never merged as text. |
| Background | `(scene.id, layer.id)` | One unit for each layer. |
| Lighting | `scene.id` | One unit, because point lights have no ids. |
| Asset binding | slot | One unit for each slot. |
| Effects | the document | One unit. |
| Game settings | the document | Last-write-wins for each field. |

3. An entity whose `parentId` names an entity that the draft deleted is `dangling`. The merge drops it and lists it.

### A2.3 Web draft store

1. Add `web/src/stores/game/GameDraftStore.ts` (Zustand with `temporal()` undo, one instance for each game).
2. Every UI edit calls `applyGameOps` and queues the ops for autosave, with a 500 ms debounce.
3. A drag or a text entry becomes one history entry.
4. The store registers with `registerDocumentSync("game", id, { reload, merge, isDirty, localRevision })`. It applies merged results with history paused, as the timeline slice does.

### A2.4 Change log

1. Add a table, `game_draft_changes (id, game_id, actor, thread_id, message_id, ops, summary, before_updated_at, created_at)`.
2. `edit_native_game` writes `actor: "agent"` with the chat thread and message ids from the run context. `saveDraft` writes `actor: "user"`.
3. Keep the most recent 500 rows for each game, and delete rows older than the current revision after a publish.
4. The server computes `summary` from the ops, for example "Added 2 entities; changed the script on wisp; moved 3 lights".

### A2.5 Change cards

1. Show a "Changes" list above the viewport, with one card for each agent message since the last publish. Each card shows the summary and the affected entities. Hover highlights the entities in the viewport.
2. "Undo" on a card runs the merge engine with these inputs:
   - `base` is the draft after the turn;
   - `draft` is the current draft;
   - `server` is the draft before the turn.

   The result reverts the agent's units. A unit that the user edited after the turn stays, and the result lists it as a conflict. The undo is a normal user edit, so it goes through autosave and lands in history.
3. Snapshots for undo: before each agent write, store the previous draft at `games/<id>/drafts/<sha256>.json`. Delete snapshots together with their change rows.
4. The tool-call view in the chat links to the card.

### A2.6 Publish

1. The toolbar shows "Unpublished changes" with a count.
2. "Publish" opens a dialog with the change summaries since the last revision and an optional message.
3. The revision list replaces the current "Revisions" column. It shows the message, the time, and "Restore to draft". A restore writes that revision into the draft and does not publish it.

### A2.7 A draft change during play

1. In edit mode, a draft change rebuilds the tick 0 frame after a 100 ms debounce.
2. In play mode, a change to an asset binding updates the art at the next tick boundary, as engine design D1 allows. Any other change shows "The draft changed. Restart to apply." It does not restart the session without the user.

### A2 acceptance

- A2.a: A hundred inspector edits in one minute create no revisions.
- A2.b: The agent moves entity A while the user edits entity B. Both edits stay, with no conflict.
- A2.c: The agent rewrites a script while the user has unsaved edits in the same script. The draft keeps the user's text, and the conflict banner shows the agent's version.
- A2.d: "Undo" on an agent card reverts only that turn's units. A unit that the user edited later stays and shows a conflict.

## A3: Viewport editing

### A3.1 Structure

Split `GameSurface.tsx` into `web/src/components/game/`:
- `GameEditor` (layout and mode);
- `GameViewport` (canvas and overlay);
- `GameSceneTree`;
- `GameInspector` (A4);
- `GameScriptPane` (A7);
- `GameToolbar`;
- `useGamePlaySession` (the current session, audio, and font code, unchanged in behavior).

`TabContent.tsx` keeps loading one lazy component.

### A3.2 Modes and camera

1. Edit mode renders `session.frame()` from a fresh session at tick 0, with an editor camera `{ x, y, zoom }` and a free viewport size. The frame is data, so the override replaces `camera`, `width`, and `height` before `render`.
2. Pan with space-drag or the middle mouse button, and zoom with the wheel toward the pointer.
3. "F" frames the selection. "Home" returns to the game camera.
4. Play mode runs the draft copy with the game camera (D6). Pause shows the runtime entities. Selecting a runtime entity shows its `session.inspect()` state as read-only.
5. Move the key map into one shared module in `@nodetool-ai/game-renderer`, which both players use. This fixes F2.

### A3.3 Overlay and picking

1. Draw an HTML canvas above the game canvas. It uses the same world-to-screen transform as the renderer (`projectedCamera` and pixels per unit), exported from `packages/game-renderer/src/frame.ts`.
2. Picking uses `frame.sprites` (entity id, box, rotation, layer), and the topmost layer wins. Entities without a sprite (colliders, cameras, empty parents) show small icons, which can also be selected.
3. Alt-click cycles through the stacked entities under the pointer.
4. Overlays, each with a toggle:
   - selection boxes;
   - collider outlines, in a color for each collision category;
   - the camera bounds;
   - point lights, drawn as a dot with a radius ring;
   - background layer origins;
   - a grid.

### A3.4 Gizmos and commands

| Input | Result |
|---|---|
| Drag the selection | Move. Snaps to the grid (default 0.25 units, toggle "G"). Shift locks the axis. |
| Drag a corner handle | Scale `scaleX` and `scaleY`. Shift keeps the aspect ratio. |
| Drag the rotation handle | Rotate. Shift snaps to 15 degrees. |
| Drag a light dot or its ring | Move the light, or change its radius. |
| Arrow keys | Nudge by one grid step. Shift nudges by ten. |
| Marquee, shift-click | Multi-select. |
| Delete, Cmd+D, Cmd+C/V | Remove, duplicate, copy, paste (as `add_entity` ops with new ids). |
| Cmd+Z, Shift+Cmd+Z | Undo and redo in the draft store. |

Every gizmo commits `update_entity` or light ops at the end of the drag. During the drag, only the overlay and a local frame override update, so the drag does not rebuild the session.

### A3.5 Scene tree

The scene tree shows the scenes, with their entities under each scene:
- nested by `parentId`, with drag-to-reparent and reorder;
- `templateOnly` entities in a "Prefabs" group;
- search by name or id;
- a "+" menu with presets: sprite, static wall, collectible, trigger, camera, empty.

Selection is shared between the tree, the viewport, and the assistant (`entity_ids`).

### A3 acceptance

- A3.a: Drag, scale, and rotate each produce one undo entry and one autosave, and a capture shows the same result.
- A3.b: Picking is correct for rotated sprites and at zoom levels 0.25 and 4.
- A3.c: An action mapped to `Space` works in the editor and in the export.
- A3.d: Play, then Stop, leaves the draft byte for byte unchanged.

## A4: Inspector

### A4.1 Generation

`web/src/components/game/inspector/schemaForm.ts` converts `gameEntity`, `gameScene`, and the game-level fields with `z.toJSONSchema`. It renders them with `ui_primitives` fields:
- numbers use `NumberInput`;
- enums use `Select`;
- booleans use `Switch`;
- objects use collapsible sections;
- arrays use lists with add, remove, and reorder.

Defaults come from the schema.

### A4.2 Widget overrides

| Path pattern | Widget |
|---|---|
| Any `#rrggbb` string | Color picker |
| `*.assetId` | Slot picker, filtered by media kind (image for sprites, backgrounds, and LUTs, audio for music and sources, font for HUD) |
| `collider2d.category`, `collider2d.mask` | 32-bit checkbox grid with category names |
| `visualAnimation.tracks[]` | Track row with property, from/to, timing, easing, and a small curve preview |
| `behaviors[]` with `kind: "script"` | Summary row with "Edit script" (A7) |
| `transform2d.rotation` | Degree input that stores radians |
| `renderEffects[]` | Ordered list with an "Add effect" menu (bloom, LUT, brightness and contrast) |

### A4.3 Sections

1. With an entity selected, the inspector shows:
   - identity (id, name, parent, prefab flag);
   - Transform;
   - one section for each component, with an "Add component" menu of the absent components;
   - Behaviors, with an "Add behavior" menu for each kind.
2. With nothing selected, it shows the scene: name, music, lighting (ambient and the light list), and backgrounds.
3. A "Game" tab shows pixels per unit, input actions, entry scene, effects, and HUD effect order.
4. Each field change becomes one reducer op (A1.4), so UI edits and agent edits share the same log.

### A4.4 Collision category names

Add an optional `collisionLayers: string[]` (at most 32 entries) to the schema 2 document. It is additive and needs no version change. The grid shows these names, and bit numbers when a name is absent. The agent sets the names through `set_game`. This is the only schema addition in this plan, and question Q2 asks whether to include it.

### A4.5 Validation

1. Change `validateGame` to return `issues: { path: (string | number)[]; message: string }[]` and to keep `errors` as formatted strings for compatibility.
2. Field errors come from the Zod parse, and reference errors come from `validateGame` (unknown slot, missing prefab or scene, LUT dimensions).
3. The inspector shows each issue under its field. The scene tree marks entities that have issues.
4. Autosave writes a draft only when it validates. The store keeps a field that is not valid as local state until the user fixes it.

### A4 acceptance

- A4.a: Each component and behavior in `game.ts` can be added, edited, and removed without JSON.
- A4.b: A new optional schema field appears in the inspector without a change to the inspector code (a test adds a field to a fixture schema).
- A4.c: A LUT with the wrong dimensions shows the error under `assetId` of that effect.

## A7: Script editor

### A7.1 Pane

1. "Edit script" opens `GameScriptPane`, which is a Monaco editor. It is a bottom split below the viewport on desktop and a full sheet on mobile.
2. One tab for each open script shows the entity and the behavior index.
3. Edits go to the draft store as `set_script` ops after a 500 ms debounce, with one undo entry for each pause.

### A7.2 Typings

1. Export `GAME_SCRIPT_TYPES` (a `.d.ts` string) from `packages/game-runtime/src/script-types.ts`. It declares the argument object (`tick`, `pressed`, `justPressed`, `events`, `entity`, `world`, `state`, `random`) and the return type `{ state, commands }`, with each command kind from `scripts.ts`.
2. A test checks that the command kinds in the `.d.ts` match the Zod `command` union, so the typings cannot drift (D8).
3. Monaco gets the typings as an extra lib. It checks the source as a function expression with JSDoc type checks enabled.

### A7.3 Limits and errors

1. The status bar shows the source size against 16 KiB, and `maxCommands` and `maxTickMs` for the behavior.
2. The scene tree marks the entities of a script that fails to prepare ("could not be prepared" or "Source must be a function expression").
3. A play session that stops with a script error at tick N shows the error in the pane, with the tick and the entity id. "Replay to tick N − 1" restarts the session with the recorded input and pauses before the error.
4. "Run 10 s" runs the draft headless in the browser with no input. It shows the script call time for each entity and the first error.

### A7.4 Assistant link

1. A selection in the pane sends `entity_ids` and the behavior index with the next chat message.
2. "Ask the assistant" on an error puts the error text, the tick, and the script key in the composer.

### A7 acceptance

- A7.a: A wrong command kind shows a type error in Monaco, and a test proves that the typings match the runtime schema.
- A7.b: A script that throws at tick 120 shows the error at tick 120 in the pane, and the replay pauses at tick 119.
- A7.c: The agent's `set_script` updates an open, clean pane at once. For an open pane with unsaved edits, it produces a conflict (A2.c).

## Delivery order

| Slice | Content | Depends on |
|---|---|---|
| S1 | Split `GameSurface` (A3.1), shared key map (A3.2 step 5) | none |
| S2 | Op reducer (A1.4 reducer), draft persistence and routes (A2.1), `edit_native_game`, `get_native_game` views (A1.3), `publish` from draft (A1.8) | none |
| S3 | Web draft store, sync and merge adapter (A2.2, A2.3) | S1, S2 |
| S4 | Assistant panel and prompt (A1.1, A1.2), capture tool (A1.5), draft playtest (A1.6), registration and skill (A1.9) | S2 |
| S5 | Change log and cards, publish dialog, revision list (A2.4 to A2.7) | S3, S4 |
| S6 | Viewport editing and scene tree (A3.2 to A3.5) | S3 |
| S7 | Inspector and structured validation (A4) | S3 |
| S8 | `generate_game_asset` and the F4 media fixes (A1.7) | S2 |
| S9 | Script editor (A7) | S7 |

Each slice is one PR. S2 and S4 give the agent a useful loop before any UI work. S6, S7, and S8 can go in parallel after S3.

## Verification

- Each slice runs the [mandatory checks](../../AGENTS.md).
- Reducer and merge: unit tests for each op and each merge rule, plus a test with 1,000 entities.
- Capture: a test in `packages/agents` renders a fixture draft with an overlay and checks a known pixel. WebGPU tests need the Vulkan ICD, as the renderer suite does.
- Web: component tests for the gizmos (drag to ops), the inspector generation (A4.b), and the change cards (A2.d). Run only the related Jest suites.
- End to end: one Playwright test opens a game, sends an assistant message against a mocked provider, sees a card, undoes it, and publishes.
- The showcase games in `~/workspace/nodetool-games` are a manual regression. Import both as drafts, edit them in the UI, and compare captures before and after.

## Risks

| Risk | Effect | Mitigation |
|---|---|---|
| R1 | Server capture with WebGPU is slow or unavailable on some hosts. | Fall back to Canvas2D with a diagnostic. Cache the GPU device for each process. Limit a call to 8 frames. |
| R2 | Large documents fill the agent context. | The outline view is the default. Scripts are read one at a time. |
| R3 | Point lights have no ids, so the merge treats all lighting in a scene as one unit. | Accept this for now. Add light ids in a later schema change if conflicts occur in real use. |
| R4 | Draft snapshots and change rows grow without limit. | Cap the rows for each game, and delete them after a publish. |
| R5 | Editor-camera frames differ from game-camera frames in culling. | Pass the overscan to `visibleItems`, as capture already does. |

## Not in scope

- The asset panel (A5), replay scrubbing and debug overlays beyond A3.3 (A6), and the phone preview and share (A8).
- Tile painting for `tilemap`.
- Presence, cursors, and simultaneous editing by several users.
- 3D scenes.

## Questions

| Question | Recommendation |
|---|---|
| Q1. When the editor is closed, should agent edits still go to the draft, or publish directly? | Use the draft always. Direct publishing hides changes from review. |
| Q2. Add `collisionLayers` names to the schema (A4.4)? | Yes. The mask grid cannot be understood without names. |
| Q3. Should installing an asset still publish a revision, as it does today? | No. Installing binds the asset in the draft, and "Publish" makes the revision. |
