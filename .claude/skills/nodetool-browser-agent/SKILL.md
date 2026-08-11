---
name: nodetool-browser-agent
description: Create browser automation agents that navigate websites, extract data, fill forms, and perform multi-step web tasks using natural language instructions. Use when user asks to automate browsing, scrape websites with AI, build a web agent, or perform complex browser interactions.
---

You help users create NodeTool agents configured for browser automation — AI-powered web agents that navigate, interact with, and extract data from websites using natural-language task descriptions.

# Architecture

Browser automation in NodeTool uses the **agent system**. An agent equipped with the browser tool can navigate pages, capture screenshots, download files, and extract content as part of a planned, multi-step task.

```
Task description → Agent → (Plan steps → Use browser tools → Extract/interact → Report) → Result
```

# Available Browser Tools

These are the web-related tools the agent belt offers. Pass them to
`nodetool agent run --tools` to narrow the belt to just these:

| Tool name | Description |
|-----------|-------------|
| `browser` | Fetch and render web page content (executes JavaScript), extract text/links |
| `screenshot` | Capture a screenshot of a page |
| `download_file` | Download a file from a URL into the workspace |
| `web_search` | Web search to discover URLs |
| `google_news` / `google_images` | News / image search |
| `http_request` | Raw HTTP GET/POST for APIs and simple fetches |

> There are no `dom_examine`, `dom_search`, or `dom_extract` tools. The `browser`
> tool handles rendering and content extraction; instruct the agent in natural
> language (e.g. "extract every product title and price") and pair it with
> `write_file` to save structured results.

# CLI Usage

`nodetool agent` takes arguments only — there is no config file. Put the
instructions in the objective, and narrow the toolbelt with `--tools`.

```bash
# Scrape a page
nodetool agent run -p openai -m gpt-5.4 \
  --tools browser,write_file \
  --objective "Go to example.com, extract every product name and price, and save them as JSON with write_file"

# Research a topic — final answer to stdout, trace to stderr
nodetool agent run -p openai -m gpt-5.4 \
  --tools web_search,browser,write_file \
  --objective "Research the latest developments in WebAssembly. Search for sources, browse the promising ones, and compile a structured report." \
  > research-report.md

# Compare prices
nodetool agent run -p openai -m gpt-5.4 \
  --tools web_search,browser,write_file \
  --objective "Compare the price, availability, and shipping of <product> across three retailers, then recommend the best deal"

# Objective via stdin
echo "Screenshot example.com and describe the layout" | \
  nodetool agent run -p openai -m gpt-5.4 --tools browser,screenshot
```

Omit `--tools` to give the agent the whole default belt.


# Browser Agent as a Workflow Node

For visual workflows (and the DSL), there is a dedicated `BrowserAgent` node
(`agents.browserAgent` in `@nodetool-ai/dsl`). It runs a browsing agent inside a
graph and returns the extracted text. Use this when browsing is one step of a
larger pipeline rather than a standalone CLI run.

# Programmatic Usage (TypeScript)

```typescript
import { Agent } from "@nodetool-ai/agents";
import { BrowserTool, ScreenshotTool, DownloadFileTool } from "@nodetool-ai/agents";
import { ProcessingContext, FileStorageAdapter } from "@nodetool-ai/runtime";

const agent = new Agent({
  name: "browser-agent",
  objective: "Extract product listings from example.com",
  provider: openaiProvider,
  model: "gpt-5.4",
  tools: [new BrowserTool(), new ScreenshotTool(), new DownloadFileTool()],
  workspace: "/tmp/browser-output",
  maxSteps: 15,
});

const ctx = new ProcessingContext({
  jobId: `browser-${Date.now()}`,
  userId: "1",
  workspaceDir: "/tmp/browser-output",
  workspaceStorage: new FileStorageAdapter("/tmp/browser-output"),
});

for await (const message of agent.execute(ctx)) {
  if (message.type === "chunk") process.stdout.write(message.content);
}
```

# Tips

- **Describe extraction in natural language** — the `browser` tool returns page content; let the model parse it. Pair with `write_file` to persist results.
- **Use `screenshot`** to debug visual state or verify a page loaded.
- **Set `max_steps` higher** (15-20) for multi-page tasks.
- **Combine with `google_search`** when the agent needs to discover URLs first.
- **Use `http_request`** for JSON APIs — it's faster and cheaper than full page rendering.
