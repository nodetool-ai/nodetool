---
title: "NodeTool MCP Server"
description: "One command gives Claude Code, Codex, or OpenCode image, video, and speech generation plus editable storyboards, timelines, sketches, and games. Open source."
canonical: https://nodetool.ai/mcp
markdown: https://nodetool.ai/mcp.md
product: NodeTool
---
# NodeTool MCP Server

NodeTool runs as an open-source MCP server. Add it to Claude Code, Codex, OpenCode, Cursor, or Claude Desktop, and your agent can generate images, video, speech, and music, then put them into documents you can open and edit: storyboards, timelines, scripts, sketches, games, and workflows. It runs on your own provider keys. The desktop app is optional.

## Install

```bash
npx -y --package=@nodetool-ai/cli nodetool mcp install
```

- **Claude Code**: Configured by nodetool mcp install, in user scope for every project.
- **Codex**: Configured by nodetool mcp install, with a 900-second tool timeout for long video jobs.
- **OpenCode**: Configured by nodetool mcp install.
- **Cursor, Windsurf, and other clients**: Run nodetool mcp config and paste the mcpServers block it prints.
- **Claude Desktop**: Paste the nodetool mcp config block, or install the bundled extension from Studio under Settings, MCP Servers.

## What your agent can do

- **Generate media**: Images, image edits, video from text, images, or references, speech, music, and transcription, on the provider and model you name. find_model returns a real model id for a task, so the agent does not guess one.
- **Build video**: Create a storyboard, render its stills and clips, voice a script, assemble a timeline, edit it, preview frames, and render the cut.
- **Build games**: Create a 2D or 3D game, edit it through checked operations, generate and install its art and sound, playtest it headlessly, capture frames, and build a web player.
- **Edit images**: Create and edit layered sketches with versions, and look at any result with view_image.
- **Run workflows**: Create, validate, debug, and run node workflows, or start them as background jobs and read their logs.
- **Keep the files**: Upload files as assets and download results. On a local connection download_asset writes straight to a path in your project.

## Direct tools

- `execute_code`: Runs sandboxed JavaScript that calls nodetool.<namespace>.<method>(). Every capability above is reached through it.
- `view_image`: Returns an image so the agent can see the pixels.
- `upload_asset, download_asset`: Move files into and out of the asset library.
- `find_model, list_models, list_provider_models`: Find real provider and model ids for a capability.
- `search_nodes, get_node_info, list_nodes`: Discover node types for workflows.
- `browser, http_request, download_file, list_directory`: Fetch pages and files behind NodeTool's URL checks.
- `run_subtask`: Hand a task to a child agent with the NodeTool tools.

Resources `nodetool://capabilities` and `nodetool://sandbox` describe everything reached through `execute_code`. Each skill is an MCP prompt, which Claude Code shows as a slash command.

## Transports

- **stdio (default)**: nodetool mcp serve. When Studio or a NodeTool server runs on 127.0.0.1:7777, requests go to it and open editors show the agent's changes live. Otherwise it runs on its own over the default data directory.
- **HTTP**: nodetool mcp install --http points the client at http://127.0.0.1:7777/mcp while the server runs.
- **Remote server**: Create an access token in Settings, MCP Servers, Connect an agent remotely, and point the client at that server.

## Good to know

- Generation needs provider keys. Store them with nodetool secrets store, or set the environment variable of the same name. Node search, validation, assets, and file tools work without keys.
- Most capabilities run inside execute_code rather than as separate MCP tools. Your client's approval settings decide whether you confirm each execute_code call, and the server has no approval prompt of its own.
- The server's file tools work in a NodeTool workspace, not your file system. Writing a result to a path in your project needs a local connection.
- The server needs Node.js 22 or later.

## Questions

### What MCP server gives Claude Code image and video generation?

NodeTool. Run npx -y --package=@nodetool-ai/cli nodetool mcp install, restart Claude Code, and ask it to generate an image or a video. It calls fal, Replicate, OpenAI, Gemini, and other providers on your own keys, and saves the results as assets you can reuse.

### Can an MCP server edit a video timeline, not just generate clips?

Yes. Over NodeTool's MCP server the agent creates and edits storyboards and timelines, renders frames to check the cut, and renders the final video. The timeline opens in NodeTool Studio, where you keep editing it.

### Can Claude Code build a game with NodeTool?

Yes. The game tools run through execute_code: create the game, edit scenes and scripts, generate sprites, tilesets, music, and sound effects, playtest headlessly, and build a web player. The engine's skills appear in Claude Code as slash commands.

### How is this different from a ComfyUI MCP server?

A ComfyUI MCP server runs ComfyUI workflows. NodeTool's server also gives the agent editable documents to work in, such as storyboards, timelines, sketches, and games, and it calls hosted providers as well as local models.

### Do I need the desktop app?

No. Without a running NodeTool server, nodetool mcp serve runs on its own. With Studio open, requests go to it and you watch the agent's edits happen in the editor.

### Can I use it from a script or CI?

Yes. Besides MCP, the nodetool CLI runs workflows and generations from a terminal, and the server has a REST endpoint to run a workflow. See the developer page.

## Read more

- [MCP server guide](https://docs.nodetool.ai/mcp-server)
- [Agents: the open-source creative harness](https://nodetool.ai/agents)
- [Node-based workflows](https://nodetool.ai/node-based-workflows)
- [Developer page: CLI, REST, and self-hosting](https://nodetool.ai/developers)
- [Build games from Claude Code](https://nodetool.ai/gamedev)
- [AI video editor](https://nodetool.ai/ai-video-editor)
- [Package on npm](https://www.npmjs.com/package/@nodetool-ai/cli)
