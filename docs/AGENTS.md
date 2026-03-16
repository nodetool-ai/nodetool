---
layout: page
title: "Agent System"
permalink: /agents
description: "Architecture of the NodeTool agent system — planning, execution, tools, skills, and workflow integration."
---

The **agent system** (`@nodetool/agents`) gives LLMs the ability to decompose complex objectives into steps, execute those steps with tools, and return structured results. It powers the Agent, Research Agent, and Control Agent nodes in the workflow editor, as well as the standalone Agent CLI.

---

## Architecture overview

```
Objective
    |
    v
+-- Agent -------------------------------------------------+
|                                                           |
|  1. Skill resolution   (load SKILL.md files)              |
|  2. Planning phase     (TaskPlanner → Task with Steps)    |
|  3. Execution phase    (TaskExecutor → StepExecutor loop) |
|                                                           |
+-----------------------------------------------------------+
    |
    v
Structured result (validated against output schema)
```

Three agent classes share the same base:

| Class | When to use | Package |
|---|---|---|
| **Agent** | Multi-step objectives that need planning | `@nodetool/agents` |
| **SimpleAgent** | Single-step tasks with a known output schema | `@nodetool/agents` |
| **AgentExecutor** | Lightweight value extraction (no planning) | `@nodetool/agents` |

All agents extend **BaseAgent**, which defines the contract:

```ts
abstract class BaseAgent {
  readonly name: string;
  readonly objective: string;
  readonly provider: BaseProvider;   // LLM provider (OpenAI, Ollama, etc.)
  readonly model: string;
  readonly tools: Tool[];

  abstract execute(context: ProcessingContext): AsyncGenerator<ProcessingMessage>;
  abstract getResults(): unknown;
}
```

---

## Planning phase

When you use the full **Agent**, the first thing it does is call **TaskPlanner** to decompose the objective into a **Task** — an ordered list of **Steps** with dependency edges.

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
  dependsOn: string[];          // IDs of prerequisite steps
  tools?: string[];             // restrict available tools
  outputSchema?: string;        // JSON schema for validation
  mode?: "discover" | "process" | "aggregate";
  perItemInstructions?: string; // template for fan-out
  completed: boolean;
}
```

The planner sends the objective to the LLM with a `create_task` tool. The response is parsed, validated as a DAG (no circular dependencies), and retried up to three times on failure.

You can skip planning entirely by passing a pre-built `task` object to the Agent constructor.

---

## Execution phase

**TaskExecutor** walks the step DAG, respecting dependency order. For each step, it creates a **StepExecutor** that runs a tool-calling loop:

1. Build messages — system prompt, user instructions, upstream step results
2. Stream the LLM response
3. Collect and execute tool calls in parallel
4. Append tool results to conversation history
5. Repeat until the LLM calls `finish_step` or max iterations are reached
6. Validate the result against the step's output schema

### Token management

StepExecutor estimates token usage and enters a "conclusion stage" at 90% of the budget. In this stage only the `finish_step` tool is available, forcing the LLM to wrap up. Older messages are summarized to stay within limits.

### Fan-out execution

Steps can use three modes for batch processing:

- **discover** — produces a list of items
- **process** — creates an ephemeral sub-step per item (runs in parallel)
- **aggregate** — collects all per-item results into a final output

---

## Tool system

Every tool extends a single base class:

```ts
abstract class Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: Record<string, unknown>;

  abstract process(
    context: ProcessingContext,
    params: Record<string, unknown>,
  ): Promise<unknown>;

  toProviderTool(): ProviderTool;  // convert to LLM tool-call format
}
```

### Built-in tools

| Category | Tools | Source |
|---|---|---|
| **Step control** | `FinishStepTool` | `finish-step-tool.ts` |
| **Workflow control** | `ControlNodeTool` | `control-tool.ts` |
| **File system** | `ReadFileTool`, `WriteFileTool`, `ListDirectoryTool` | `filesystem-tools.ts` |
| **Web** | `BrowserTool`, `ScreenshotTool` | `browser-tools.ts` |
| **HTTP** | `HttpRequestTool`, `DownloadFileTool` | `http-tools.ts` |
| **Search** | `GoogleSearchTool`, `GoogleNewsTool`, `GoogleImagesTool` | `search-tools.ts` |
| **Code execution** | `RunCodeTool` | `code-tools.ts` |
| **Math** | `CalculatorTool`, `StatisticsTool`, `GeometryTool`, `TrigonometryTool`, `ConversionTool` | `math-tools.ts`, `calculator-tool.ts` |
| **OpenAI** | `OpenAIWebSearchTool`, `OpenAIImageGenerationTool`, `OpenAITextToSpeechTool` | `openai-tools.ts` |
| **Google** | `GoogleGroundedSearchTool`, `GoogleImageGenerationTool` | `google-tools.ts` |
| **Vector DB** | `VecTextSearchTool`, `VecIndexTool`, `VecHybridSearchTool`, and more | `vector-tools.ts` |
| **PDF** | `ExtractPDFTextTool`, `ConvertPDFToMarkdownTool`, and more | `pdf-tools.ts` |
| **Email** | `SearchEmailTool`, `ArchiveEmailTool`, `AddLabelToEmailTool` | `email-tools.ts` |
| **Workspace** | `WorkspaceReadTool`, `WorkspaceWriteTool`, `WorkspaceListTool` | `workspace-tools.ts` |
| **Assets** | `SaveAssetTool`, `ReadAssetTool` | `asset-tools.ts` |
| **MCP** | `ListWorkflowsTool`, `RunWorkflowTool`, `SearchNodesTool`, and more | `mcp-tools.ts` |

### Tool registry

Register custom tools so they can be resolved by name:

```ts
import { registerTool, resolveTool, getAllTools } from "@nodetool/agents";

registerTool(new MyCustomTool());
const tool = resolveTool("my_custom_tool");
```

### Writing a custom tool

```ts
import { Tool } from "@nodetool/agents";
import type { ProcessingContext } from "@nodetool/runtime";

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

---

## Skills

Skills are markdown files (`SKILL.md`) that inject domain-specific instructions into the agent's system prompt.

### Skill format

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

### Skill discovery

The agent searches these directories (in order):

1. Directories passed to the constructor (`skillDirs`)
2. Paths in the `NODETOOL_AGENT_SKILL_DIRS` environment variable
3. `./.claude/skills`
4. `~/.claude/skills`
5. `~/.codex/skills`

### Skill resolution

- **Explicit** — set `NODETOOL_AGENT_SKILLS=skill-a,skill-b` or pass `skills: ["skill-a"]` in the constructor
- **Auto-select** — the agent matches words in the objective against skill descriptions (disable with `NODETOOL_AGENT_AUTO_SKILLS=0`)

Matched skill instructions are prepended to the system prompt under an `# Agent Skills` header.

---

## Workflow nodes

The agent system surfaces in the workflow editor through several node types defined in `base-nodes/src/nodes/agents.ts`:

| Node | Purpose |
|---|---|
| **AgentNode** | General-purpose agent with streaming output, tool access, and control edges |
| **ResearchAgentNode** | Specialized for research — returns findings array and summary |
| **SummarizerNode** | Summarize text with streaming output |
| **ExtractorNode** | Extract structured data from text |
| **ClassifierNode** | Classify text into categories |
| **CreateThreadNode** | Manage multi-turn conversation threads |

### Control edges

When an agent node has outgoing control edges, **ControlNodeTool** instances are automatically added to its tool list. The agent can call these tools to trigger downstream nodes with specific parameter values:

```
AgentNode ──control edge──> ImageGeneratorNode
   │
   └─ LLM calls "image_generator" tool with { prompt: "sunset over mountains" }
      → ImageGeneratorNode receives prompt override and executes
```

---

## Using agents programmatically

### Full agent with planning

```ts
import { Agent } from "@nodetool/agents";
import { BrowserTool, GoogleSearchTool, WriteFileTool } from "@nodetool/agents";

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

### Simple agent (single step)

```ts
import { SimpleAgent } from "@nodetool/agents";

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

## Configuration reference

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

## Related pages

- [Global Chat & Agents](global-chat-agents.md) — Using agents in the chat interface
- [Agent CLI](agent-cli.md) — Running agents from the command line
- [Agent Configuration Schema](agent-config-schema.md) — YAML configuration reference
- [Custom Nodes Guide](developer/custom-nodes-guide.md) — Building custom workflow nodes
