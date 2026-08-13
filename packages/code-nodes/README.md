# @nodetool-ai/code-nodes

Code-execution and agent-tool nodes for [NodeTool](https://nodetool.ai).

Run JavaScript inside visual AI workflows in a QuickJS WASM sandbox, and drive
single-purpose LLM tool agents for shell, browser, filesystem, git, media, and
document tasks.

## Install

```bash
npm install @nodetool-ai/code-nodes
```

## Nodes

**Code execution** — `nodetool.code.Code` runs JavaScript in a QuickJS WASM
sandbox with `fetch()`, workspace file access, secrets, and media helpers.
Dynamic inputs arrive on the `inputs` object; the returned object becomes the
outputs. Libraries are sandbox packages the node declares and imports. Full
reference: [JavaScript Sandbox](https://docs.nodetool.ai/javascript-sandbox).

**Tool agents** (`nodetool.agents.*`) — LLM agents scoped to one toolset:
`ShellAgent`, `BrowserAgent`, `LiveBrowserAgent`, `FilesystemAgent`, `GitAgent`,
`HttpApiAgent`, `HtmlAgent`, `ImageAgent`, `MediaAgent`, `FfmpegAgent`,
`DocumentAgent`, `DocxAgent`, `PdfLibAgent`, `PptxAgent`, `SpreadsheetAgent`,
`EmailAgent`, `SQLiteAgent`, `SupabaseAgent`, `VectorStoreAgent`,
`YtDlpDownloaderAgent`, and `ClaudeCodeAgent`.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
