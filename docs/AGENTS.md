---
layout: page
title: "Agent System"
permalink: /agents
description: "Architecture of the NodeTool agent system — planning, execution, tools, skills, and workflow integration."
---

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [CLAUDE.md](../CLAUDE.md) → **Agent System**

The **agent system** (`@nodetool-ai/agents`) gives LLMs the ability to decompose complex objectives into steps, execute those steps with tools, and return structured results. It powers the Agent, Research Agent, and Control Agent nodes in the workflow editor, as well as the standalone Agent CLI.

---

## Architecture Overview

```
Objective (user goal)
    │
    ▼
┌── Agent ──────────────────────────────────────────────┐
│                                                        │
│  1. Skill resolution    (load SKILL.md files)          │
│  2. Planning phase      (TaskPlanner → Task with Steps)│
│  3. Execution phase     (TaskExecutor → StepExecutor)  │
│                                                        │
└────────────────────────────────────────────────────────┘
    │
    ▼
Structured result (validated against output JSON schema)
```

### Agent Classes

| Class | When to Use | Planning | Source |
|---|---|---|---|
| **Agent** | Multi-step objectives needing decomposition | Full DAG planning | `packages/agents/src/agent.ts` |
| **SimpleAgent** | Single-step tasks with known output schema | No planning | `packages/agents/src/simple-agent.ts` |
| **AgentExecutor** | Lightweight value extraction | No planning | `packages/agents/src/agent-executor.ts` |

All agents extend **BaseAgent**:

```ts
abstract class BaseAgent {
  readonly name: string;
  readonly objective: string;
  readonly provider: BaseProvider;   // LLM provider (OpenAI, Anthropic, Ollama, etc.)
  readonly model: string;
  readonly tools: Tool[];

  abstract execute(context: ProcessingContext): AsyncGenerator<ProcessingMessage>;
  abstract getResults(): unknown;
}
```

---

## Planning Phase

When you use the full **Agent**, the first thing it does is call **TaskPlanner** to decompose the objective into a **Task** — an ordered DAG of **Steps** with dependency edges.

```ts
interface Task {
  id: string;
  title: string;
  description?: string;
  steps: Step[];
}

interface Step {
  id: string;
  instructions: string;
  dependsOn: string[];          // IDs of prerequisite steps (forms a DAG)
  tools?: string[];             // restrict available tools for this step
  outputSchema?: string;        // JSON schema for step output validation
  mode?: "discover" | "process" | "aggregate";
  perItemInstructions?: string; // template for fan-out processing
  completed: boolean;
}
```

The planner sends the objective to the LLM with a `create_task` tool. The response is parsed, validated as a DAG (no circular dependencies), and retried up to three times on failure.

You can skip planning entirely by passing a pre-built `task` object to the Agent constructor.

---

## Execution Phase

**TaskExecutor** walks the step DAG, respecting dependency order. For each step, it creates a **StepExecutor** that runs a tool-calling loop:

1. Build messages — system prompt, user instructions, upstream step results
2. Stream the LLM response
3. Collect and execute tool calls in parallel
4. Append tool results to conversation history
5. Repeat until the LLM calls `finish_step` or max iterations are reached
6. Validate the result against the step's output schema

### Token Management

StepExecutor estimates token usage and enters a "conclusion stage" at 90% of the budget. In this stage only the `finish_step` tool is available, forcing the LLM to wrap up. Older messages are summarized to stay within limits.

### Fan-Out Execution

Steps can use three modes for batch processing:

| Mode | Purpose | Example |
|------|---------|---------|
| **discover** | Produce a list of items | "Find all CSV files in the workspace" |
| **process** | Create sub-step per item (runs in parallel) | "Analyze each CSV file" |
| **aggregate** | Collect per-item results into final output | "Summarize all analyses" |

---

## Tool System

Every tool extends a single base class:

```ts
abstract class Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: Record<string, unknown>; // JSON Schema

  abstract process(
    context: ProcessingContext,
    params: Record<string, unknown>,
  ): Promise<unknown>;

  toProviderTool(): ProviderTool;  // convert to LLM tool-call format
}
```

### Built-In Tools

| Category | Tools | Source File |
|---|---|---|
| **Step control** | `FinishStepTool` | `finish-step-tool.ts` |
| **Workflow control** | `ControlNodeTool` | `control-tool.ts` |
| **File system** | `ReadFileTool`, `WriteFileTool`, `ListDirectoryTool` | `filesystem-tools.ts` |
| **Web** | `BrowserTool`, `ScreenshotTool` | `browser-tools.ts` |
| **HTTP** | `HttpRequestTool`, `DownloadFileTool` | `http-tools.ts` |
| **Search** | `GoogleSearchTool`, `GoogleNewsTool`, `GoogleImagesTool` | `search-tools.ts` |
| **Code execution** | `RunCodeTool`, `MiniJSAgentTool` | `code-tools.ts`, `js-code-tool.ts` |
| **Math** | `CalculatorTool`, `StatisticsTool`, `GeometryTool`, `TrigonometryTool`, `ConversionTool` | `math-tools.ts`, `calculator-tool.ts` |
| **OpenAI** | `OpenAIWebSearchTool`, `OpenAIImageGenerationTool`, `OpenAITextToSpeechTool` | `openai-tools.ts` |
| **Google** | `GoogleGroundedSearchTool`, `GoogleImageGenerationTool` | `google-tools.ts` |
| **Vector DB** | `VecTextSearchTool`, `VecIndexTool`, `VecHybridSearchTool`, and more | `vector-tools.ts` |
| **PDF** | `ExtractPDFTextTool`, `ConvertPDFToMarkdownTool`, and more | `pdf-tools.ts` |
| **Email** | `SearchEmailTool`, `ArchiveEmailTool`, `AddLabelToEmailTool` | `email-tools.ts` |
| **Workspace** | `WorkspaceReadTool`, `WorkspaceWriteTool`, `WorkspaceListTool` | `workspace-tools.ts` |
| **Assets** | `SaveAssetTool`, `ReadAssetTool` | `asset-tools.ts` |
| **MCP** | `ListWorkflowsTool`, `RunWorkflowTool`, `SearchNodesTool`, and more | `mcp-tools.ts` |

### JavaScript Sandbox

The `MiniJSAgentTool` and the `CodeNode` workflow node both run user JavaScript inside a **QuickJS WebAssembly** sandbox (`packages/agents/src/js-sandbox.ts`). QuickJS runs in its own WASM instance with a separate heap, providing a true memory/CPU boundary — unlike Node's `node:vm` which shares the V8 heap.

**Limits enforced:**

| Limit | Value |
|-------|-------|
| Execution timeout | 30 s |
| Guest heap | 64 MB |
| Guest stack | 512 KB |
| Max output size | 100 KB |
| Max loop iterations | 10 000 |
| Max `fetch` calls | 20 |
| Max response body | 1 MB |

The sandbox exposes a curated surface: vanilla JavaScript plus bridge functions (`fetch`, `workspace`, `getSecret`, `uuid`, `sleep`, `console`). Third-party libraries (lodash, dayjs, etc.) are intentionally excluded — use dedicated workflow nodes instead.

### Tool Registry

Register custom tools so they can be resolved by name:

```ts
import { registerTool, resolveTool, getAllTools } from "@nodetool-ai/agents";

registerTool(new MyCustomTool());
const tool = resolveTool("my_custom_tool");
const allTools = getAllTools(); // returns all registered tools
```

### Writing a Custom Tool

```ts
import { Tool } from "@nodetool-ai/agents";
import type { ProcessingContext } from "@nodetool-ai/runtime";

class WeatherTool extends Tool {
  readonly name = "get_weather";
  readonly description = "Get current weather for a city.";
  readonly inputSchema = {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" },
    },
    required: ["city"],
  };

  async process(context: ProcessingContext, params: Record<string, unknown>) {
    const city = String(params.city);
    const res = await fetch(`https://api.example.com/weather?q=${encodeURIComponent(city)}`);
    return await res.json();
  }
}
```

**Rules for custom tools**:
- Always validate params before use (the schema provides type hints to the LLM, but doesn't enforce at runtime).
- Return serializable values (JSON-compatible objects).
- Handle errors within `process` — throw `Error` objects with descriptive messages.
- Use `context` for secret resolution, storage access, and provider calls.

---

## Skills

Skills are markdown files (`SKILL.md`) that inject domain-specific instructions into the agent's system prompt.

### Skill Format

```markdown
---
name: data-analysis
description: Analyze CSV datasets and produce summary statistics
---

When working with data analysis tasks:
1. Load the dataset with the file read tool
2. Examine column types and null counts
3. Compute summary statistics
...
```

### Skill Discovery

The agent searches these directories (in order):

1. Directories passed to the constructor (`skillDirs`)
2. Paths in the `NODETOOL_AGENT_SKILL_DIRS` environment variable
3. `./.claude/skills`
4. `~/.claude/skills`
5. `~/.codex/skills`

### Skill Resolution

- **Explicit** — set `NODETOOL_AGENT_SKILLS=skill-a,skill-b` or pass `skills: ["skill-a"]` in the constructor
- **Auto-select** — the agent matches words in the objective against skill descriptions (disable with `NODETOOL_AGENT_AUTO_SKILLS=0`)

Matched skill instructions are prepended to the system prompt under an `# Agent Skills` header.

---

## Workflow Nodes

The agent system surfaces in the workflow editor through several node types defined in `base-nodes/src/nodes/agents.ts`:

| Node | Purpose |
|---|---|
| **AgentNode** | General-purpose agent with streaming output, tool access, and control edges |
| **ResearchAgentNode** | Specialized for research — returns findings array and summary |
| **SummarizerNode** | Summarize text with streaming output |
| **ExtractorNode** | Extract structured data from text |
| **ClassifierNode** | Classify text into categories |
| **CreateThreadNode** | Manage multi-turn conversation threads |

### Control Edges

When an agent node has outgoing control edges, **ControlNodeTool** instances are automatically added to its tool list. The agent can call these tools to trigger downstream nodes with specific parameter values:

```
AgentNode ──control edge──> ImageGeneratorNode
   │
   └─ LLM calls "image_generator" tool with { prompt: "sunset over mountains" }
      → ImageGeneratorNode receives prompt override and executes
```

---

## Using Agents Programmatically

### Full Agent with Planning

```ts
import { Agent } from "@nodetool-ai/agents";
import { BrowserTool, GoogleSearchTool, WriteFileTool } from "@nodetool-ai/agents";

const agent = new Agent({
  name: "researcher",
  objective: "Research TypeScript ORMs and write a comparison report",
  provider: openaiProvider,
  model: "gpt-4o",
  tools: [new GoogleSearchTool(), new BrowserTool(), new WriteFileTool()],
  workspace: "/tmp/research-output",
  maxSteps: 10,
  maxStepIterations: 5,
});

for await (const message of agent.execute(context)) {
  if (message.type === "chunk") {
    process.stdout.write(message.content);
  }
}

const result = agent.getResults();
```

### Simple Agent (Single Step)

```ts
import { SimpleAgent } from "@nodetool-ai/agents";

const agent = new SimpleAgent({
  name: "extractor",
  objective: "Extract all email addresses from this text: ...",
  provider: openaiProvider,
  model: "gpt-4o",
  tools: [],
  outputSchema: {
    type: "object",
    properties: {
      emails: { type: "array", items: { type: "string" } },
    },
  },
});

for await (const message of agent.execute(context)) {
  // handle streaming messages
}

const { emails } = agent.getResults() as { emails: string[] };
```

---

## Configuration Reference

| Option | Default | Description |
|---|---|---|
| `name` | required | Agent identifier |
| `objective` | required | Goal to achieve |
| `provider` | required | LLM provider instance (`BaseProvider`) |
| `model` | required | Model ID (e.g. `"gpt-4o"`) |
| `planningModel` | same as `model` | Alternative model for the planning phase |
| `reasoningModel` | same as `model` | Alternative model for reasoning-heavy steps |
| `tools` | `[]` | Array of `Tool` instances |
| `systemPrompt` | `""` | Custom system instructions |
| `maxTokenLimit` | `128000` | Token budget per step |
| `maxSteps` | `10` | Maximum number of steps in a task |
| `maxStepIterations` | `5` | Maximum LLM round-trips per step |
| `outputSchema` | — | JSON schema for the final result |
| `workspace` | auto-generated | Directory for file artifacts |
| `skills` | — | Explicit skill names to load |
| `skillDirs` | — | Additional directories to search for skills |
| `task` | — | Pre-planned task (skips planning phase) |

---

## Claude Agent SDK Integration

The `ClaudeAgentProvider` in `packages/runtime/src/providers/claude-agent-provider.ts` integrates with the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`):

- Uses Claude subscription (Pro/Max/Team) — does NOT require `ANTHROPIC_API_KEY`
- Requires Claude Code CLI installed and authenticated
- Creates an in-process MCP server via the SDK's `createSdkMcpServer()`
- Disables Claude Code's built-in tools (Bash, Read, Write, etc.) — only NodeTool tools are available
- Supports: Claude Sonnet 4, Claude Opus 4, Claude Haiku 4

### Running in Nested Claude Code Sessions (claude.ai/code)

The provider can run inside a Claude Code web session (e.g. `claude.ai/code`), but the following issues must be handled:

**Environment variable cleanup** — A Claude Code web session injects 20+ `CLAUDE_CODE_*` env vars (session IDs, proxy config, auth tokens, worker epochs, etc.) that conflict with spawning a nested Claude Code subprocess. The provider strips these prefixes from the env before calling `sdk.query()`:
- `CLAUDECODE`, `CLAUDE_CODE`
- `CLAUDE_CODE_*` (session ID, entrypoint, proxy, OAuth, websocket, diagnostics, etc.)
- `CLAUDE_SESSION_*`, `CLAUDE_ENABLE_*`, `CLAUDE_AFTER_*`, `CLAUDE_AUTO_*`

**Keep network/API vars** — Do NOT strip `ANTHROPIC_BASE_URL`, `HTTP_PROXY`, `HTTPS_PROXY`, or `NODE_EXTRA_CA_CERTS`. The containerized environment routes API traffic through these; removing them causes request timeouts.

**Root user restriction** — The SDK adds `--dangerously-skip-permissions` which Claude Code refuses when running as root (uid 0). In the `claude.ai/code` container, the main process runs as root but a `claude` user (uid 999) exists. Running the provider subprocess as this user works:
```bash
su claude -s /bin/bash -c "node ..."
```
The OAuth token at `/home/claude/.claude/remote/.oauth_token` may need `chown claude:claude` to be readable by the non-root user.

**Authentication** — The SDK authenticates via OAuth token (Claude subscription), not `ANTHROPIC_API_KEY`. The web environment stores the token at `/home/claude/.claude/remote/.oauth_token`. The E2E test accepts either `ANTHROPIC_API_KEY` or `CLAUDE_OAUTH_TOKEN` env var as an auth signal.

**E2E tests** — Run as non-root with auth configured:
```bash
chown -R claude:claude /home/claude/.claude/
su claude -s /bin/bash -c "CLAUDE_OAUTH_TOKEN=1 npx vitest run packages/runtime/tests/providers/claude-agent-e2e.test.ts"
```

---

## Related Pages

- [Global Chat & Agents](global-chat-agents.md) — Using agents in the chat interface
- [Agent CLI](agent-cli.md) — Running agents from the command line
- [Agent Configuration Schema](agent-config-schema.md) — YAML configuration reference
- [Custom Nodes Guide](developer/custom-nodes-guide.md) — Building custom workflow nodes
