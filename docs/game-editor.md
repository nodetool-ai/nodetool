---
layout: page
title: "Game Editor"
description: "Build, play, publish, and export 2D and 3D games in NodeTool's built-in engine."
---

Build a game in a workspace tab, play it without leaving the editor, and ask the agent to change it.

> **Quick access:** Click **+ New** in the workspace tab bar and choose **Game** under **Guided flows**. The new game opens as a tab and is playable at once.

---

## Overview

The Game Editor edits one game document. The built-in engine simulates it, renders it, and exports it as a standalone web player. A game is either 2D or 3D, and it keeps that dimension for its whole life.

A game document holds:

- **Scenes.** Each game has an entry scene, and scenes can switch to each other during play.
- **Entities.** Each scene lists entities. An entity has a transform and optional components such as a sprite, body, collider, camera, or light.
- **Behaviors.** Built-in behaviors such as movement, patrol, and collectible, plus JavaScript scripts.
- **Assets.** Named slots bound to images, audio, fonts, and in 3D, models.
- **Input actions.** The names scripts and behaviors read, such as `left` and `jump`.

You edit the game as a draft. The draft saves automatically about half a second after each change. **Publish** turns the draft into an immutable revision.

| | 2D | 3D |
|---|---|---|
| Space | Top-down or side-view, in world units | Meters, Y up, forward is -Z |
| Starter | A top-down room with a player, a gem, and four walls | An exploration level with a capsule player, ramp, moving platform, crate, door, checkpoint, and goal |
| Viewport | Canvas with selection, move, scale, and rotate handles | Orbit camera with a Move, Rotate, and Scale gizmo |
| Rendering | Canvas 2D, or WebGPU when the game uses GPU effects | WebGL2 |
| Physics | 2D bodies and colliders, tilemaps, one-way platforms | 3D bodies, colliders, a character controller, a follow camera |

---

## Start a game

### From a guided flow

**+ New** in the tab bar lists the guided flows. **Game** creates a 2D game named "Untitled game" in the selected project and opens it. The 3D choice is not in this menu.

### From the new-project screen

The new-project screen has a **Start with a guided flow** row. The **Game** card appears after you choose **More formats**. Beside it, **Game card starts as** picks **2D game** or **3D exploration**. The text in the prompt box names the game. It is not sent to the agent. If the box is empty the game is called "New game".

### From an example

Open the Examples page from the logo menu and choose the **Games** tab. Each card shows a poster, a description, and the controls. **Play and edit** copies the game and its media into your current project and opens it.

| Example | Dimension | Summary |
|---|---|---|
| Kindle | 2D | A platformer through a drowned temple |
| Lumen | 2D | Fly a firefly through a night forest |
| Neon Drift | 2D | An arena shooter with waves |
| AETHER // Skybound | 3D | Floating platforms and lasers |
| BLACKSITE | 3D | A first-person mission with drones |

The server reads example games from `*.game.json` files. Set `NODETOOL_EXAMPLE_GAMES_DIR` to point it at another folder. A folder that does not exist yields no examples. See [Configuration](configuration.md).

### From the agent

Ask the agent in chat to create a game. It calls `create_native_game` with a project, a name, and a dimension. For 3D it can pass `template: "exploration"`. See [Ask the agent](#ask-the-agent).

There is no blank-game entry. Every new game starts from a playable starter, so you delete or replace what you do not need.

---

## Editor layout

The editor is a toolbar over three docks and a viewport. Drag the edge of a dock to resize it.

| Area | What it does |
|---|---|
| Toolbar | Play controls, **Publish**, panel toggles, save status, and a live readout of tick, score, win state, and renderer |
| Scene tree (left) | The scenes and entities of the game |
| Viewport (center) | The game canvas, where you select and move entities |
| Inspector (right) | Properties of the selected entity, scene, or game |
| Assistant (right) | The agent chat for this game |
| Script pane (bottom) | A code editor, open while you edit a script |

The toolbar buttons are **Play**, **Play in new tab**, **Stop**, **Step**, **Save play state**, **Load play state**, **Publish**, a scene tree toggle, an inspector toggle, and **Show assistant**. The status text reads **Draft saved**, **Saving draft**, **Unsaved changes**, or **Draft not saved**.

Under the toolbar, the editor can also show:

- A **Changes** list of edits the agent made, with **View in chat** and **Undo** for each group.
- A **Retained construction** section when a game was generated from a construction program. See [Rebuild a generated game](#rebuild-a-generated-game).
- A conflict banner when the draft changed somewhere else, for example from the agent or another tab. Accept or discard each conflicting unit.

On a narrow screen the 2D editor stacks the scene tree and inspector under the viewport and opens the assistant as a bottom sheet. The 3D editor keeps its docks.

---

## Edit scenes and objects

### 2D

**Scene tree.** Each scene lists its entities in a group named **Entities**. A second group named **Prefabs** appears when the scene has entities marked prefab-only, which scripts and the `spawn` behavior instantiate at run time. The search box filters by entity name or ID.

- Select an entity with a click. Shift-click or Ctrl-click or Cmd-click adds to the selection.
- Drag an entity onto another to nest it, or between rows to reorder it. Alt+arrow keys do the same from the keyboard.
- The **+** beside a scene adds an entity: **Sprite**, **Static wall**, **Collectible**, **Trigger**, **Camera**, or **Empty**. **Sprite** is disabled until the game has an image asset.

**Viewport.** Click a sprite to select it, or drag on empty space to box-select. Drag a selected entity to move it. Handles on a selected sprite scale and rotate it, and Shift constrains the change. Alt-click cycles through overlapping sprites.

| Action | Control |
|---|---|
| Pan | Right or middle drag, hold Space and drag, or turn on **Pan** |
| Zoom | Mouse wheel. On a Mac, pinch or Ctrl+scroll |
| Reset camera | Home |
| Frame the selection | F |
| Nudge | Arrow keys move 0.25 units, Shift+arrow moves 2.5 |
| Copy, paste, duplicate | Ctrl or Cmd with C, V, D |
| Delete | Delete or Backspace |
| Undo, redo | Ctrl or Cmd with Z, and with Shift for redo |

Keyboard shortcuts work while the viewport has focus. The overlay buttons **Selection**, **Grid**, **Snap**, **Colliders**, **Lights**, **Backgrounds**, and **Camera** turn the matching overlay on or off. G toggles snap.

**Inspector.** It has two tabs.

- **Entity** (or **Scene** when nothing is selected) shows the selection. For an entity it lists name, parent, **Prefab only**, **Transform**, and each component present. **Add component** offers Sprite, Tilemap, Camera 2D, Body 2D, Collider 2D, Animator, Visual animation, Audio source, and Light 2D. **Add behavior** offers Movement, Patrol, Collectible, Health, Trigger, Spawn, Scene transition, Win when collected, Lifetime, and Script. A scene tab edits its name, music, lighting, and backgrounds.
- **Game** edits pixels per unit, the entry scene, input actions, collision layer names, render effects (bloom, LUT, brightness and contrast), and asset bindings.

Fields that fail validation show their error beside the field. The scene tree marks an entity with a validation error or a script error in red.

**Revisions.** The scene tree dock has a collapsed **Revisions** section. It lists the 10 most recent revisions. **Restore to draft** loads one into the draft without changing the published history.

### 3D

**Scene tree.** A **Scene** selector switches scenes. The list below it is flat. A child shows an arrow, and a character or camera shows a tag. **Add box**, **Add sphere**, and **Add light** create a primitive with a static body and matching collider, or a point light.

**Model assets.** The collapsed **Model assets** section binds a 3D model. Enter an owned model asset ID and a slot name, then choose **Prepare and install model**. Each model slot has **Edit model**, which opens the model in a model editor tab. After you save changes to the model, prepare and install it again. The engine does not pick up edits on its own.

**Viewport.** The toolbar above the canvas has a **Transform mode** selector (**Move**, **Rotate**, **Scale**), **Snap**, **Fly camera**, **Overlays**, and **Frame selection**.

| Action | Control |
|---|---|
| Orbit | Drag |
| Pan | Shift-drag |
| Zoom | Scroll |
| Fly camera | Turn on **Fly camera**, then W, A, S, D to move, R and F to rise and descend, drag to look |
| Frame the selection | F |

Snap steps are 0.25 meters for move and scale and 15 degrees for rotate. The 3D editor has **Undo** and **Redo** buttons, and Ctrl or Cmd with Z works inside the dock area.

**Inspector.** With nothing selected it shows scene settings and any validation errors. With an entity selected it shows **Position (meters)**, **Rotation (degrees)**, **Scale**, and the entity's components, such as primitive, body, collider, camera, light, and character. A **Behaviors** section lists behaviors, with **Add script**, **Edit script**, and **Remove**. **Delete entity** removes the entity.

### What differs

The 3D editor has no copy and paste, no keyboard nudge, no scene tree search or nesting by drag, no prefab group, no **Revisions** list, and no **Run 10 s** check. Edit those from the agent or the document operations.

---

## Script entities

A script is a behavior on an entity. In the inspector choose **Add behavior**, then **Script** in 2D, or **Add script** in 3D. Choose **Edit script** to open the script pane. The pane is a code editor with type hints for the engine's script API, and each edit goes into the draft.

A script is a function expression that receives the current tick, input, events, and its own entity, and returns `{ state, commands }`.

```js
/** @type {GameScript} */
({ state }) => ({ state, commands: [] })
```

Rules that apply in both dimensions:

- Each call runs in a fresh, isolated sandbox. Keep values you need later in the returned `state`. Globals and closure variables do not survive.
- Commands change the world. Shared commands include `emit`, `hud`, `playAnimation`, `despawn`, `spawn`, and `sceneTransition`.
- Query results arrive on the next tick.
- Events a script receives come from the previous tick.
- The engine runs at a fixed 60 ticks per second and seeds `random`, so a replay gives the same result.

| | 2D | 3D |
|---|---|---|
| Position input | `entity.x`, `entity.y`, `touching` sides | XYZ `entity.position`, `velocity`, `grounded`, and axes and look input |
| Movement commands | `setVelocity`, `setPosition`, `setVisual` | `characterIntent`, `setKinematicPose`, `impulse`, `setVelocity`, `teleport`, `setVisual` |
| Spatial queries | None | Ray and shape queries, each with a `queryId` |
| Camera | The camera entity | Perspective or orthographic, fixed or follow |

The pane footer shows the source length against the 16,384 character limit, the **maxCommands** limit, and the **maxTickMs** limit. In 2D you can change both limits from the script behavior in the inspector. The defaults are 16 commands and 8 ms. The limits are 1 to 64 commands and 1 to 50 ms.

When a script throws during play, the 2D pane shows the tick and the message. **Replay to tick N** reruns the game to the tick before the failure so you can inspect it. **Ask the assistant** drafts a message with the scene, entity, behavior index, tick, and error. 2D also has **Run 10 s**, which runs the game headlessly for ten seconds of ticks and reports script calls, total script time, and a per-entity breakdown. The 3D editor shows **Replay before error** in the error line.

Agents and JS scripts can build a whole document in code with the `@nodetool-ai/sandbox-game` pack.

---

## Ask the agent

**Show assistant** opens a chat docked beside the viewport. The agent knows which game is open, which entities you selected, and which script you are editing. Welcome examples are "Add a boss that appears at wave 5", "Make the forest darker and add fog", and "Why does the player pass through this wall?".

The agent follows the `native-game` skill and edits the draft through tools:

| Tool | Use |
|---|---|
| `get_native_game` | Read an outline, one entity, or the whole document |
| `edit_native_game` | Apply ordered operations. The whole edit is validated before it is written |
| `capture_native_game_frame` | Render frames so it can look at the result |
| `playtest_native_game` | Run recorded inputs and check assertions |
| `autoplay_native_game` | Steer a 2D player toward a target or win. 3D is not supported, so give a route instead |
| `generate_game_asset` | Generate or import an image, speech, music, sound effect, font, or 3D model, and bind it to a slot |
| `install_native_game_asset` | Install a staged candidate asset |
| `publish_native_game` | Publish, only when you ask |
| `build_native_game` | Write a standalone web build |
| `list_example_games`, `get_example_game`, `install_example_game` | Study or copy a shipped game |

For a new game or an art overhaul the agent also loads `game-direction`. It fixes a player promise, a style string, a layer plan, feel parameters, and a pacing sheet first, then keeps asset prompts consistent with that spec.

Agent edits land in your draft. The **Changes** list groups them by chat message. **View in chat** jumps to the message, and **Undo** reverts that group. Your later edits are merged, and overlapping ones show as conflicts.

---

## Play

| Button | What it does |
|---|---|
| **Play** | Starts a play session from the current draft. While playing the button reads **Pause** |
| **Pause** | Stops the clock. The viewport shows the paused frame, and the **Runtime state** panel shows the selected entity |
| **Step** | Advances one tick. Available only while paused |
| **Stop** | Ends the session and returns to editing |
| **Save play state** | Stores a snapshot of the running session in this browser |
| **Load play state** | Restores that snapshot |
| **Play in new tab** | Opens the player page for this game |

Play uses the keyboard. Click the canvas to give it focus. In 2D, arrow keys and W, A, S, D map to `left`, `right`, `up`, and `down`, Space maps to `space`, and other keys map to their lowercase key name. A key counts only if the game lists it under input actions. In 3D, W, A, S, D or the arrow keys move, Space jumps, and the right mouse button looks around.

A session plays the document as it was at the moment you pressed **Play**. If you edit during play, a note says **The draft changed. Stop and play again to apply it.** In 2D, changing only asset bindings does not require a restart.

Saved play state is browser storage keyed by game ID. It does not travel with the game, and another browser does not see it.

If the game uses a required GPU effect and the browser has no WebGPU, play fails with an error. An optional effect is dropped and the toolbar reports **Canvas 2D**.

---

## Publish

Choose **Publish**. The button is disabled while the draft is saving.

- The 2D dialog lists the changes since the last revision. On **Publish** it validates the game first and shows any errors instead of publishing.
- The 3D dialog says it creates an immutable revision from the current draft.
- **Revision message** is optional and holds up to 500 characters.

Publishing writes a new revision and makes it the game's current revision. The draft stays editable and starts from the published content. If another session published first, you get **Game was modified concurrently**. Reload, merge your edits, and publish again.

Publishing does not make the game public. The game belongs to your account and its project.

### The player URL

**Play in new tab** opens `/game/<game ID>`. That route is protected and loads the game through your own account, so only the owner can open it. It loads the **saved draft**, not the last published revision, and shows the game name, **Play**, **Stop**, a score, and a status. The button is disabled until the draft is saved. A 3D game loads the 3D player in the same route.

To give someone a game that runs without NodeTool, publish and then [build a standalone web player](#build-a-standalone-web-build).

---

## Build a standalone web build

A standalone build is a folder of static files for one revision. It plays without a NodeTool server.

The editor has no export button. Use one of these:

- **The agent.** Ask it to build the game. It calls `build_native_game` for an owned revision and writes the folder under the project workspace, then returns the path.
- **The CLI.** `nodetool game build game.json --out game-build` builds from a game file. See [`nodetool game`](cli.md#nodetool-game) for flags, and for `validate`, `simulate`, and `capture`, which check a game without the editor.

The folder holds `index.html`, `game.json`, a player script, and an `assets/` folder of media named by digest. A 2D build adds a stylesheet and a script runtime. A 3D build adds `manifest.json`, the models, colliders, and pinned runtime files.

- Serve a 3D build over static HTTP.
- Installed media must still exist, match its recorded digest, and use a supported format, or the build fails.
- On a touch screen the 2D player adds a floating stick for `left`, `right`, `up`, and `down`, and one button per other input action.
- The first 3D release targets desktop web and Electron.

---

## Generate assets

The game documents bind art and sound by slot name, so you can replace placeholders without touching entities.

- Ask the agent to generate an asset for a slot. It generates, prepares, installs, and binds it. Image preparation can trim alpha, resize, set a pivot, slice a sprite sheet into aligned frames, build a 16-variant terrain tileset, or make a color lookup table for a **LUT** effect.
- In a workflow, three nodes support the same job: **Load Game Template**, **Slot Prompt**, and **Stage Game Assets**. Stage Game Assets validates generated media and stages candidate bindings. Staged media is a candidate until installed.

2D fonts, music, lighting, backgrounds, effects, and visual animation need a game at schema version 2. The editor disables the matching **Add** buttons for a version 1 game.

---

## Rebuild a generated game

A game made from a construction program keeps that program in the document. The **Retained construction** section shows its source and inputs. Use **Preview rebuild** to see changed entities and dependencies, **Highlight changes** to select them in the viewport, and **Apply rebuild** to write them into the draft. A rebuild is blocked while it has conflicts or the draft is stale. If your local edits conflict with the new construction, a dialog lets you keep an entity detached or discard those edits.

---

## Limits

- A game is 2D or 3D. It cannot change dimension, and mixed 2D and 3D scenes are not supported.
- Multiplayer, terrain streaming, navigation meshes, vehicles, ragdolls, retargeting, and root motion are outside this release.
- A script is at most 16,384 characters and runs under its command and time limits. A failed tick stops the session. Reset it or load a state from before the failure.
- Per game, the schema allows up to 8 render effects, 32 collision layer names, and 32 lights and backgrounds per scene. A sprite has up to 5 visual animation tracks.
- The runtime limits events and spawned instances. Exceeding a limit stops the session.
- A 3D game needs WebGL2. Playtest captures in 3D need Chromium.
- 3D triangle-mesh colliders require static bodies. Physics hierarchies reject scale and competing pose owners.
- Saved play state lives in one browser.
- The player page is not a public link. Share a standalone build instead.

---

## Related

- [Sketch Editor](sketch-editor.md) for the images you bind as sprites and backgrounds
- [Asset Management](asset-management.md) for the media in your project
- [Workspaces](workspaces.md) for where game files and builds are stored
- [CLI Reference](cli.md#nodetool-game) for `nodetool game validate`, `simulate`, `capture`, and `build`
- [Configuration](configuration.md) for `NODETOOL_EXAMPLE_GAMES_DIR`
