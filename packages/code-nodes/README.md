# @nodetool-ai/code-nodes

Code-execution and agent-tool nodes for [NodeTool](https://nodetool.ai).

Run JavaScript inside visual AI workflows in a QuickJS WASM sandbox.

## Install

```bash
npm install @nodetool-ai/code-nodes
```

## Nodes

**Code execution** — `nodetool.code.Code` runs JavaScript in a QuickJS WASM
sandbox with `fetch()`, workspace file access, secrets, and media helpers.
Dynamic inputs arrive on the `inputs` object; the returned object becomes the
outputs. Libraries are sandbox packs the body imports — the node declares no
packages; the host resolves each specifier against the installed catalog. Full
reference: [JavaScript Sandbox](https://docs.nodetool.ai/javascript-sandbox).

**Claude Code Agent** (`nodetool.agents.ClaudeCodeAgent`) — run Claude Code
in a tmux session from a workflow node. The general Agent node lives in
`@nodetool-ai/llm-nodes`. Host binaries such as ffmpeg, yt-dlp, and the
browser capability are CodeAct tools (`nodetool.media.ffmpeg`,
`nodetool.media.downloadVideo`, `nodetool.web.browse`).

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
