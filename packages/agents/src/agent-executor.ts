/**
 * AgentExecutor -- value-based task execution using LLM interactions.
 *
 * Port of src/nodetool/agents/agent_executor.py
 *
 * A simplified executor that operates on Python/JS values instead of files.
 * Maintains output type handling while removing file operations.
 */

import type {
  BaseProvider,
  ProcessingContext,
  Message,
  ToolCall,
  ProviderTool
} from "@nodetool/runtime";
import type { Chunk } from "@nodetool/protocol";
import { Tool } from "./tools/base-tool.js";

const DEFAULT_MAX_ITERATIONS = 10;

const METADATA_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    sources: { type: "array", items: { type: "string" } }
  },
  required: ["title", "description"],
  additionalProperties: true
};

export function jsonSchemaForOutputType(type: string): Record<string, unknown> {
  const schemas: Record<string, Record<string, unknown>> = {
    json: { type: "object", description: "JSON object" },
    list: { type: "array", description: "Array of values" },
    string: { type: "string", description: "Text string" },
    number: { type: "number", description: "Numeric value" },
    boolean: { type: "boolean", description: "Boolean value" },
    markdown: { type: "string", description: "Markdown formatted text" },
    html: { type: "string", description: "HTML markup" },
    csv: { type: "string", description: "CSV formatted data" },
    yaml: { type: "string", description: "YAML formatted data" }
  };
  return (
    schemas[type] ?? {
      type: "string",
      description: `Output of type ${type}`
    }
  );
}

export class FinishTool extends Tool {
  readonly name = "finish_task";
  readonly description =
    "Finish the task by providing the final result value and metadata.";
  readonly inputSchema: Record<string, unknown>;

  constructor(
    outputType: string,
    outputSchema: Record<string, unknown> | null
  ) {
    super();
    const resultSchema = outputSchema ?? jsonSchemaForOutputType(outputType);

    this.inputSchema = {
      type: "object",
      properties: {
        result: resultSchema,
        metadata: METADATA_SCHEMA
      },
      required: ["result", "metadata"],
      additionalProperties: false
    };
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return params;
  }
}

export interface AgentExecutorOptions {
  provider: BaseProvider;
  model: string;
  context: ProcessingContext;
  tools: Tool[];
  systemPrompt?: string;
  maxIterations?: number;
  outputType?: string;
  outputSchema?: Record<string, unknown> | null;
  threadId?: string;
}

interface FinishTaskArgs {
  result?: unknown;
  metadata?: Record<string, unknown>;
}

export class AgentExecutor {
  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly context: ProcessingContext;
  private readonly tools: Tool[];
  private readonly finishTool: FinishTool;
  private readonly maxIterations: number;
  private readonly outputType: string;
  private readonly systemPrompt: string;
  private readonly threadId?: string;
  private history: Message[];
  private iterations = 0;
  private completed = false;
  private _result: unknown = null;
  private _metadata: Record<string, unknown> | null = null;

  constructor(options: AgentExecutorOptions) {
    this.provider = options.provider;
    this.model = options.model;
    this.context = options.context;
    this.outputType = options.outputType ?? "string";
    this.threadId = options.threadId;
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;

    this.finishTool = new FinishTool(
      this.outputType,
      options.outputSchema ?? null
    );
    this.tools = [...options.tools, this.finishTool];
    this.systemPrompt = options.systemPrompt ?? this.createSystemPrompt("");
    this.history = [{ role: "system", content: this.systemPrompt }];
  }

  private createSystemPrompt(objective: string): string {
    return `You are an AI agent executing a focused objective. Produce a result of type '${this.outputType}'.

## Operating Mode
- Keep going until the objective is completed; do not hand back early.
- Resolve ambiguity by making reasonable assumptions and record them in \`metadata.notes\`.
- Prefer tool calls and concrete actions over clarifying questions.
- Do not reveal chain-of-thought; output only tool calls and required fields.

## Communication Pattern (Tool Preambles)
- First assistant message: restate the objective in one sentence and list a 1-3 step plan.
- Before each tool call, add a one-sentence rationale describing what and why.
- After tool results, update the plan only if it materially changes.

## Execution Protocol
1. Focus on the objective: ${objective}
2. Use the provided input values efficiently.
3. Perform the minimal steps required to generate the result.
4. Ensure the final result matches the expected output type: ${this.outputType}.
5. Call \`finish_task\` exactly once at the end with final \`result\` and \`metadata\` (title, description, sources, notes).

## Output Discipline
- Prefer deterministic, structured outputs over prose.
- Do not include multi-paragraph docstrings, multi-line comment blocks, or planning documents unless explicitly requested.`;
  }

  /**
   * Check if the provider supports native agentic tool execution.
   */
  private isAgenticProvider(): boolean {
    return (
      (this.provider as unknown as Record<string, unknown>).provider ===
      "claude_agent"
    );
  }

  async *execute(
    objective: string,
    inputs?: Record<string, unknown>
  ): AsyncGenerator<Chunk | ToolCall> {
    const promptParts: string[] = [`**Objective:**\n${objective}\n`];

    if (inputs && Object.keys(inputs).length > 0) {
      const inputStr = Object.entries(inputs)
        .map(([key, val]) => `- ${key}: ${formatValue(val)}`)
        .join("\n");
      promptParts.push(`**Input Values:**\n${inputStr}\n`);
    }

    promptParts.push(
      "Please complete the objective using the provided input values."
    );

    this.history.push({
      role: "user",
      content: promptParts.join("\n")
    });

    const providerTools: ProviderTool[] = this.tools.map((t) =>
      t.toProviderTool()
    );

    // --- Agentic provider fast-path ---
    // The provider handles the full tool loop in a single call via MCP.
    if (this.isAgenticProvider()) {
      yield* this.executeAgentic(providerTools);
      return;
    }

    // --- Standard multi-iteration loop (for non-agentic providers) ---
    while (!this.completed && this.iterations < this.maxIterations) {
      this.iterations += 1;

      const response = await this.provider.generateMessageTraced({
        messages: this.history,
        model: this.model,
        tools: providerTools,
        threadId: this.threadId
      });

      if (response.content) {
        yield {
          type: "chunk",
          content: String(response.content)
        } as Chunk;
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls ?? undefined
      };
      this.history.push(assistantMessage);

      if (response.toolCalls) {
        for (const toolCall of response.toolCalls) {
          yield toolCall;

          const result = await this.handleToolCall(toolCall);

          let serialized: string;
          if (result == null) {
            serialized = "Tool returned no output.";
          } else {
            try {
              serialized = JSON.stringify(result);
            } catch {
              serialized = JSON.stringify({
                error: "Failed to serialize tool result",
                result_repr: String(result)
              });
            }
          }

          this.history.push({
            role: "tool",
            content: serialized,
            toolCallId: toolCall.id
          });

          if (toolCall.name === "finish_task") {
            this.completed = true;
            this._result = toolCall.args.result ?? null;
            this._metadata =
              (toolCall.args.metadata as Record<string, unknown>) ?? null;
            break;
          }
        }
      }
    }

    if (!this.completed) {
      this.completed = true;
      this._result = `Task incomplete after ${this.maxIterations} iterations`;
      this._metadata = {
        title: "Incomplete Task",
        description: "Task did not complete within iteration limit",
        sources: []
      };
    }
  }

  /**
   * Agentic execution: single provider call handles all tool calls via MCP.
   * The onToolCall callback executes tools natively; finish_task signals completion.
   */
  private async *executeAgentic(
    providerTools: ProviderTool[]
  ): AsyncGenerator<Chunk | ToolCall> {
    const finishTaskState: { args: FinishTaskArgs | null } = { args: null };
    const getFinishTaskArgs = (): FinishTaskArgs | null => finishTaskState.args;

    const onToolCall = async (
      name: string,
      args: Record<string, unknown>
    ): Promise<string> => {
      if (name === "finish_task") {
        finishTaskState.args = args as FinishTaskArgs;
        return JSON.stringify({ status: "finished" });
      }
      const tool = this.tools.find((t) => t.name === name);
      if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });
      try {
        const result = await tool.process(this.context, args);
        const raw =
          typeof result === "string" ? result : JSON.stringify(result ?? null);
        if (raw.length > 25_000) {
          return (
            raw.slice(0, 25_000) +
            `\n...[truncated ${raw.length - 25_000} chars]`
          );
        }
        return raw;
      } catch (e) {
        return JSON.stringify({ error: String(e) });
      }
    };

    const response = await this.provider.generateMessageTraced({
      messages: this.history,
      model: this.model,
      tools: providerTools,
      threadId: this.threadId,
      onToolCall
    });

    if (response.content) {
      yield { type: "chunk", content: String(response.content) } as Chunk;
    }

    // Yield tool calls for tracking
    if (response.toolCalls) {
      for (const tc of response.toolCalls) {
        yield tc;
      }
    }

    // Check if finish_task was called via MCP
    const initialFinishTaskArgs = getFinishTaskArgs();
    if (initialFinishTaskArgs) {
      this.completed = true;
      this._result = initialFinishTaskArgs.result ?? null;
      this._metadata = initialFinishTaskArgs.metadata ?? null;
      return;
    }

    // Fallback: send a nudge to call finish_task
    const nudgeMessages: Message[] = [
      ...this.history,
      { role: "assistant", content: String(response.content ?? "") },
      {
        role: "user",
        content: `Now call finish_task with the final result and metadata. The result type should be '${this.outputType}'.`
      }
    ];

    finishTaskState.args = null;
    const nudgeResponse = await this.provider.generateMessageTraced({
      messages: nudgeMessages,
      model: this.model,
      tools: providerTools,
      threadId: this.threadId,
      onToolCall
    });

    if (nudgeResponse.content) {
      yield { type: "chunk", content: String(nudgeResponse.content) } as Chunk;
    }
    if (nudgeResponse.toolCalls) {
      for (const tc of nudgeResponse.toolCalls) {
        yield tc;
      }
    }

    const nudgedFinishTaskArgs = getFinishTaskArgs();
    if (nudgedFinishTaskArgs) {
      this.completed = true;
      this._result = nudgedFinishTaskArgs.result ?? null;
      this._metadata = nudgedFinishTaskArgs.metadata ?? null;
    } else {
      this.completed = true;
      this._result = String(response.content ?? "Task incomplete");
      this._metadata = {
        title: "Incomplete Task",
        description: "finish_task was not called"
      };
    }
  }

  private async handleToolCall(toolCall: ToolCall): Promise<unknown> {
    const tool = this.tools.find((t) => t.name === toolCall.name);
    if (!tool) {
      return { error: `Tool ${toolCall.name} not found` };
    }

    try {
      return await tool.process(this.context, toolCall.args);
    } catch (e: unknown) {
      return { error: String(e) };
    }
  }

  getResult(): unknown {
    return this._result;
  }

  getMetadata(): Record<string, unknown> | null {
    return this._metadata;
  }
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value.length > 200 ? value.slice(0, 200) + "..." : value;
  }
  if (typeof value === "object" && value !== null) {
    const formatted = JSON.stringify(value, null, 2);
    return formatted.length > 200 ? formatted.slice(0, 200) + "..." : formatted;
  }
  return String(value);
}
