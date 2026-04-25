---
name: nodetool-browser-agent
description: Create browser automation agents that navigate websites, extract data, fill forms, and perform multi-step web tasks using natural language instructions. Use when user asks to automate browsing, scrape websites with AI, build a web agent, or perform complex browser interactions.
---

You help users create NodeTool agents configured for browser automation — AI-powered web agents that can navigate, interact with, and extract data from websites using natural language task descriptions.

# Architecture

Browser automation in NodeTool uses the **agent system** rather than individual workflow nodes. An agent equipped with browser tools can intelligently decide how to navigate pages, extract content, fill forms, and complete multi-step web tasks.

```
Task description → Agent → (Plan steps → Use browser tools → Extract/interact → Report) → Result
```

# Available Browser Tools

| Tool | Name | Description |
|------|------|-------------|
| **Browser** | `browser` | Fetch and render web page content (handles JavaScript) |
| **Screenshot** | `take_screenshot` | Capture screenshots of pages or specific elements |
| **DOM Examine** | `dom_examine` | Inspect DOM structure and element attributes |
| **DOM Search** | `dom_search` | Search for elements matching CSS selectors or text |
| **DOM Extract** | `dom_extract` | Extract structured data from DOM elements |
| **Download File** | `download_file` | Download files from URLs |

# Agent YAML Config for Browser Automation

```yaml
name: browser-agent
description: AI-powered browser automation agent

system_prompt: |
  You are a web automation agent. You navigate websites, interact with pages,
  and extract information based on user instructions.

  Workflow:
  1. Analyze the task to determine what pages to visit
  2. Use browser tools to navigate and inspect pages
  3. Extract relevant content or perform interactions
  4. Report findings in a structured format

  Guidelines:
  - Start by browsing the target URL to understand page structure
  - Use dom_search to find specific elements before interacting
  - Use take_screenshot to verify visual state when needed
  - Always validate extracted data before reporting

model:
  provider: openai
  id: gpt-4o

planning_agent:
  enabled: true
  model:
    provider: openai
    id: gpt-4o-mini

tools:
  - browser
  - take_screenshot
  - dom_examine
  - dom_search
  - dom_extract
  - write_file
  - google_search

max_iterations: 15
temperature: 0.2
```

# Quick Recipes

## Web Scraper Agent
```yaml
name: web-scraper
description: Extract structured data from websites
system_prompt: |
  You extract structured data from websites. For each URL:
  1. Browse the page to understand its structure
  2. Use dom_search to locate data elements
  3. Use dom_extract to pull structured data
  4. Save results as JSON
model: { provider: openai, id: gpt-4o }
tools: [browser, dom_search, dom_extract, write_file]
max_iterations: 20
temperature: 0.1
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
model: { provider: openai, id: gpt-4o }
tools: [google_search, browser, write_file]
max_iterations: 15
temperature: 0.3
```

## Form Automation Agent
```yaml
name: form-filler
description: Automate web form interactions
system_prompt: |
  You automate web form interactions:
  1. Navigate to the target page
  2. Examine the form structure with dom_examine
  3. Fill fields and submit forms
  4. Capture confirmation screenshots
model: { provider: openai, id: gpt-4o }
tools: [browser, dom_examine, dom_search, take_screenshot, write_file]
max_iterations: 10
temperature: 0.1
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
model: { provider: openai, id: gpt-4o }
tools: [google_search, browser, dom_search, dom_extract, write_file]
max_iterations: 20
temperature: 0.2
```

# CLI Usage

```bash
# Run a browser task
nodetool agent --config browser-agent.yaml \
  --prompt "Go to example.com and extract all product names and prices"

# Research task
nodetool agent --config web-researcher.yaml \
  --prompt "Research the latest developments in WebAssembly" \
  --output research-report.md

# Interactive browsing session
nodetool agent --config browser-agent.yaml --interactive
```

# Programmatic Usage (TypeScript)

```typescript
import { Agent } from "@nodetool/core";
import {
  BrowserTool,
  ScreenshotTool,
  DOMExamineTool,
  DOMSearchTool,
  DOMExtractTool,
} from "@nodetool/core/tools";

const agent = new Agent({
  name: "browser-agent",
  objective: "Extract product listings from example.com",
  provider: openaiProvider,
  model: "gpt-4o",
  tools: [
    new BrowserTool(),
    new ScreenshotTool(),
    new DOMSearchTool(),
    new DOMExtractTool(),
  ],
  workspace: "/tmp/browser-output",
  maxSteps: 15,
});

for await (const message of agent.execute(context)) {
  if (message.type === "chunk") {
    process.stdout.write(message.content);
  }
}
```

# Tips

- **Use `dom_search` + `dom_extract`** for structured data with known CSS selectors
- **Use `dom_examine`** first to understand page structure before extracting
- **Use `take_screenshot`** to debug visual state or verify interactions
- **Set `max_iterations` higher** (15-20) for multi-page tasks
- **Use low temperature** (0.1-0.3) for reliable, deterministic browsing
- **Combine with `google_search`** when the agent needs to discover URLs first
