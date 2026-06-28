---
layout: page
title: "Agent System"
permalink: /agents
description: "Architecture of the NodeTool agent system — planning, execution, tools, skills, and workflow integration."
---

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [CLAUDE.md](../CLAUDE.md) → **Agent System**

> Code in `@nodetool-ai/agents` follows the canonical standards in [DEVELOPMENT_STANDARDS.md](DEVELOPMENT_STANDARDS.md) — in particular, the rules for [TypeScript (§1)](DEVELOPMENT_STANDARDS.md#1-typescript), [Error handling (§18)](DEVELOPMENT_STANDARDS.md#18-error-handling), [Observability (§17)](DEVELOPMENT_STANDARDS.md#17-observability), and [Security/Sandboxing (§16)](DEVELOPMENT_STANDARDS.md#16-security). This document describes the architecture; the standards doc describes the rules.

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

| Class | When to Use | Source |
|---|---|---|
| **Agent** | Multi-step objectives needing decomposition (full DAG planning + execution) | `packages/agents/src/agent.ts` |
| **AgentExecutor** | Lightweight value extraction | `packages/agents/src/agent-executor.ts` |
| **TaskPlanner** | Decompose an objective into a task DAG | `packages/agents/src/task-planner.ts` |
| **TaskExecutor** | Walk the step DAG, respecting dependency order | `packages/agents/src/task-executor.ts` |
| **StepExecutor** | Run the tool-calling loop for a single step | `packages/agents/src/step-executor.ts` |

The top-level **Agent** orchestrates planning (via `TaskPlanner`) and execution (via `TaskExecutor` →
`StepExecutor`), then validates the final result against the output schema. Its constructor accepts a
`provider` (`BaseProvider`), `model`, `tools`, `objective`, and the options in the
[Configuration Reference](#configuration-reference) below. It exposes
`execute(context): AsyncGenerator<ProcessingMessage>` and `getResults(): unknown`.

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

## Memory

Every `ProcessingContext` carries an **`AgentMemory`** at `context.memory` — the single namespaced store for results shared between steps, tasks, sub-agents, and tools. There are no parallel result maps; all executors write and read through the same API.

```ts
import { memoryKeys } from "@nodetool-ai/runtime";

context.memory.set({
  key: memoryKeys.task("research"),
  kind: "task_result",
  value: { findings: ["alpha", "beta"] },
  source: "research",
  title: "Research findings"
});

context.memory.getValue(memoryKeys.task("research"));
```

| Namespace | Helper | Used For |
|---|---|---|
| `step:<id>` | `memoryKeys.step(id)` | Per-step results |
| `task:<id>` | `memoryKeys.task(id)` | Per-task results |
| `input:<key>` | `memoryKeys.input(key)` | Caller-supplied inputs and edge inputs |
| `shared:<key>` | `memoryKeys.shared(key)` | Cross-agent communication, tool-published facts |

**Access pattern — progressive disclosure via tool calls**: memory contents are NOT auto-injected into prompts. The agent uses three auto-attached tools:

| Tool | Purpose |
|---|---|
| `memory_list` | Discover available entries (metadata only — keys, titles, kinds, byte sizes) |
| `memory_read` | Fetch full values for specific keys |
| `memory_write` | Publish a value under `shared:<key>` for other agents to discover |

The default execution system prompt explains these tools; the user message names only the **specific** upstream keys the planner declared as required for the step. Values are pulled on demand.

**Multi-agent teams** mirror `TaskBoard` `task_completed` events into `context.memory`, so sub-agents see each other's work through `memory_list`.

For the full API, tool schemas, propagation flow, examples, and troubleshooting, see [Agent Memory System](agent-memory.md).

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

### Builtin Tools in Tool-Agent Nodes (`runAgentLoop`)

There is a **separate** registry for tools that workflow tool-agent nodes
expose via `runAgentLoop` (in `@nodetool-ai/llm-nodes`) — distinct from the
`@nodetool-ai/agents` `registerTool`/`resolveTool` registry above. Builtin
node tools (e.g. the `browser_*` CDP tools) are registered into it at module
load via `registerBuiltinAgentToolClasses` (e.g. `code-nodes/sandbox.ts`) and
resolved with `resolveBuiltinAgentTool(name)`.

**Hydration contract:** a tool may be passed as a fully-formed `ToolLike` (has
`process` + `inputSchema`) or a bare name-stub (`{ name }`). `runAgentLoop`
hydrates stubs by name before use, so either form works — a real tool passes
through unchanged. **But a stub is inert until hydrated:** it has no `process`,
so if you build tools by name and execute them *outside* `runAgentLoop`, call
`resolveBuiltinAgentTool` / `hydrateBuiltinAgentTool` yourself first, or the
model gets a schemaless tool and every call is rejected as "Unknown tool".

```ts
// In a tool-agent node, getTools() may return hydrated tools…
return TOOL_NAMES.map((name) => resolveBuiltinAgentTool(name)).filter(Boolean);
// …or stubs (runAgentLoop will hydrate them):
return TOOL_NAMES.map((name) => ({ name }));
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

The agent system surfaces in the workflow editor through several node types defined in `packages/llm-nodes/src/nodes/agents.ts`:

| Node | Purpose |
|---|---|
| **AgentNode** | General-purpose agent with streaming output, tool access, and control edges |
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
  maxStepIterations: 15,
});

for await (const message of agent.execute(context)) {
  if (message.type === "chunk") {
    process.stdout.write(message.content);
  }
}

const result = agent.getResults();
```

### Agent with an Output Schema

Pass an `outputSchema` to have the final result validated against a JSON schema:

```ts
import { Agent } from "@nodetool-ai/agents";

const agent = new Agent({
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
| `maxSteps` | `10` | Maximum number of steps in a task |
| `maxStepIterations` | `15` | Maximum LLM round-trips per step |
| `outputSchema` | — | JSON schema for the final result |
| `workspace` | auto-generated | Directory for file artifacts |
| `skills` | — | Explicit skill names to load |
| `skillDirs` | — | Additional directories to search for skills |
| `task` | — | Pre-planned task (skips planning phase) |

---

## Claude Agent SDK

`ClaudeAgentProvider` (`packages/runtime/src/providers/claude-agent-provider.ts`)
is a **pure LLM provider** that reaches Claude through the local `claude` CLI
(the Claude Agent SDK transport) instead of an API key. It sends no
`ANTHROPIC_API_KEY`; the CLI authenticates with the machine's logged-in Claude
subscription (credentials stored under `~/.claude`), so it bills against the
subscription rather than per-token API spend.

Internally it spawns the executable in non-interactive print mode
(`claude -p --output-format stream-json --verbose --include-partial-messages`)
and translates the CLI's newline-delimited JSON stream into the standard
`ProviderStreamItem` stream (text + thinking chunks). The Claude Code agent loop
is collapsed to a single, tool-free turn so it behaves like a plain chat
completion:

- `--system-prompt <prompt>` fully **replaces** the coding-agent preset with the
  caller's system message (or a generic assistant prompt), giving vanilla LLM
  behaviour rather than the Claude Code persona.
- `--allowedTools ""` disables every built-in tool, and `--max-turns 1` keeps it
  to one model call. `hasToolSupport()` returns `false` — the caller drives any
  tool loop with a `tool_use`-returning provider (e.g. `AnthropicProvider`).

Provider id: `claude_agent_sdk` (`PROVIDER_IDS.CLAUDE_AGENT_SDK`). It registers
with no credential kwargs (auth lives in the CLI's store, so it is always
"configured"; a missing CLI surfaces at call time) and is pruned from the cloud
profile since it needs a local executable. Token usage is attributed to the
concrete dated model the CLI resolves an alias to (captured from the
`message_start` event) so cost maps onto Anthropic pricing.

**Soft dependency.** `@anthropic-ai/claude-agent-sdk` is an *optional peer
dependency* of `@nodetool-ai/runtime` — it is not installed by default and must
be added with the package manager (`npm install @anthropic-ai/claude-agent-sdk`)
before this provider can run. The package is imported lazily, so its absence
only surfaces — as a clear install hint — when the provider is actually used;
the rest of the runtime and the browser worker bundle never pull it in.

### Executable resolution & nested sessions

The binary is resolved from `CLAUDE_CODE_EXECUTABLE` (explicit path) and
otherwise `claude` on `PATH`. The desktop app ships `@anthropic-ai/claude-code`
as a runtime package; server/dev users need `claude` installed and logged in.

When NodeTool itself runs **under** Claude Code (e.g. Claude Code on the web),
the inherited `CLAUDECODE` / `CLAUDE_CODE_*` / `CLAUDE_SESSION_*` /
`CLAUDE_ENABLE_*` / `CLAUDE_AFTER_*` / `CLAUDE_AUTO_*` env vars are stripped from
the spawned child so the nested CLI starts clean. `ANTHROPIC_BASE_URL` and
`HTTP_PROXY` / `HTTPS_PROXY` are preserved for API routing. Because no tools are
enabled, the provider never passes `--dangerously-skip-permissions`, so it
avoids the SDK's refusal to run that flag as `uid=0`.

---

## Related Pages

- [Agent Memory System](agent-memory.md) — Unified memory across all agent types: API, propagation, examples
- [Global Chat & Agents](global-chat-agents.md) — Using agents in the chat interface
- [Agent CLI](agent-cli.md) — Running agents from the command line
- [Agent Configuration Schema](agent-config-schema.md) — YAML configuration reference
- [Custom Nodes Guide](developer/custom-nodes-guide.md) — Building custom workflow nodes
