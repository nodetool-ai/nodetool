/**
 * CodePlanner -- generates one Code node from a natural-language instruction.
 *
 * A system prompt derived
 * from the sandbox manifest, one forced `submit_code` tool, validation run
 * inside the tool, and rejections returned as tool results so the model fixes
 * its submission over feedback rounds. Rounds are capped; an accepted
 * submission aborts the provider loop from inside the tool.
 *
 * Only the accepted tool call's arguments are the result. Assistant prose and
 * fenced code blocks are never scraped.
 */

import type {
  BaseProvider,
  ProcessingContext,
  Message,
  ToolCall
} from "@nodetool-ai/runtime";
import { withAgentSpanGen } from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import type {
  Chunk,
  PlanningUpdate,
  ProcessingMessage,
  ToolCallUpdate,
  ToolResultUpdate
} from "@nodetool-ai/protocol";
import type {
  CodeGenError,
  CodeGenExpectedOutput,
  CodeGenInputPort,
  CodeGenOutputPort,
  CodeGenResponse,
  CodeGenSampleValues
} from "@nodetool-ai/protocol/api-schemas/code-gen.js";

import { linkAbort } from "./utils/link-abort.js";
import { Tool } from "./tools/base-tool.js";
import {
  SubmitCodeTool,
  type SubmitCodeToolOptions
} from "./tools/submit-code-tool.js";
import {
  buildCodeGenRetryPrompt,
  buildCodeGenSystemPrompt,
  buildCodeGenUserPrompt
} from "./code-gen/prompt.js";
import { isFunction } from "./utils/type-guards.js";

const log = createLogger("nodetool.agents.code-planner");

/** Feedback rounds: the first submission plus two chances to fix it. */
const MAX_ROUNDS = 3;

const NODE_ID = "code_planner";

export interface CodePlannerOptions {
  provider: BaseProvider;
  model: string;
  /** What the user asked for, in their own words. */
  instruction: string;
  /** Slots seeded from connected handles. */
  inputs?: readonly CodeGenInputPort[];
  /** Set when generation was launched from a destination handle. */
  expectedOutput?: CodeGenExpectedOutput;
  /** Edit path: the node's current code and slots. */
  currentCode?: string;
  currentInputs?: readonly CodeGenInputPort[];
  currentOutputs?: readonly CodeGenOutputPort[];
  /** Included in the prompt only when the user approved sending them. */
  sampleValues?: CodeGenSampleValues;
  /** Feedback rounds before giving up. Defaults to 3. */
  maxRounds?: number;
  threadId?: string;
  /** External cancellation, e.g. the user closing the dialog. */
  signal?: AbortSignal;
}

/**
 * Span attributes describing the *shape* of a generation request.
 *
 * The instruction is deliberately absent — it is user prose that can carry
 * business detail, and traces ship to third-party backends. Generated code and
 * sample values stay off spans for the same reason. Exported so the omission is
 * asserted by a test rather than resting on review.
 */
export const codeGenSpanAttributes = (
  options: CodePlannerOptions
) => ({
  "agent.plan.kind": "code",
  "code_gen.instruction_chars": options.instruction.length,
  "code_gen.input_count": options.inputs?.length ?? 0,
  "code_gen.has_samples": options.sampleValues !== undefined,
  "code_gen.is_edit": options.currentCode !== undefined
});

export class CodePlanner {
  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly options: CodePlannerOptions;
  private readonly maxRounds: number;

  constructor(options: CodePlannerOptions) {
    this.provider = options.provider;
    this.model = options.model;
    this.options = options;
    this.maxRounds = Math.max(1, options.maxRounds ?? MAX_ROUNDS);
  }

  /**
   * Generate a Code node. Returns the accepted submission or a typed failure —
   * never throws for a provider or model problem.
   */
  async *plan(
    context?: ProcessingContext
  ): AsyncGenerator<ProcessingMessage, CodeGenResponse> {
    return yield* withAgentSpanGen(
      "plan",
      {
        provider: this.provider.provider,
        model: this.model,
        extra: codeGenSpanAttributes(this.options)
      },
      () => this._planImpl(context)
    );
  }

  private async *_planImpl(
    context?: ProcessingContext
  ): AsyncGenerator<ProcessingMessage, CodeGenResponse> {
    yield {
      type: "planning_update",
      node_id: NODE_ID,
      phase: "initialization",
      status: "started",
      content: "Preparing code generation..."
    } satisfies PlanningUpdate;

    if (this.options.signal?.aborted) {
      return this.fail({
        code: "aborted",
        message: "Generation was cancelled."
      });
    }

    if (!(await this.providerSupportsTools())) {
      return this.fail({
        code: "provider_unavailable",
        message: `Model ${this.model} cannot call tools, which code generation requires.`,
        provider: this.provider.provider
      });
    }

    const messages: Message[] = [
      { role: "system", content: buildCodeGenSystemPrompt() },
      {
        role: "user",
        content: buildCodeGenUserPrompt({
          instruction: this.options.instruction,
          inputs: this.options.inputs ?? [],
          expectedOutput: this.options.expectedOutput,
          currentCode: this.options.currentCode,
          currentInputs: this.options.currentInputs,
          currentOutputs: this.options.currentOutputs,
          sampleValues: this.options.sampleValues
        })
      }
    ];

    yield {
      type: "planning_update",
      node_id: NODE_ID,
      phase: "generation",
      status: "running",
      content: "Writing code..."
    } satisfies PlanningUpdate;

    // The tool aborts this controller once a submission is accepted; the same
    // controller carries the caller's cancellation into the provider loop.
    const abort = new AbortController();
    const unlinkAbort = linkAbort(abort, this.options.signal);
    // The seeded slots are the handles the caller already wired an edge to, so
    // the tool enforces them as a contract rather than a suggestion.
    const toolOptions: SubmitCodeToolOptions = {
      onAccepted: () => abort.abort(),
      requiredInputs: this.options.inputs ?? []
    };
    if (this.options.expectedOutput) {
      toolOptions.expectedOutput = this.options.expectedOutput;
    }
    const tool = new SubmitCodeTool(toolOptions);
    // Tool results are produced inside the provider's `execute` closure, off
    // the message stream. Park them here and drain into the stream.
    const pending: ToolResultUpdate[] = [];
    let roundsSpent = 0;
    let loopError: unknown = null;

    const execute = async (
      args: Record<string, unknown>,
      toolCallId?: string
    ): Promise<string> => {
      roundsSpent++;
      const result = await Tool.executeTool(
        tool,
        (context ?? ({} as ProcessingContext)) as ProcessingContext,
        args ?? {}
      );
      const resultStr = JSON.stringify(result);

      log.info("submit_code round", {
        round: roundsSpent,
        accepted: tool.submission != null,
        errors: tool.lastErrors.length
      });

      if (toolCallId) {
        pending.push({
          type: "tool_result_update",
          node_id: NODE_ID,
          tool_call_id: toolCallId,
          name: tool.name,
          result: { result: resultStr }
        });
      }

      if (!tool.submission && roundsSpent >= this.maxRounds) {
        abort.abort();
      }
      return resultStr;
    };

    const stream = this.provider.generateLoop({
      messages,
      model: this.model,
      tools: [{ ...tool.toProviderTool(), execute }],
      threadId: this.options.threadId,
      maxIterations: this.maxRounds,
      sequentialTools: true,
      signal: abort.signal
    });

    try {
      for await (const item of stream) {
        while (pending.length > 0) yield pending.shift()!;
        if ("id" in item && "name" in item && "args" in item) {
          const call = item as ToolCall;
          const args = (call.args as Record<string, unknown>) ?? {};
          yield {
            type: "tool_call_update",
            node_id: NODE_ID,
            tool_call_id: call.id,
            name: call.name,
            args,
            message: Tool.extractMessage(args) ?? "Submitting generated code"
          } satisfies ToolCallUpdate;
          continue;
        }
        if ("type" in item && (item as { type?: string }).type === "chunk") {
          const chunk = item as { content?: string; done?: boolean };
          if (chunk.content && !chunk.done) {
            yield {
              type: "chunk",
              node_id: NODE_ID,
              content: chunk.content,
              done: false
            } satisfies Chunk;
          }
        }
      }
    } catch (error) {
      loopError = error;
    } finally {
      unlinkAbort();
    }
    // The accepting round's result lands after the loop ends, since the tool
    // aborts from inside its own execute.
    while (pending.length > 0) yield pending.shift()!;

    if (tool.submission) {
      yield {
        type: "planning_update",
        node_id: NODE_ID,
        phase: "complete",
        status: "success",
        content: `Generated "${tool.submission.title}"`
      } satisfies PlanningUpdate;
      return { status: "ok", submission: tool.submission };
    }

    if (this.options.signal?.aborted) {
      return this.fail({
        code: "aborted",
        message: "Generation was cancelled."
      });
    }

    if (loopError) {
      return this.fail(
        classifyProviderError(loopError, this.provider.provider)
      );
    }

    yield {
      type: "planning_update",
      node_id: NODE_ID,
      phase: "validation",
      status: "failed",
      content: "No valid code was submitted."
    } satisfies PlanningUpdate;

    return this.fail({
      code: "no_valid_submission",
      message:
        roundsSpent === 0
          ? "The model answered without calling submit_code."
          : `No submission passed validation in ${roundsSpent} round${roundsSpent > 1 ? "s" : ""}.`,
      issues: tool.lastErrors,
      rounds: roundsSpent
    });
  }

  /**
   * Feedback for a rejected submission, for callers that drive the rounds
   * themselves (the loop above feeds errors back as tool results instead).
   */
  buildRetryPrompt(errors: readonly string[], lastCode?: string): string {
    return buildCodeGenRetryPrompt(errors, lastCode);
  }

  private fail(error: CodeGenError): CodeGenResponse {
    log.warn("CodePlanner failed", {
      code: error.code,
      message: error.message
    });
    return { status: "error", error };
  }

  private async providerSupportsTools(): Promise<boolean> {
    // Providers that don't implement the probe are assumed capable; a real
    // refusal then surfaces as a loop error rather than a false negative.
    if (!isFunction(this.provider.hasToolSupport)) return true;
    try {
      return await this.provider.hasToolSupport(this.model);
    } catch {
      return true;
    }
  }
}

/** Map a thrown provider error onto the transport's failure union. */
function classifyProviderError(error: unknown, provider: string): CodeGenError {
  const message = error instanceof Error ? error.message : String(error);
  if (/abort|cancel/i.test(message)) {
    return { code: "aborted", message: "Generation was cancelled." };
  }
  if (/rate.?limit|too many requests|\b429\b/i.test(message)) {
    return { code: "rate_limited", message };
  }
  if (/unavailable|not found|unsupported|connect|econnrefused/i.test(message)) {
    return { code: "provider_unavailable", message, provider };
  }
  return { code: "internal", message };
}
