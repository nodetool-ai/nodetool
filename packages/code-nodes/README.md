# @nodetool-ai/code-nodes

Code-execution and agent-tool nodes for [NodeTool](https://nodetool.ai).

Run Python, JavaScript, Bash, Ruby, and Lua inside visual AI workflows — in a
subprocess, a sandbox, or a Docker container — and drive single-purpose LLM
tool agents for shell, browser, filesystem, git, media, and document tasks.

## Install

```bash
npm install @nodetool-ai/code-nodes
```

## Nodes

**Code execution** (`nodetool.code.*`) — run a script and capture its output:
`ExecutePython`, `ExecuteJavaScript`, `ExecuteBash`, `ExecuteRuby`,
`ExecuteLua`, `ExecuteCommand`. Command variants (`RunPythonCommand`,
`RunBashCommand`, `RunShellCommand`, …) and Docker-isolated variants
(`RunPythonCommandDocker`, `RunBashCommandDocker`, …).

**Sandbox** (`nodetool.sandbox.*`) — `SandboxShell`, `SandboxFile`.

**Tool agents** (`nodetool.agents.*`) — LLM agents scoped to one toolset:
`ShellAgent`, `BrowserAgent`, `LiveBrowserAgent`, `FilesystemAgent`, `GitAgent`,
`HttpApiAgent`, `HtmlAgent`, `ImageAgent`, `MediaAgent`, `FfmpegAgent`,
`DocumentAgent`, `DocxAgent`, `PdfLibAgent`, `PptxAgent`, `SpreadsheetAgent`,
`EmailAgent`, `SQLiteAgent`, `SupabaseAgent`, `VectorStoreAgent`,
`YtDlpDownloaderAgent`, and `ClaudeCodeAgent`.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
