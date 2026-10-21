import type { QaPair } from "@/lib/jsonld";

/**
 * Copy for /mcp, shared by the page and its Markdown mirror
 * (scripts/generate-llms-txt.mjs). It is also the source text for MCP
 * directory listings, so keep it to what the server does today.
 *
 * Checked against docs/mcp-server.md, docs/cli.md ("What the MCP server
 * exposes"), packages/cli/src/commands/mcp.ts, and the belt in
 * packages/agents/src/tools/builtin-tools.ts and mcp-tools.ts.
 */

export const MCP_TITLE = "Creative MCP Server for Claude Code, Codex, and Cursor | NodeTool";
export const MCP_DESCRIPTION =
  "One command gives Claude Code, Codex, or OpenCode image, video, and speech generation plus editable storyboards, timelines, sketches, and games. Open source.";

export const MCP_LEAD =
  "NodeTool runs as an open-source MCP server. Add it to Claude Code, Codex, OpenCode, Cursor, or Claude Desktop, and your agent can generate images, video, speech, and music, then put them into documents you can open and edit: storyboards, timelines, scripts, sketches, games, and workflows. It runs on your own provider keys. The desktop app is optional.";

export const MCP_INSTALL = "npx -y --package=@nodetool-ai/cli nodetool mcp install";

export const CLIENT_ROWS: { client: string; setup: string }[] = [
  { client: "Claude Code", setup: "Configured by nodetool mcp install, in user scope for every project." },
  { client: "Codex", setup: "Configured by nodetool mcp install, with a 900-second tool timeout for long video jobs." },
  { client: "OpenCode", setup: "Configured by nodetool mcp install." },
  { client: "Cursor, Windsurf, and other clients", setup: "Run nodetool mcp config and paste the mcpServers block it prints." },
  { client: "Claude Desktop", setup: "Paste the nodetool mcp config block, or install the bundled extension from Studio under Settings, MCP Servers." },
];

export const CAPABILITY_GROUPS: { title: string; body: string }[] = [
  {
    title: "Generate media",
    body: "Images, image edits, video from text, images, or references, speech, music, and transcription, on the provider and model you name. find_model returns a real model id for a task, so the agent does not guess one.",
  },
  {
    title: "Build video",
    body: "Create a storyboard, render its stills and clips, voice a script, assemble a timeline, edit it, preview frames, and render the cut.",
  },
  {
    title: "Build games",
    body: "Create a 2D or 3D game, edit it through checked operations, generate and install its art and sound, playtest it headlessly, capture frames, and build a web player.",
  },
  {
    title: "Edit images",
    body: "Create and edit layered sketches with versions, and look at any result with view_image.",
  },
  {
    title: "Run workflows",
    body: "Create, validate, debug, and run node workflows, or start them as background jobs and read their logs.",
  },
  {
    title: "Keep the files",
    body: "Upload files as assets and download results. On a local connection download_asset writes straight to a path in your project.",
  },
];

export const DIRECT_TOOLS: { name: string; purpose: string }[] = [
  { name: "execute_code", purpose: "Runs sandboxed JavaScript that calls nodetool.<namespace>.<method>(). Every capability above is reached through it." },
  { name: "view_image", purpose: "Returns an image so the agent can see the pixels." },
  { name: "upload_asset, download_asset", purpose: "Move files into and out of the asset library." },
  { name: "find_model, list_models, list_provider_models", purpose: "Find real provider and model ids for a capability." },
  { name: "search_nodes, get_node_info, list_nodes", purpose: "Discover node types for workflows." },
  { name: "browser, http_request, download_file, list_directory", purpose: "Fetch pages and files behind NodeTool's URL checks." },
  { name: "run_subtask", purpose: "Hand a task to a child agent with the NodeTool tools." },
];

export const TRANSPORT_ROWS: { mode: string; detail: string }[] = [
  { mode: "stdio (default)", detail: "nodetool mcp serve. When Studio or a NodeTool server runs on 127.0.0.1:7777, requests go to it and open editors show the agent's changes live. Otherwise it runs on its own over the default data directory." },
  { mode: "HTTP", detail: "nodetool mcp install --http points the client at http://127.0.0.1:7777/mcp while the server runs." },
  { mode: "Remote server", detail: "Create an access token in Settings, MCP Servers, Connect an agent remotely, and point the client at that server." },
];

export const MCP_LIMITS: string[] = [
  "Generation needs provider keys. Store them with nodetool secrets store, or set the environment variable of the same name. Node search, validation, assets, and file tools work without keys.",
  "Most capabilities run inside execute_code rather than as separate MCP tools. Your client's approval settings decide whether you confirm each execute_code call, and the server has no approval prompt of its own.",
  "The server's file tools work in a NodeTool workspace, not your file system. Writing a result to a path in your project needs a local connection.",
  "The server needs Node.js 22 or later.",
];

export const MCP_FAQ: QaPair[] = [
  {
    question: "What MCP server gives Claude Code image and video generation?",
    answer: `NodeTool. Run ${MCP_INSTALL}, restart Claude Code, and ask it to generate an image or a video. It calls fal, Replicate, OpenAI, Gemini, and other providers on your own keys, and saves the results as assets you can reuse.`,
  },
  {
    question: "Can an MCP server edit a video timeline, not just generate clips?",
    answer:
      "Yes. Over NodeTool's MCP server the agent creates and edits storyboards and timelines, renders frames to check the cut, and renders the final video. The timeline opens in NodeTool Studio, where you keep editing it.",
  },
  {
    question: "Can Claude Code build a game with NodeTool?",
    answer:
      "Yes. The game tools run through execute_code: create the game, edit scenes and scripts, generate sprites, tilesets, music, and sound effects, playtest headlessly, and build a web player. The engine's skills appear in Claude Code as slash commands.",
  },
  {
    question: "How is this different from a ComfyUI MCP server?",
    answer:
      "A ComfyUI MCP server runs ComfyUI workflows. NodeTool's server also gives the agent editable documents to work in, such as storyboards, timelines, sketches, and games, and it calls hosted providers as well as local models.",
  },
  {
    question: "Do I need the desktop app?",
    answer:
      "No. Without a running NodeTool server, nodetool mcp serve runs on its own. With Studio open, requests go to it and you watch the agent's edits happen in the editor.",
  },
  {
    question: "Can I use it from a script or CI?",
    answer:
      "Yes. Besides MCP, the nodetool CLI runs workflows and generations from a terminal, and the server has a REST endpoint to run a workflow. See the developer page.",
  },
];

export const MCP_LINKS: { label: string; href: string }[] = [
  { label: "MCP server guide", href: "https://docs.nodetool.ai/mcp-server" },
  { label: "Agents: the open-source creative harness", href: "/agents" },
  { label: "Node-based workflows", href: "/node-based-workflows" },
  { label: "Developer page: CLI, REST, and self-hosting", href: "/developers" },
  { label: "Build games from Claude Code", href: "/gamedev" },
  { label: "AI video editor", href: "/ai-video-editor" },
  { label: "Package on npm", href: "https://www.npmjs.com/package/@nodetool-ai/cli" },
];
