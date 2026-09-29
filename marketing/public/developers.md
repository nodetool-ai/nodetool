---
title: "NodeTool for Developers"
description: "Connect NodeTool to Claude Code, Codex, OpenCode, or Cursor so your coding agent can make images, video, speech, and repeatable media workflows."
canonical: https://nodetool.ai/developers
markdown: https://nodetool.ai/developers.md
product: NodeTool
---
# NodeTool for Developers

NodeTool runs as a local MCP server. One command registers it with Claude Code, Codex, and OpenCode:

```bash
npx -y --package=@nodetool-ai/cli nodetool mcp install
```

For Cursor, Claude Desktop, or another MCP client, run `nodetool mcp config` and paste the printed block into the client config. The desktop app is optional.

After the install, ask the agent for images, video, speech, transcripts, or a whole workflow in plain words. It saves files into the project and keeps a copy in the NodeTool asset library. Generation calls your own provider accounts at their list price.

Ask the agent to save the steps as a workflow. You can open the graph in Studio, change it, and run it again from the canvas, the CLI (`nodetool run`), or `POST /api/workflows/<id>/run`.

Read the [MCP setup guide](https://docs.nodetool.ai/mcp-server), the [workflow API](https://docs.nodetool.ai/workflow-api), the [JavaScript sandbox reference](https://docs.nodetool.ai/javascript-sandbox), and the [developer guide](https://docs.nodetool.ai/developer/) to write custom nodes.
