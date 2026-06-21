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

These are the web-related tools the agent CLI resolves from the YAML `tools:` list:

| Tool name | Description |
|-----------|-------------|
| `browser` | Fetch and render web page content (executes JavaScript), extract text/links |
| `screenshot` | Capture a screenshot of a page |
| `download_file` | Download a file from a URL into the workspace |
| `google_search` | Web search to discover URLs |
| `google_news` / `google_images` | News / image search |
| `http_request` | Raw HTTP GET/POST for APIs and simple fetches |
| `openai_web_search` | OpenAI-hosted web search (needs an OpenAI key) |

> There are no `dom_examine`, `dom_search`, or `dom_extract` tools. The `browser`
> tool handles rendering and content extraction; instruct the agent in natural
> language (e.g. "extract every product title and price") and pair it with
> `write_file` to save structured results.

# Agent YAML Config for Browser Automation

```yaml
name: browser-agent
description: AI-powered browser automation agent

system_prompt: |
  You are a web automation agent. You navigate websites, interact with pages,
  and extract information based on user instructions.

  Workflow:
  1. Analyze the task to determine what pages to visit
  2. Use the browser tool to fetch and read pages
  3. Extract the relevant content
  4. Report findings in a structured format

  Guidelines:
  - Start by browsing the target URL to understand page structure
  - Use screenshot to verify visual state when needed
  - Validate extracted data before reporting

model:
  provider: openai
  id: gpt-5.4

planning_agent:
  enabled: true
  model:
    provider: openai
    id: gpt-5.4-mini

tools:
  - browser
  - screenshot
  - download_file
  - http_request
  - google_search
  - write_file

max_steps: 15
```

# Quick Recipes

## Web Scraper Agent
```yaml
name: web-scraper
description: Extract structured data from websites
system_prompt: |
  You extract structured data from websites. For each URL:
  1. Browse the page to understand its structure
  2. Identify the data elements (titles, prices, dates)
  3. Extract them into structured JSON
  4. Save results with write_file
model: { provider: openai, id: gpt-5.4 }
tools: [browser, write_file]
max_steps: 20
```

## Research Agent with Browser
```yaml
name: web-researcher
description: Research topics using web search and browsing
system_prompt: |
  You are a research agent. For each topic:
  1. Search the web for relevant sources
  2. Browse promising results for detailed content
  3. Extract key information and verify facts
  4. Compile findings into a structured report
model: { provider: openai, id: gpt-5.4 }
tools: [google_search, browser, write_file]
max_steps: 15
```

## Price Comparison Agent
```yaml
name: price-compare
description: Compare prices across websites
system_prompt: |
  You compare product prices across websites:
  1. Search for the product on each site
  2. Extract price, availability, and shipping info
  3. Create a comparison table
  4. Recommend the best deal
model: { provider: openai, id: gpt-5.4 }
tools: [google_search, browser, write_file]
max_steps: 20
```

# CLI Usage

```bash
# Run a browser task (objective via flag, stdin, or `objective:` in the YAML)
nodetool agent run browser-agent.yaml \
  --objective "Go to example.com and extract all product names and prices"

# Research task — final answer to stdout, trace to stderr
nodetool agent run web-researcher.yaml \
  --objective "Research the latest developments in WebAssembly" \
  > research-report.md
```

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
