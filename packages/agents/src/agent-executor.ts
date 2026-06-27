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
} from "@nodetool-ai/runtime";
import type { Chunk } from "@nodetool-ai/protocol";
import { Tool } from "./tools/base-tool.js";
import {
  extractInjectableImages,
  stripImagePayload,
  buildImageInjectionMessage,
  downgradeInjectedImageMessage,
  type ExtractedImages
} from "./tools/image-injection.js";
import {
  FinishTool,
  jsonSchemaForOutputType
} from "./tools/finish-task-tool.js";

const DEFAULT_MAX_ITERATIONS = 10;

// Re-export for backwards compatibility — these were defined here originally.
export { FinishTool, jsonSchemaForOutputType };

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
  /** Injected image messages still carrying pixels (downgraded on the next view). */
  private readonly liveInjectedImageMessages = new Set<Message>();
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
        // Tool messages must stay contiguous after the assistant turn, so any
        // demanded pixels are buffered and injected as user messages afterward.
        const pendingImageInjections: ExtractedImages[] = [];
        for (const toolCall of response.toolCalls) {
          yield toolCall;

          const result = await this.handleToolCall(toolCall);

          // A view-image-style result carries pixels the model asked for; pull
          // them out so the tool message stays a light note and the image rides
          // a dedicated user message into the next turn.
          const injected = extractInjectableImages(result);
          const summary = injected ? stripImagePayload(result) : result;
          if (injected) pendingImageInjections.push(injected);

          let serialized: string;
          if (summary == null) {
            serialized = "Tool returned no output.";
          } else {
            try {
              serialized = JSON.stringify(summary);
            } catch {
              serialized = JSON.stringify({
                error: "Failed to serialize tool result",
                result_repr: String(summary)
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

        if (pendingImageInjections.length > 0) {
          // A fresh view retires the pixels of earlier views — only the latest
          // set rides forward, keeping the standing context cheap.
          for (const old of this.liveInjectedImageMessages) {
            downgradeInjectedImageMessage(old);
          }
          this.liveInjectedImageMessages.clear();
          for (const injected of pendingImageInjections) {
            const message = buildImageInjectionMessage(injected);
            this.history.push(message);
            this.liveInjectedImageMessages.add(message);
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

  private async handleToolCall(toolCall: ToolCall): Promise<unknown> {
    const tool = this.tools.find((t) => t.name === toolCall.name);
    if (!tool) {
      return { error: `Tool ${toolCall.name} not found` };
    }

    try {
      return await Tool.executeTool(tool, this.context, toolCall.args);
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
