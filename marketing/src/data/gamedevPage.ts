import type { QaPair } from "@/lib/jsonld";

/**
 * Copy for /gamedev, shared by the page and its Markdown mirror
 * (scripts/generate-llms-txt.mjs), so an agent that asks for Markdown reads
 * the same facts a visitor sees.
 *
 * Every claim here was checked against the engine: tool names in
 * packages/agents/src/capabilities/game.specs.ts, limits in
 * docs/game-engine/coverage.md and docs/game-editor.md, export in
 * docs/game-engine/publishing.md. Change this file when those change.
 */

export const GAMEDEV_TITLE = "Open-Source AI Game Engine for Agent-Built Games | NodeTool";
export const GAMEDEV_DESCRIPTION =
  "An open-source 2D and 3D game engine for AI agents. Claude Code or the built-in agent builds and playtests the game. You edit it and export it for the web.";

export const GAMEDEV_LEAD =
  "NodeTool has its own 2D and 3D game engine, built so an AI agent can make a game and a person can keep working on it. The agent builds the levels, rules, scripts, art, and sound through checked edits, then plays the game headlessly to test it. You open the same game in the Game Editor, change anything, and export it as a web build. NodeTool is free and open source under AGPL-3.0.";

export const MCP_INSTALL_COMMAND = "npx -y --package=@nodetool-ai/cli nodetool mcp install";

export type AgentStep = { title: string; tool: string; body: string };

export const AGENT_STEPS: AgentStep[] = [
  {
    title: "Start the game",
    tool: "create_native_game",
    body: "Creates a 2D top-down room or a 3D exploration blockout in your project. The agent can also install one of the example games and build from it.",
  },
  {
    title: "Edit scenes, entities, and scripts",
    tool: "edit_native_game",
    body: "Applies a list of edits in one step: scenes, entities, components, scripts, input bindings, HUD, audio mix, and animation graphs. The engine checks every edit, and an invalid one is rejected instead of saved.",
  },
  {
    title: "Make the art and sound",
    tool: "generate_game_asset",
    body: "Generates or imports sprites, sprite sheets, tilesets, music, sound effects, speech, fonts, and 3D models, prepares them for the engine, and binds them to the game. Generation runs on your own provider accounts.",
  },
  {
    title: "Play it before you do",
    tool: "playtest_native_game",
    body: "Runs the game headlessly with recorded inputs and assertions, for up to 18,000 ticks. In 2D games, autoplay_native_game searches for a route to the goal.",
  },
  {
    title: "Look at the result",
    tool: "capture_native_game_frame",
    body: "Renders frames or a contact sheet the agent can inspect, so it checks what the level looks like as well as how it plays.",
  },
  {
    title: "Build it",
    tool: "build_native_game",
    body: "Writes a standalone web player or a desktop app project. publish_native_game saves a revision, and the agent publishes only when you ask.",
  },
];

/**
 * Game assets, checked against generate_game_asset, capture_native_game_frame
 * and browse_native_game_assets in packages/agents/src/capabilities/game.specs.ts.
 */
export const ASSETS_LEAD =
  "The agent makes the art and sound for the game and installs each piece where the game uses it. Generation runs on your own provider accounts, and you can import files you already have.";

export const ASSET_KINDS: { title: string; body: string }[] = [
  { title: "Sprites and sprite sheets", body: "A generated or imported image is cut into an aligned sprite sheet, and its frames are bound to the game." },
  { title: "Tilesets", body: "An image is prepared as an edge tileset." },
  { title: "Color grading", body: "An image is prepared as a grade LUT, a render effect that sets the game's color look." },
  { title: "Speech, music, and sound effects", body: "Voice lines from a speech model, music from a music model, and sound effects from a sound-effect node you choose." },
  { title: "Fonts", body: "Import a TTF or OTF file for the HUD and text." },
  { title: "3D models and colliders", body: "Generate a model on a provider node, or import your own glTF or GLB. Each 3D result is a candidate that you or the agent install on purpose." },
];

export const ASSET_NOTES: string[] = [
  "Every asset is bound to a named slot, so the agent can regenerate one slot without touching the rest. It can also stage a 2D candidate and compare it before installing it.",
  "Asset generators such as Ludo.ai and Scenario focus on making the asset. NodeTool also makes assets, then places each one into a game you can play, test, and edit.",
  "For a trailer, the agent captures up to eight still frames from the game and can cut them on a timeline with generated clips. It does not record gameplay video.",
];

export type SpecRow = { feature: string; twoD: string; threeD: string };

export const SPEC_ROWS: SpecRow[] = [
  { feature: "Rendering", twoD: "Canvas 2D or WebGPU", threeD: "Three.js on WebGL2" },
  { feature: "Physics", twoD: "Static and kinematic bodies, sensors, one-way tiles, moving platforms, gravity for platformers", threeD: "Rapier: static, kinematic, and dynamic bodies, a character controller, 16 collision layers, physics materials" },
  { feature: "Scripts", twoD: "JavaScript in a QuickJS sandbox, with lifecycle hooks, timers, and events", threeD: "The same" },
  { feature: "Input", twoD: "Keyboard, mouse, gamepad, and on-screen touch controls", threeD: "The same, plus axes and camera look" },
  { feature: "Audio", twoD: "Music, sound effects, mixer buses, ducking, spatial audio", threeD: "The same" },
  { feature: "Animation", twoD: "Sprite clips and visual animation tracks", threeD: "glTF clips and animation graphs with blend spaces" },
  { feature: "Look", twoD: "2D lights, parallax, particles, bloom, color grading", threeD: "Lights, shadows, sky, fog, decals, particles, post-processing" },
  { feature: "Export", twoD: "Web player, desktop app project", threeD: "Web player (needs WebGL2), desktop app project" },
];

export const ENGINE_NOTE =
  "A game is one JSON document with an editable draft and published revisions. It is 2D or 3D for its whole life. The simulation runs at a fixed step with seeded randomness, so a playtest or a replay gives the same result every time.";

export const EDITOR_POINTS: string[] = [
  "Scene tree, viewport, and inspector. Select anything in the level, change its components and behaviors in the side panel.",
  "Move, rotate, and scale gizmos, snapping, and a fly camera in 3D.",
  "A script editor with type hints for the engine's script API. Script edits reload while the game is running.",
  "Assets, Console, Profiler, and Animation panels.",
  "A Changes panel lists what the agent edited, with undo for each chat message.",
  "Play, Pause, Step, and saved play states without leaving the tab.",
];

export const LIMITS: string[] = [
  "No iOS, Android, or console export. Games export to the web and to a desktop app for Windows, macOS, and Linux.",
  "No multiplayer or networking. Game scripts have no network or file access.",
  "2D physics has no dynamic bodies, friction, or restitution. Use 3D for physics-driven play.",
  "No navigation meshes, terrain streaming, vehicles, ragdolls, retargeting, or root motion.",
  "3D does not yet render custom shaders, HDRI lighting, or separate texture slots. Textures embedded in GLB models render.",
  "A script is capped at 16,384 characters and a per-tick budget of up to 64 commands and 50 ms.",
  "The 3D editor lacks some 2D tools, such as copy and paste, scene tree search, and drag nesting. Autoplay works in 2D only.",
];

export const LIMITS_SUMMARY =
  "For a commercial console or mobile release, a large open world, or an online game, use Unity, Unreal, Godot, or Roblox Studio. NodeTool fits when you want an agent to build and test a small web or desktop game that you keep editing.";

export const PROCESS_STEPS: { title: string; body: string }[] = [
  {
    title: "Describe the game",
    body: "Give the agent a world, a player, and a goal. It builds the levels, sets up how things move and react, and prepares the art and sound in a game project you can edit.",
  },
  {
    title: "Play, change, play again",
    body: "Change the art, adjust a jump, move an obstacle, or ask the agent to revise the rules. Play the result in the editor as you work.",
  },
  {
    title: "Put it in someone else's hands",
    body: "Export a web build: a folder with the player, the game, and its art and sound, ready to host on your own site over HTTPS. Players use a keyboard, a gamepad, or touch controls.",
  },
];

export const GAMEDEV_FAQ: QaPair[] = [
  {
    question: "Can an AI agent build a playable game in NodeTool?",
    answer:
      "Yes. The agent creates the game, edits it through checked operations, generates and installs the art and sound, and playtests it headlessly before you play it. The games on this page are web builds of example games that ship with NodeTool.",
  },
  {
    question: "Can Claude Code build a game in NodeTool?",
    answer: `Yes. Run ${MCP_INSTALL_COMMAND} to register NodeTool as an MCP server in Claude Code, Codex, or OpenCode. The agent calls the game tools inside execute_code, NodeTool's sandboxed action tool, and looks at captured frames with view_image. The game skills appear in Claude Code as slash commands.`,
  },
  {
    question: "Can I edit the game after the agent makes it?",
    answer:
      "Yes. The agent and the Game Editor change the same game document. Open it, select any object, change its settings, edit its scripts, and press Play. The Changes panel lists the agent's edits with undo for each message.",
  },
  {
    question: "Is NodeTool a replacement for Unity, Godot, or Unreal?",
    answer:
      "No. Those engines export to mobile and consoles, support multiplayer, and have far larger toolsets and ecosystems. NodeTool is a smaller engine built for agent authoring: the agent edits a validated game document, tests it headlessly, and leaves you an editable project for the web or desktop.",
  },
  {
    question: "Which platforms can I export to?",
    answer:
      "A standalone web player, served over HTTPS or from localhost, and a Tauri desktop app project that you compile on Windows, macOS, or Linux with Rust. The editor exports the last published revision. There is no iOS, Android, or console export.",
  },
  {
    question: "Does NodeTool make 3D games?",
    answer:
      "Yes. 3D games use Three.js on WebGL2 and Rapier physics, with a character controller, animation graphs, lights, shadows, and fog. They target desktop browsers and the desktop app. A game is either 2D or 3D, not both.",
  },
  {
    question: "What does it cost?",
    answer:
      "NodeTool Studio is free and open source. Playing and editing games needs no API key. Generating new art, music, or sound calls the providers you connect, and they bill you at their own prices.",
  },
  {
    question: "What language are game scripts written in?",
    answer:
      "JavaScript. Scripts run in a QuickJS sandbox with lifecycle hooks such as onStart and onUpdate, timers, typed events, and player saves. They return state and commands, which keeps runs deterministic and replayable.",
  },
];

export type ReadMoreLink = { label: string; href: string };

export const GAMEDEV_LINKS: ReadMoreLink[] = [
  { label: "Game Editor guide", href: "https://docs.nodetool.ai/game-editor" },
  { label: "Native Game Engine reference", href: "https://docs.nodetool.ai/game-engine/" },
  { label: "How agents author games", href: "https://docs.nodetool.ai/game-engine/agent-authoring" },
  { label: "MCP server setup", href: "https://docs.nodetool.ai/mcp-server" },
  { label: "Engine source on GitHub", href: "https://github.com/nodetool-ai/nodetool/tree/main/packages/game-runtime" },
];
