---
title: "NodeTool Game Development"
description: "An open-source 2D and 3D game engine for AI agents. Claude Code or the built-in agent builds and playtests the game. You edit it and export it for the web."
canonical: https://nodetool.ai/gamedev
markdown: https://nodetool.ai/gamedev.md
product: NodeTool
---
# NodeTool Game Development

NodeTool has its own 2D and 3D game engine, built so an AI agent can make a game and a person can keep working on it. The agent builds the levels, rules, scripts, art, and sound through checked edits, then plays the game headlessly to test it. You open the same game in the Game Editor, change anything, and export it as a web build. NodeTool is free and open source under AGPL-3.0.

Play the example games at https://nodetool.ai/gamedev.

## What the agent can do

- **Start the game** (`create_native_game`): Creates a 2D top-down room or a 3D exploration blockout in your project. The agent can also install one of the example games and build from it.
- **Edit scenes, entities, and scripts** (`edit_native_game`): Applies a list of edits in one step: scenes, entities, components, scripts, input bindings, HUD, audio mix, and animation graphs. The engine checks every edit, and an invalid one is rejected instead of saved.
- **Make the art and sound** (`generate_game_asset`): Generates or imports sprites, sprite sheets, tilesets, music, sound effects, speech, fonts, and 3D models, prepares them for the engine, and binds them to the game. Generation runs on your own provider accounts.
- **Play it before you do** (`playtest_native_game`): Runs the game headlessly with recorded inputs and assertions, for up to 18,000 ticks. In 2D games, autoplay_native_game searches for a route to the goal.
- **Look at the result** (`capture_native_game_frame`): Renders frames or a contact sheet the agent can inspect, so it checks what the level looks like as well as how it plays.
- **Build it** (`build_native_game`): Writes a standalone web player or a desktop app project. publish_native_game saves a revision, and the agent publishes only when you ask.

## Use it from Claude Code or Codex

```bash
npx -y --package=@nodetool-ai/cli nodetool mcp install
```

This registers NodeTool as an MCP server in Claude Code, Codex, and OpenCode. For Cursor or another client, `nodetool mcp config` prints the block to paste. The agent calls the game tools inside `execute_code` and looks at captured frames with `view_image`. The game skills appear in Claude Code as slash commands.

## Game assets, installed in the game

The agent makes the art and sound for the game and installs each piece where the game uses it. Generation runs on your own provider accounts, and you can import files you already have.

- **Sprites and sprite sheets**: A generated or imported image is cut into an aligned sprite sheet, and its frames are bound to the game.
- **Tilesets**: An image is prepared as an edge tileset.
- **Color grading**: An image is prepared as a grade LUT, a render effect that sets the game's color look.
- **Speech, music, and sound effects**: Voice lines from a speech model, music from a music model, and sound effects from a sound-effect node you choose.
- **Fonts**: Import a TTF or OTF file for the HUD and text.
- **3D models and colliders**: Generate a model on a provider node, or import your own glTF or GLB. Each 3D result is a candidate that you or the agent install on purpose.

- Every asset is bound to a named slot, so the agent can regenerate one slot without touching the rest. It can also stage a 2D candidate and compare it before installing it.
- Asset generators such as Ludo.ai and Scenario focus on making the asset. NodeTool also makes assets, then places each one into a game you can play, test, and edit.
- For a trailer, the agent captures up to eight still frames from the game and can cut them on a timeline with generated clips. It does not record gameplay video.

## The Game Editor

- Scene tree, viewport, and inspector. Select anything in the level, change its components and behaviors in the side panel.
- Move, rotate, and scale gizmos, snapping, and a fly camera in 3D.
- A script editor with type hints for the engine's script API. Script edits reload while the game is running.
- Assets, Console, Profiler, and Animation panels.
- A Changes panel lists what the agent edited, with undo for each chat message.
- Play, Pause, Step, and saved play states without leaving the tab.

## What is in the engine

A game is one JSON document with an editable draft and published revisions. It is 2D or 3D for its whole life. The simulation runs at a fixed step with seeded randomness, so a playtest or a replay gives the same result every time.

| Feature | 2D games | 3D games |
|---|---|---|
| Rendering | Canvas 2D or WebGPU | Three.js on WebGL2 |
| Physics | Static and kinematic bodies, sensors, one-way tiles, moving platforms, gravity for platformers | Rapier: static, kinematic, and dynamic bodies, a character controller, 16 collision layers, physics materials |
| Scripts | JavaScript in a QuickJS sandbox, with lifecycle hooks, timers, and events | The same |
| Input | Keyboard, mouse, gamepad, and on-screen touch controls | The same, plus axes and camera look |
| Audio | Music, sound effects, mixer buses, ducking, spatial audio | The same |
| Animation | Sprite clips and visual animation tracks | glTF clips and animation graphs with blend spaces |
| Look | 2D lights, parallax, particles, bloom, color grading | Lights, shadows, sky, fog, decals, particles, post-processing |
| Export | Web player, desktop app project | Web player (needs WebGL2), desktop app project |

## What it does not do yet

- No iOS, Android, or console export. Games export to the web and to a desktop app for Windows, macOS, and Linux.
- No multiplayer or networking. Game scripts have no network or file access.
- 2D physics has no dynamic bodies, friction, or restitution. Use 3D for physics-driven play.
- No navigation meshes, terrain streaming, vehicles, ragdolls, retargeting, or root motion.
- 3D does not yet render custom shaders, HDRI lighting, or separate texture slots. Textures embedded in GLB models render.
- A script is capped at 16,384 characters and a per-tick budget of up to 64 commands and 50 ms.
- The 3D editor lacks some 2D tools, such as copy and paste, scene tree search, and drag nesting. Autoplay works in 2D only.

For a commercial console or mobile release, a large open world, or an online game, use Unity, Unreal, Godot, or Roblox Studio. NodeTool fits when you want an agent to build and test a small web or desktop game that you keep editing. Compare engines: https://nodetool.ai/gamedev/ai-game-engines

## Questions

### Can an AI agent build a playable game in NodeTool?

Yes. The agent creates the game, edits it through checked operations, generates and installs the art and sound, and playtests it headlessly before you play it. The games on this page are web builds of example games that ship with NodeTool.

### Can Claude Code build a game in NodeTool?

Yes. Run npx -y --package=@nodetool-ai/cli nodetool mcp install to register NodeTool as an MCP server in Claude Code, Codex, or OpenCode. The agent calls the game tools inside execute_code, NodeTool's sandboxed action tool, and looks at captured frames with view_image. The game skills appear in Claude Code as slash commands.

### Can I edit the game after the agent makes it?

Yes. The agent and the Game Editor change the same game document. Open it, select any object, change its settings, edit its scripts, and press Play. The Changes panel lists the agent's edits with undo for each message.

### Is NodeTool a replacement for Unity, Godot, or Unreal?

No. Those engines export to mobile and consoles, support multiplayer, and have far larger toolsets and ecosystems. NodeTool is a smaller engine built for agent authoring: the agent edits a validated game document, tests it headlessly, and leaves you an editable project for the web or desktop.

### Which platforms can I export to?

A standalone web player, served over HTTPS or from localhost, and a Tauri desktop app project that you compile on Windows, macOS, or Linux with Rust. The editor exports the last published revision. There is no iOS, Android, or console export.

### Does NodeTool make 3D games?

Yes. 3D games use Three.js on WebGL2 and Rapier physics, with a character controller, animation graphs, lights, shadows, and fog. They target desktop browsers and the desktop app. A game is either 2D or 3D, not both.

### What does it cost?

NodeTool Studio is free and open source. Playing and editing games needs no API key. Generating new art, music, or sound calls the providers you connect, and they bill you at their own prices.

### What language are game scripts written in?

JavaScript. Scripts run in a QuickJS sandbox with lifecycle hooks such as onStart and onUpdate, timers, typed events, and player saves. They return state and commands, which keeps runs deterministic and replayable.

## Read more

- [Game Editor guide](https://docs.nodetool.ai/game-editor)
- [Native Game Engine reference](https://docs.nodetool.ai/game-engine/)
- [How agents author games](https://docs.nodetool.ai/game-engine/agent-authoring)
- [MCP server setup](https://docs.nodetool.ai/mcp-server)
- [Engine source on GitHub](https://github.com/nodetool-ai/nodetool/tree/main/packages/game-runtime)
