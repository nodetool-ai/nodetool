/**
 * CompilerAgent — final synthesis pass for plan-mode execution.
 *
 * Runs after `ParallelTaskExecutor` finishes. Reads the entire `context.memory`
 * snapshot (task results, step results, shared facts, inputs) and produces a
 * single schema-conformant final result via `finish_step`.
 *
 * The planner does NOT produce a synthesis/aggregation step anymore — that
 * concern is owned by this agent. This decouples planning quality from
 * synthesis quality, gives synthesis full memory access, and lets us use a
 * stronger (e.g. reasoning) model for compilation specifically.
 *
 * Toolset: `memory_list`, `memory_read`, `finish_step`. No domain tools, no
 * `memory_write` — the compiler is read-only over memory and produces exactly
 * one result.
 */

import { createLogger } from "@nodetool-ai/config";
import type {
  BaseProvider,
  Message,
  ProcessingContext,
  ToolCall,
  ProviderStreamItem
} from "@nodetool-ai/runtime";
import { withAgentSpanGen } from "@nodetool-ai/runtime";
import type {
  Chunk,
  LogUpdate,
  ProcessingMessage,
  StepResult,
  ToolCallUpdate
} from "@nodetool-ai/protocol";

import { FinishStepTool } from "./tools/finish-step-tool.js";
import {
  MemoryListTool,
  MemoryReadTool
} from "./tools/memory-tools.js";
import type { Tool } from "./tools/base-tool.js";
import type { TaskPlan } from "./types.js";

const log = createLogger("nodetool.agents.compiler-agent");

const MAX_COMPILE_ROUNDS = 6;
const MAX_TOOL_RESULT_CHARS = 20_000;

const COMPILER_SYSTEM_PROMPT = `# Role
You are the Compiler. The plan has finished gathering information; your only
job is to synthesize the gathered results into the final deliverable.

# How To Work
1. Call \`memory_list\` first to see every entry that the plan produced.
   Entries with kind \`task_result\` are task outputs, \`step_result\` are step
   outputs, \`input\` are caller-supplied inputs, and \`shared\` are facts the
   agents published explicitly.
2. Call \`memory_read\` for the keys whose full values you need. Read multiple
   keys in a single call when you need several.
3. Synthesize a single result that satisfies the declared output schema.
4. Call \`finish_step\` exactly once with \`{"result": <result>}\`. Stop
   immediately after — do not emit additional text or tool calls.

# Discipline
- Do NOT do additional research or invoke domain tools — there are none.
- Preserve every concrete artifact from upstream results (URLs, asset IDs,
  file paths, tables, key facts). Never paraphrase them away.
- If the gathered information is insufficient, still produce the best
  schema-conformant result you can from what is available. Do not invent
  facts that are not in memory.
- Do not reveal chain-of-thought or internal reasoning.`;

export interface CompilerAgentOptions {
  objective: string;
  outputSchema: Record<string, unknown>;
  provider: BaseProvider;
  model: string;
  context: ProcessingContext;
  /**
   * The plan that produced the memory entries this compiler will synthesize.
   * Surfaced in the prompt so the model knows which `task:<id>` keys to expect
   * and what each task was supposed to accomplish — much more useful than
   * memory metadata alone, which only shows titles.
   */
  taskPlan?: TaskPlan;
  /** Optional preamble layered above the default compiler system prompt. */
  systemPrompt?: string;
  maxRounds?: number;
  threadId?: string;
}

export class CompilerAgent {
  private readonly objective: string;
  private readonly outputSchema: Record<string, unknown>;
  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly context: ProcessingContext;
  private readonly taskPlan?: TaskPlan;
  private readonly systemPrompt: string;
  private readonly maxRounds: number;
  private readonly threadId?: string;

  constructor(opts: CompilerAgentOptions) {
    this.objective = opts.objective;
    this.outputSchema = opts.outputSchema;
    this.provider = opts.provider;
    this.model = opts.model;
    this.context = opts.context;
    this.taskPlan = opts.taskPlan;
    this.maxRounds = opts.maxRounds ?? MAX_COMPILE_ROUNDS;
    this.threadId = opts.threadId;

    const preamble = opts.systemPrompt?.trim();
    this.systemPrompt = preamble
      ? `${preamble}\n\n---\n\n${COMPILER_SYSTEM_PROMPT}`
      : COMPILER_SYSTEM_PROMPT;
  }

  /**
   * Run the compilation pass. Yields ProcessingMessage updates and returns
   * the final synthesized result (or null if the model failed to call
   * `finish_step` before the round budget was exhausted).
   */
  async *compile(): AsyncGenerator<ProcessingMessage, unknown> {
    return yield* withAgentSpanGen(
      "compile",
      {
        objective: this.objective,
        provider: this.provider.provider,
        model: this.model,
        toolsCount: 3,
        extra: { "agent.kind": "compile" }
      },
      () => this._compileImpl()
    );
  }

  private async *_compileImpl(): AsyncGenerator<ProcessingMessage, unknown> {
    const finishStepTool = new FinishStepTool(this.outputSchema);
    const memoryList = new MemoryListTool();
    const memoryRead = new MemoryReadTool();
    const tools: Tool[] = [memoryList, memoryRead, finishStepTool];
    const toolsByName = new Map(tools.map((t) => [t.name, t]));
    const providerTools = tools.map((t) => t.toProviderTool());

    const snapshot = this.context.memory.list();
    const inventory = snapshot.length
      ? snapshot
          .map((e) => {
            const title = e.title ? ` — ${e.title}` : "";
            return `- ${e.key} (${e.kind})${title}`;
          })
          .join("\n")
      : "(no memory entries — produce the best result you can from the objective alone)";

    const planSection = this.formatTaskPlan();

    const userPrompt = [
      `Objective:\n${this.objective}`,
      ...(planSection ? ["", planSection] : []),
      "",
      "Memory inventory (call `memory_read` for the keys whose values you need):",
      inventory,
      "",
      "Produce the final result and call `finish_step` exactly once."
    ].join("\n");

    const messages: Message[] = [
      { role: "system", content: this.systemPrompt },
      { role: "user", content: userPrompt }
    ];

    yield {
      type: "log_update",
      node_id: "compiler",
      node_name: "Compiler",
      content: `Compiling final result from ${snapshot.length} memory entries...`,
      severity: "info"
    } satisfies LogUpdate;

    for (let round = 0; round < this.maxRounds; round++) {
      const toolCalls: ToolCall[] = [];
      let assistantText = "";

      const stream = this.provider.generateMessagesTraced({
        messages: [...messages],
        model: this.model,
        tools: providerTools,
        threadId: this.threadId
      });

      for await (const item of stream as AsyncGenerator<ProviderStreamItem>) {
        if (isChunk(item)) {
          assistantText += item.content ?? "";
          yield {
            type: "chunk",
            node_id: "compiler",
            content: item.content ?? "",
            done: false
          } satisfies Chunk;
        }
        if (isToolCall(item)) {
          toolCalls.push(item);
        }
      }

      messages.push({
        role: "assistant",
        content: assistantText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
      });

      if (toolCalls.length === 0) {
        // Nudge once, then stop wasting rounds.
        messages.push({
          role: "user",
          content:
            "You did not call any tool. Call `memory_read` for the keys you need, " +
            "then call `finish_step` exactly once with the final result."
        });
        continue;
      }

      // Find finish_step in this batch — that ends the loop.
      const finishCall = toolCalls.find((tc) => tc.name === "finish_step");
      if (finishCall) {
        yield {
          type: "tool_call_update",
          node_id: "compiler",
          name: finishCall.name,
          args: finishCall.args,
          message: "Finalizing result"
        } satisfies ToolCallUpdate;

        const resultPayload =
          (finishCall.args?.["result"] as unknown) ?? finishCall.args;
        if (resultPayload === undefined || resultPayload === null) {
          messages.push({
            role: "tool",
            toolCallId: finishCall.id,
            content: '{"error": "Missing result in finish_step call"}'
          });
          continue;
        }

        log.info("Compiler finished", { entries: snapshot.length });
        yield {
          type: "step_result",
          step: { id: "compiler", instructions: this.objective },
          result: resultPayload,
          is_task_result: true
        } satisfies StepResult;
        return resultPayload;
      }

      // Otherwise dispatch the read-only memory tools.
      for (const tc of toolCalls) {
        const tool = toolsByName.get(tc.name);
        let serialized: string;
        if (!tool) {
          serialized = JSON.stringify({ error: `Unknown tool: ${tc.name}` });
        } else {
          yield {
            type: "tool_call_update",
            node_id: "compiler",
            name: tc.name,
            args: tc.args,
            message: tool.userMessage(tc.args ?? {})
          } satisfies ToolCallUpdate;
          try {
            const result = await tool.process(this.context, tc.args ?? {});
            serialized =
              typeof result === "string" ? result : JSON.stringify(result);
            if (serialized.length > MAX_TOOL_RESULT_CHARS) {
              serialized =
                serialized.slice(0, MAX_TOOL_RESULT_CHARS) +
                "... [truncated]";
            }
          } catch (e) {
            serialized = JSON.stringify({ error: String(e) });
          }
        }
        messages.push({
          role: "tool",
          toolCallId: tc.id,
          content: serialized
        });
      }
    }

    log.warn("Compiler exhausted round budget without finish_step", {
      rounds: this.maxRounds
    });
    return null;
  }

  /**
   * Render the executed task plan so the compiler knows which `task:<id>`
   * keys to expect and what each task was meant to produce. Returns an
   * empty string when no plan is supplied.
   */
  private formatTaskPlan(): string {
    if (!this.taskPlan || this.taskPlan.tasks.length === 0) return "";

    const lines: string[] = [
      `Plan executed (title: ${this.taskPlan.title}). Each completed task wrote its result to \`task:<id>\`:`
    ];
    for (const task of this.taskPlan.tasks) {
      const deps =
        task.dependsOn && task.dependsOn.length > 0
          ? ` [depends_on: ${task.dependsOn.join(", ")}]`
          : "";
      lines.push(`- task:${task.id}${deps} — ${task.title}`);
      for (const step of task.steps) {
        const instr = step.instructions.replace(/\s+/g, " ").trim();
        const summary = instr.length > 140 ? instr.slice(0, 140) + "…" : instr;
        lines.push(`    • ${step.id}: ${summary}`);
      }
    }
    return lines.join("\n");
  }
}

function isChunk(item: ProviderStreamItem): item is Chunk {
  return (
    "type" in item &&
    (item as unknown as Record<string, unknown>)["type"] === "chunk" &&
    typeof (item as unknown as Record<string, unknown>)["content"] === "string"
  );
}

function isToolCall(item: ProviderStreamItem): item is ToolCall {
  return (
    "name" in item &&
    typeof (item as unknown as Record<string, unknown>)["name"] === "string" &&
    "id" in item
  );
}
