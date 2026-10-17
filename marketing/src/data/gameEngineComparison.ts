import type { QaPair } from "@/lib/jsonld";

/**
 * Copy for /gamedev/ai-game-engines. NodeTool facts come from the engine
 * (see gamedevPage.ts). Every claim about another product comes from a page
 * listed in ENGINE_SOURCES, read on SOURCES_CHECKED, plus the long-standing
 * export targets of Unity and Godot. Recheck the sources before changing a
 * cell: these products move fast.
 */

export const SOURCES_CHECKED = "2026-10-17";

export const COMPARISON_TITLE = "AI Game Engines Compared: NodeTool, Unity, Godot, Roblox Studio";
export const COMPARISON_DESCRIPTION =
  "How an AI agent builds a game in NodeTool, Unity, Godot, Roblox Studio, Summer Engine, and Rosebud, what you can edit afterward, and where each one exports.";

export const COMPARISON_LEAD =
  "An AI agent can now build a playable game in several engines. They differ in three ways that decide which one fits: how the agent connects, whether it can run and check the game by itself, and what you are left with when it stops. This page compares six options on those points, including where NodeTool is the weaker choice.";

export type EngineColumn = {
  key: string;
  name: string;
};

export const ENGINES: EngineColumn[] = [
  { key: "nodetool", name: "NodeTool" },
  { key: "unity", name: "Unity with Unity AI" },
  { key: "godot", name: "Godot with godot-mcp" },
  { key: "roblox", name: "Roblox Studio" },
  { key: "summer", name: "Summer Engine" },
  { key: "rosebud", name: "Rosebud AI" },
];

export type ComparisonRow = { label: string; cells: Record<string, string> };

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    label: "License",
    cells: {
      nodetool: "Open source, AGPL-3.0",
      unity: "Proprietary",
      godot: "Godot and godot-mcp are both MIT",
      roblox: "Proprietary",
      summer: "Free proprietary desktop app; agent tools are MIT",
      rosebud: "Hosted service",
    },
  },
  {
    label: "How the agent connects",
    cells: {
      nodetool: "Built-in agent, or an MCP server for Claude Code, Codex, OpenCode, and Cursor",
      unity: "Unity MCP Server, in open beta since May 2026, for Claude Code, Cursor, Windsurf, Claude Desktop, VS Code Copilot, and others",
      godot: "Community MCP server that launches the editor, runs the project, and creates scenes and nodes",
      roblox: "MCP server built into Studio. Roblox archived its earlier open-source reference server in April 2026",
      summer: "Built-in Summer Agent, or MCP and a CLI for Claude Code, Codex, and Cursor",
      rosebud: "Built-in generation from a written description",
    },
  },
  {
    label: "Agent checks the game itself",
    cells: {
      nodetool: "Headless playtests with recorded inputs and assertions, frame capture, and route search in 2D",
      unity: "Reads the scene hierarchy, components, and console, and triggers editor actions",
      godot: "Runs the project in debug mode and reads its output",
      roblox: "The reference server could start play mode and run scripts in it",
      summer: "Runs Play mode and helps the agent inspect errors",
      rosebud: "You test in the browser",
    },
  },
  {
    label: "What you edit afterward",
    cells: {
      nodetool: "The same game document, in the Game Editor: scene tree, inspector, scripts",
      unity: "A Unity project in the Unity Editor",
      godot: "A Godot project in the Godot editor",
      roblox: "A Roblox experience in Studio",
      summer: "Godot 4 compatible scenes and scripts",
      rosebud: "Gameplay, assets, and NPC behavior, in the browser",
    },
  },
  {
    label: "Exports to",
    cells: {
      nodetool: "Web player and a desktop app project for Windows, macOS, and Linux",
      unity: "Desktop, mobile, consoles, and web",
      godot: "Desktop, mobile, and web",
      roblox: "The Roblox platform",
      summer: "Windows and macOS, then Steam, itch.io, or your own site",
      rosebud: "A shareable browser link",
    },
  },
  {
    label: "What it needs",
    cells: {
      nodetool: "Free. Generating art and sound uses your own provider accounts",
      unity: "Unity 6, a project connected to Unity Cloud, and a Unity AI trial or subscription",
      godot: "Godot installed, plus Node.js for the MCP server",
      roblox: "Roblox Studio",
      summer: "Desktop app is free for local projects. Hosted Summer AI needs paid credits",
      rosebud: "Free to try. Paid tiers include commercial rights",
    },
  },
];

export type Recommendation = { name: string; when: string };

export const RECOMMENDATIONS: Recommendation[] = [
  {
    name: "NodeTool",
    when: "You want an agent to build and test a small 2D or 3D game for the web or desktop, generate its art and sound in the same place, and leave you an open-source project you keep editing. It also fits when the game is one part of a larger project with video, images, or storyboards.",
  },
  {
    name: "Unity",
    when: "You need mobile or console builds, a large asset ecosystem, or a team that already works in Unity, and you accept a proprietary engine and the Unity AI beta terms.",
  },
  {
    name: "Godot",
    when: "You want a full open-source engine with mobile and web export and are comfortable driving it through a community MCP server.",
  },
  {
    name: "Roblox Studio",
    when: "The game is meant to live on Roblox, with its players, multiplayer, and economy.",
  },
  {
    name: "Summer Engine",
    when: "You want an AI-first editor whose projects stay compatible with Godot 4, and you plan to publish on Steam or itch.io.",
  },
  {
    name: "Rosebud AI",
    when: "You want a quick browser prototype from a description and a link to share, without installing anything.",
  },
];

export const NODETOOL_DIFFERENCES: string[] = [
  "The engine was written for agent authoring. The agent changes a validated game document through typed operations rather than editing source files and hoping they compile.",
  "Runs are deterministic, so the agent's playtest and your play session behave the same, and a replay proves a fix.",
  "Asset generation is part of the engine's tools: sprites, tilesets, music, sound effects, speech, and 3D models are generated, prepared, and bound in one step.",
  "The same workspace holds storyboards, video timelines, sketches, and workflows, so a trailer or store art for the game is made next to it.",
];

export const NODETOOL_GAPS: string[] = [
  "No mobile, console, or multiplayer support.",
  "2D physics has no dynamic bodies, and 3D has no custom shaders, navigation meshes, or terrain.",
  "Far smaller ecosystem: no asset store, plugins, or community tutorials on the scale of Unity, Godot, or Roblox.",
];

export const COMPARISON_FAQ: QaPair[] = [
  {
    question: "What is the best open-source AI game engine?",
    answer:
      "It depends on what you ship. Godot is the most complete open-source engine and works with agents through community MCP servers. NodeTool is open source and built for agents from the start, with headless playtests and asset generation, but it exports only to the web and desktop.",
  },
  {
    question: "Which game engines support MCP?",
    answer:
      "Among the engines on this page: NodeTool ships its own MCP server, Unity has an MCP server in open beta, Roblox Studio has one built in, Godot has community MCP servers, and Summer Engine documents MCP setup for Claude Code, Codex, and Cursor.",
  },
  {
    question: "Can an AI agent build a game I can keep editing?",
    answer:
      "Yes, in every engine here except a pure browser generator, provided the agent works inside the engine's own project format. In NodeTool the agent and the Game Editor change the same game document, so nothing has to be imported or converted.",
  },
];

export type Source = { label: string; href: string };

export const ENGINE_SOURCES: Source[] = [
  { label: "Unity: Unity's AI tools in beta, how to get started with MCP", href: "https://unity.com/en/blog/unity-ai-mcp-how-to-get-started" },
  { label: "godot-mcp in the Archestra MCP catalog", href: "https://archestra.ai/mcp-catalog/coding-solo__godot-mcp" },
  { label: "Roblox: studio-rust-mcp-server (archived)", href: "https://github.com/Roblox/studio-rust-mcp-server" },
  { label: "Summer Engine: best AI for game development", href: "https://www.summerengine.com/best-ai-for-game-development.md" },
  { label: "Summer Engine: how to make games in Claude Code", href: "https://www.summerengine.com/mcp/how-to-make-games-in-claude-code" },
  { label: "Rosebud AI vs Base44", href: "https://lab.rosebud.ai/blog/rosebud-ai-vs-base44-whats-the-best-way-to-build-a-video-game-with-ai" },
  { label: "NodeTool: Native Game Engine coverage", href: "https://docs.nodetool.ai/game-engine/" },
];
