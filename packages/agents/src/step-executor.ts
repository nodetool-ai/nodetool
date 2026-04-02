/**
 * StepExecutor -- the core execution engine for a single step.
 *
 * Port of src/nodetool/agents/step_executor.py
 *
 * Manages the LLM interaction loop: sending messages, handling tool calls,
 * monitoring token limits, and capturing the step result via finish_step
 * or inline JSON extraction.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type {
  BaseProvider,
  ProcessingContext,
  Message,
  ToolCall,
  ProviderStreamItem
} from "@nodetool/runtime";
import { createLogger } from "@nodetool/config";
import {
  TaskUpdateEvent,
  type ProcessingMessage,
  type Chunk,
  type ToolCallUpdate,
  type StepResult,
  type TaskUpdate,
  type LogUpdate
} from "@nodetool/protocol";
import type { Step, Task } from "./types.js";
import type { Tool } from "./tools/base-tool.js";
import { ControlNodeTool } from "./tools/control-tool.js";
import { FinishStepTool } from "./tools/finish-step-tool.js";
import { extractJSON } from "./utils/json-parser.js";
import { DEFAULT_TOKEN_LIMIT, MAX_TOOL_RESULT_CHARS } from "./constants.js";

const log = createLogger("nodetool.agents.step-executor");

const DEFAULT_MAX_ITERATIONS = 30;
const JSON_FAILURE_ALERT_THRESHOLD = 3;
const MAX_JSON_PARSE_FAILURES = 6;

// ---------------------------------------------------------------------------
// Shared prompt fragments (DRY)
// ---------------------------------------------------------------------------

const PROMPT_NO_HUMAN_FEEDBACK = `# Hard Constraint: No Human Feedback
- Do NOT ask clarifying questions or request user input.
- If something is ambiguous or missing, choose the simplest reasonable assumption and proceed.`;

const PROMPT_SCHEMA_STRICT = `- Never invent fields: the final result must match the schema exactly (no extra keys; include all required keys).

Output style:
- Keep non-tool messages concise.
- Do not reveal chain-of-thought or internal reasoning traces.`;

const PROMPT_OUTPUT_SCHEMA = `# Output Schema
- The final result must match this schema:
\`\`\`json
{{ output_schema_json }}
\`\`\``;

const PROMPT_TOOL_USE = `# Tool Use
- Use tools only when they materially improve correctness or are required.
- Avoid exploratory or repeated tool calls that are unlikely to change the outcome.`;

const PROMPT_FINISH_STEP = `# Completion (Tool Call Only)
- When done, CALL \`finish_step\` exactly once with:
  {"result": <result>}
- Do NOT output the final result in assistant text.
- Stop immediately after calling \`finish_step\`.`;

// ---------------------------------------------------------------------------
// Assembled system prompts
// ---------------------------------------------------------------------------

const DEFAULT_EXECUTION_SYSTEM_PROMPT = `# Role
You are executing EXACTLY one step within a larger plan. Complete this step end-to-end.

# Objective
{{ step_content }}

${PROMPT_NO_HUMAN_FEEDBACK}

# Scope & Discipline
- Do ONLY what is required to satisfy this step objective; avoid tangents and extra work.
- Use upstream step results already present in context; do not ask for them again.
${PROMPT_SCHEMA_STRICT}

${PROMPT_OUTPUT_SCHEMA}

${PROMPT_TOOL_USE}

${PROMPT_FINISH_STEP}`;

const DEFAULT_FINISH_TASK_SYSTEM_PROMPT = `# Role
You are completing the final aggregation task, synthesizing results from prior steps into a single deliverable.

${PROMPT_NO_HUMAN_FEEDBACK}

# Scope & Discipline
- Focus on synthesis and aggregation only (do not do additional research).
- Use upstream step results already present in context; do not ask for them again.
${PROMPT_SCHEMA_STRICT}

${PROMPT_OUTPUT_SCHEMA}

${PROMPT_TOOL_USE}

${PROMPT_FINISH_STEP}`;

const DEFAULT_UNSTRUCTURED_SYSTEM_PROMPT = `# Role
You are executing a task. Your job is to complete it end-to-end.

# Objective
{{ step_content }}

${PROMPT_NO_HUMAN_FEEDBACK}

# Operating Mode
- Use tools as needed to achieve the objective.
- When you have the final answer or have completed the task, provide the result as your final response.

# Tool Usage Guidelines
## Communication Pattern (Tool Preambles)
Before making tool calls, provide clear progress updates:
1. First assistant message: Restate the objective in one sentence, then list a short numbered plan (1-3 steps).
2. Before each tool call: Emit a one-sentence message describing what you're doing and why.
3. After tool results: Provide a brief update only if the result changes your plan.`;

// ---------------------------------------------------------------------------
// Schema validation helpers
// ---------------------------------------------------------------------------

function validateAndSanitizeSchema(
  schema: unknown,
  defaultDescription = "Result object"
): Record<string, unknown> {
  if (schema === null || schema === undefined) {
    throw new Error("Schema is null or undefined");
  }

  let parsed: unknown = schema;
  if (typeof parsed === "string") {
    parsed = JSON.parse(parsed);
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Schema is not an object (type: ${typeof parsed})`);
  }

  // Deep copy
  const result = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;

  if (!("type" in result)) {
    result["type"] = "object";
  }
  if (!("description" in result)) {
    result["description"] = defaultDescription;
  }

  const disallowedExtensionKeys = new Set([
    "oneOf",
    "anyOf",
    "allOf",
    "not",
    "if",
    "then",
    "else",
    "patternProperties"
  ]);

  function shouldDefaultAdditionalProperties(
    obj: Record<string, unknown>
  ): boolean {
    if ("additionalProperties" in obj) return false;
    if (Object.keys(obj).some((k) => disallowedExtensionKeys.has(k)))
      return false;

    const schemaType = obj["type"];
    if (Array.isArray(schemaType)) {
      if (schemaType.length !== 1 || schemaType[0] !== "object") return false;
    } else if (schemaType !== undefined && schemaType !== "object") {
      return false;
    }

    return (
      schemaType === "object" ||
      (schemaType === undefined && obj["properties"] !== undefined)
    );
  }

  function cleanSchemaRecursive(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.map(cleanSchemaRecursive);
    }
    if (obj !== null && typeof obj === "object") {
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        obj as Record<string, unknown>
      )) {
        cleaned[key] = cleanSchemaRecursive(value);
      }
      if (shouldDefaultAdditionalProperties(cleaned)) {
        cleaned["additionalProperties"] = false;
      }
      return cleaned;
    }
    return obj;
  }

  return cleanSchemaRecursive(result) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Think-tag removal
// ---------------------------------------------------------------------------

function removeThinkTags(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// ---------------------------------------------------------------------------
// Tool result normalization
// ---------------------------------------------------------------------------

function normalizeToolResult(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (Array.isArray(value)) return value.map(normalizeToolResult);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj["toJSON"] === "function") {
      return normalizeToolResult((obj as { toJSON(): unknown }).toJSON());
    }
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = normalizeToolResult(v);
    }
    return result;
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// Simple template rendering (replaces Jinja2)
// ---------------------------------------------------------------------------

function renderTemplate(
  template: string,
  context: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(context)) {
    result = result.replaceAll(`{{ ${key} }}`, value);
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

// ---------------------------------------------------------------------------
// StepExecutor
// ---------------------------------------------------------------------------

export interface StepExecutorOptions {
  task: Task;
  step: Step;
  context: ProcessingContext;
  provider: BaseProvider;
  model: string;
  tools?: Tool[];
  systemPrompt?: string;
  maxTokenLimit?: number;
  maxIterations?: number;
  useFinishTask?: boolean;
  threadId?: string;
}

export class StepExecutor {
  private history: Message[] = [];
  private step: Step;
  private task: Task;
  private tools: Tool[];
  private provider: BaseProvider;
  private model: string;
  private context: ProcessingContext;
  private systemPrompt: string;
  private maxTokenLimit: number;
  private maxIterations: number;
  private useFinishTask: boolean;
  private inConclusionStage = false;
  private result: unknown = null;
  private finishStepTool: FinishStepTool | null = null;
  private resultSchema: Record<string, unknown> | null = null;
  private iterations = 0;
  private jsonParseFailures = 0;
  private generationFailures = 0;
  private sources: string[] = [];
  private sourcesSet = new Set<string>();
  private inputTokensTotal = 0;
  private outputTokensTotal = 0;
  private _controlEvents: Array<{
    targetNodeId: string;
    event: import("@nodetool/protocol").ControlEvent;
  }> = [];
  private threadId?: string;

  constructor(opts: StepExecutorOptions) {
    this.task = opts.task;
    this.step = opts.step;
    this.context = opts.context;
    this.provider = opts.provider;
    this.model = opts.model;
    this.tools = opts.tools ? [...opts.tools] : [];
    this.maxTokenLimit = opts.maxTokenLimit ?? DEFAULT_TOKEN_LIMIT;
    this.maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.useFinishTask = opts.useFinishTask ?? false;
    this.threadId = opts.threadId;

    // Load and sanitize the output schema
    this.resultSchema = this.loadResultSchema();

    // Setup finish_step tool if we have a schema
    if (this.resultSchema) {
      this.finishStepTool = new FinishStepTool(this.resultSchema);
      this.tools.push(this.finishStepTool);
    }

    // Build the system prompt from templates
    this.systemPrompt = this.buildSystemPrompt(opts.systemPrompt);
  }

  /**
   * Rough token estimate based on JSON serialized history length / 4.
   */
  private estimateTokens(): number {
    return Math.ceil(JSON.stringify(this.history).length / 4);
  }

  /**
   * Parse and sanitize the declared output schema for this step.
   */
  private loadResultSchema(): Record<string, unknown> | null {
    if (!this.step.outputSchema) return null;

    const defaultDescription = this.useFinishTask
      ? "The task result"
      : "The step result";
    try {
      const raw =
        typeof this.step.outputSchema === "string"
          ? JSON.parse(this.step.outputSchema)
          : this.step.outputSchema;
      return validateAndSanitizeSchema(raw, defaultDescription);
    } catch {
      // Fallback: permissive object schema
      return { type: "object", description: defaultDescription };
    }
  }

  /**
   * Build the system prompt for this step using templates.
   */
  private buildSystemPrompt(customPrompt?: string): string {
    let basePrompt: string;
    const templateContext: Record<string, string> = {};

    if (this.resultSchema) {
      const schemaJson = JSON.stringify(this.resultSchema, null, 2);
      templateContext["output_schema_json"] = schemaJson;

      if (this.useFinishTask) {
        basePrompt = customPrompt ?? DEFAULT_FINISH_TASK_SYSTEM_PROMPT;
        templateContext["step_content"] = this.step.instructions;
      } else {
        basePrompt = customPrompt ?? DEFAULT_EXECUTION_SYSTEM_PROMPT;
        templateContext["step_content"] = this.step.instructions;
      }
    } else {
      basePrompt = customPrompt ?? DEFAULT_UNSTRUCTURED_SYSTEM_PROMPT;
      templateContext["step_content"] = this.step.instructions;
    }

    let prompt = renderTemplate(basePrompt, templateContext);
    prompt += `\n\nToday's date is ${new Date().toISOString().slice(0, 10)}`;
    return prompt;
  }

  /**
   * Validate a result payload against the declared schema.
   * Returns [isValid, errorDetail, normalizedResult].
   */
  private validateResultPayload(
    resultPayload: unknown
  ): [boolean, string | null, unknown] {
    const normalized = normalizeToolResult(resultPayload);

    if (this.resultSchema === null) {
      return [true, null, normalized];
    }

    // Basic structural validation: check required keys from schema
    if (
      this.resultSchema["type"] === "object" &&
      typeof normalized === "object" &&
      normalized !== null
    ) {
      const requiredKeys = this.resultSchema["required"];
      if (Array.isArray(requiredKeys)) {
        const obj = normalized as Record<string, unknown>;
        for (const key of requiredKeys) {
          if (!((key as string) in obj)) {
            return [false, `Missing required key: ${key}`, normalized];
          }
        }
      }
    }

    // Type check
    const expectedType = this.resultSchema["type"];
    if (expectedType === "string" && typeof normalized !== "string") {
      return [false, `Expected string, got ${typeof normalized}`, normalized];
    }
    if (
      expectedType === "object" &&
      (typeof normalized !== "object" || normalized === null)
    ) {
      return [false, `Expected object, got ${typeof normalized}`, normalized];
    }
    if (expectedType === "array" && !Array.isArray(normalized)) {
      return [false, `Expected array, got ${typeof normalized}`, normalized];
    }

    return [true, null, normalized];
  }

  /**
   * Persist the final result and mark the step as completed.
   */
  private async storeCompletionResult(
    normalizedResult: unknown
  ): Promise<void> {
    this.step.completed = true;
    this.step.endTime = Date.now();
    await this.context.storeStepResult(this.step.id, normalizedResult);
    if (this.useFinishTask) {
      await this.context.storeStepResult(this.task.id, normalizedResult);
    }
    this.result = normalizedResult;
  }

  /**
   * Append a system message instructing the LLM to complete via finish_step.
   */
  private appendCompletionFeedback(
    detail: string,
    submittedResult?: unknown
  ): void {
    const schemaStr = JSON.stringify(this.resultSchema, null, 2);
    const lines = [
      "SYSTEM: Step completion must be signaled via the `finish_step` tool.",
      `Detail: ${detail}`,
      "Call `finish_step` exactly once with:",
      '{"result": <result>}',
      "Schema for `result`:",
      schemaStr
    ];

    if (submittedResult !== undefined) {
      try {
        const preview = JSON.stringify(
          normalizeToolResult(submittedResult),
          null,
          2
        );
        lines.push("Previous submission preview:", preview);
      } catch {
        lines.push("Previous submission preview:", String(submittedResult));
      }
    }

    this.history.push({ role: "system", content: lines.join("\n") });
  }

  /**
   * Attempt to parse and store a completion payload from the assistant message.
   */
  private maybeFinalizeFromMessage(
    message: Message | null
  ): [boolean, unknown] {
    if (!message) return [false, null];

    // For unstructured steps (no schema), accept text content as the result
    if (this.resultSchema === null) {
      if (!message.toolCalls || message.toolCalls.length === 0) {
        return [true, message.content];
      }
      return [false, null];
    }

    if (!message.content || typeof message.content !== "string")
      return [false, null];

    const parsed = extractJSON(message.content);
    if (!parsed || typeof parsed !== "object") return [false, null];

    const obj = parsed as Record<string, unknown>;
    const status = obj["status"];
    if (status !== undefined && status !== "completed") return [false, null];

    if (status === "completed" && !("result" in obj)) {
      this.history.push({
        role: "system",
        content:
          'Missing \'result\' in completion payload. Provide: {"status": "completed", "result": <your_result>}.'
      });
      return [false, null];
    }

    const candidateResult = "result" in obj ? obj["result"] : parsed;
    const [isValid, errorDetail, normalizedResult] =
      this.validateResultPayload(candidateResult);

    if (
      !isValid ||
      normalizedResult === null ||
      normalizedResult === undefined
    ) {
      this.history.push({
        role: "system",
        content: `Schema validation failed: ${errorDetail ?? "unknown error"}`
      });
      return [false, null];
    }

    return [true, normalizedResult];
  }

  /**
   * Track JSON parsing/validation failures and enforce a hard stop.
   */
  private registerJsonFailure(detail: string): void {
    this.jsonParseFailures++;

    if (this.jsonParseFailures === JSON_FAILURE_ALERT_THRESHOLD) {
      const reminder =
        "SYSTEM: Do NOT output completion JSON in assistant text. You MUST call " +
        "`finish_step` with {'result': <result>} matching the schema, with no extra keys.";
      this.history.push({ role: "system", content: reminder });
      this.inConclusionStage = true;
    }

    if (this.jsonParseFailures >= MAX_JSON_PARSE_FAILURES) {
      throw new Error(
        `Exceeded maximum JSON parse attempts (${MAX_JSON_PARSE_FAILURES}) for step ${this.step.id}. Last failure: ${detail}`
      );
    }
  }

  /**
   * Filter tool calls based on whether we're in the conclusion stage.
   */
  private filterToolCallsForCurrentStage(toolCalls: ToolCall[]): ToolCall[] {
    if (!this.inConclusionStage) return toolCalls;
    return toolCalls.filter((tc) => tc.name === "finish_step");
  }

  /**
   * Get the tools available for the current stage.
   */
  private getCurrentTools(): Tool[] {
    if (this.inConclusionStage) {
      return this.finishStepTool ? [this.finishStepTool] : [];
    }
    return [...this.tools];
  }

  /**
   * Transition to conclusion stage: restrict tools to finish_step only.
   */
  private enterConclusionStage(): void {
    if (this.inConclusionStage) return;
    this.inConclusionStage = true;

    const hasFinishTool = !!this.finishStepTool;
    const message = hasFinishTool
      ? `SYSTEM: The conversation history is approaching the token limit (${this.maxTokenLimit} tokens).\n` +
        "ENTERING CONCLUSION STAGE: You MUST now synthesize all gathered information and finalize the step.\n" +
        "Only the `finish_step` tool is available. Call `finish_step` exactly once with:\n" +
        '{"result": <result>} where <result> matches the declared schema.'
      : `SYSTEM: The conversation history is approaching the token limit (${this.maxTokenLimit} tokens).\n` +
        "ENTERING CONCLUSION STAGE: You MUST now synthesize all gathered information and finalize the step.\n" +
        "Tools are not available. Provide the final answer concisely.";

    // Prevent duplicate conclusion messages
    if (
      !this.history.some(
        (m) =>
          m.role === "system" &&
          typeof m.content === "string" &&
          m.content.includes("ENTERING CONCLUSION STAGE")
      )
    ) {
      this.history.push({ role: "system", content: message });
    }
  }

  /**
   * Summarize older messages into a concise, factual summary.
   */
  private async summarizeMessages(messages: Message[]): Promise<string> {
    const joined = messages
      .filter((m) => m.content)
      .map((m) => `${(m.role ?? "").toUpperCase()}: ${m.content}`)
      .join("\n");

    const prompt =
      "Summarize the following conversation concisely while preserving key facts, " +
      "decisions, and results:\n\n" +
      joined;

    try {
      const msg = await this.provider.generateMessageTraced({
        messages: [
          { role: "system", content: "Summarize previous context." },
          { role: "user", content: prompt }
        ],
        model: this.model,
        tools: [],
        maxTokens: 512
      });
      return String(msg.content ?? "").trim();
    } catch {
      return "Summary unavailable due to compression error.";
    }
  }

  /**
   * Trim or summarize older messages to stay within token limits.
   */
  private async trimHistoryIfNeeded(): Promise<void> {
    const tokenCount = this.estimateTokens();
    if (tokenCount < this.maxTokenLimit * 0.9) return;

    // Preserve the last 6 messages
    const preserved: Message[] = [];
    for (let i = this.history.length - 1; i >= 0 && preserved.length < 6; i--) {
      preserved.unshift(this.history[i]);
    }

    const earlierCount = this.history.length - preserved.length;
    const earlierContext =
      earlierCount > 1 ? this.history.slice(1, earlierCount) : [];

    if (earlierContext.length > 0) {
      const summary = await this.summarizeMessages(earlierContext);
      const systemPrompt = this.history[0];
      this.history = [];
      if (systemPrompt) {
        this.history.push(systemPrompt);
      }
      this.history.push({
        role: "system",
        content: `Summary of previous context:\n${summary}`
      });
    } else {
      this.history = this.history.slice(0, 1);
    }

    this.history.push(...preserved);

    // Trim further if still over budget
    let currentTokens = this.estimateTokens();
    while (
      currentTokens > this.maxTokenLimit * 0.85 &&
      this.history.length > 2
    ) {
      this.history.splice(2, 1);
      currentTokens = this.estimateTokens();
    }
  }

  /**
   * Serialize a tool result for history, with truncation.
   */
  private serializeToolResultForHistory(
    toolResult: unknown,
    _toolName: string
  ): string {
    if (toolResult === null || toolResult === undefined) {
      return "Tool returned no output.";
    }
    try {
      const normalized = normalizeToolResult(toolResult);
      const serialized = JSON.stringify(normalized);
      if (serialized.length > MAX_TOOL_RESULT_CHARS) {
        return (
          serialized.slice(0, MAX_TOOL_RESULT_CHARS) +
          "... [truncated to maintain context size]"
        );
      }
      return serialized;
    } catch (e) {
      return JSON.stringify({
        error: `Failed to serialize tool result: ${e}`,
        result_repr: String(toolResult).slice(0, 500)
      });
    }
  }

  /**
   * Save base64 encoded binary data (images, audio) from tool results to workspace files.
   * Mirrors Python's StepExecutor._handle_binary_artifact().
   */
  private async handleBinaryArtifact(toolResult: unknown): Promise<unknown> {
    if (
      typeof toolResult !== "object" ||
      toolResult === null ||
      Array.isArray(toolResult)
    ) {
      return toolResult;
    }

    const result = { ...(toolResult as Record<string, unknown>) };
    const workspaceDir = this.context.workspaceDir;
    if (!workspaceDir) return result;

    for (const field of ["image", "audio"]) {
      const value = result[field];
      if (typeof value !== "string") continue;

      const dataUriMatch = value.match(/^data:([^;]+);base64,(.+)$/s);
      if (!dataUriMatch) continue;

      const [, mimeType, base64Data] = dataUriMatch;
      const ext = mimeType!.split("/")[1] ?? "bin";
      const hash = createHash("sha256")
        .update(base64Data!)
        .digest("hex")
        .slice(0, 16);
      const filename = `artifact_${hash}.${ext}`;

      const artifactsDir = path.join(workspaceDir, "artifacts");
      await fs.mkdir(artifactsDir, { recursive: true });
      const filepath = path.join(artifactsDir, filename);

      await fs.writeFile(filepath, Buffer.from(base64Data!, "base64"));
      result[field] = filepath;
      if (!this.sourcesSet.has(filepath)) {
        this.sources.push(filepath);
        this.sourcesSet.add(filepath);
      }
    }

    return result;
  }

  /**
   * Track URLs from browser tool navigation results.
   * Mirrors Python's _process_special_tool_side_effects().
   */
  private trackToolSideEffects(toolName: string, result: unknown): void {
    if (
      toolName === "browser" &&
      typeof result === "object" &&
      result !== null
    ) {
      const url = (result as Record<string, unknown>).url;
      if (typeof url === "string" && url && !this.sourcesSet.has(url)) {
        this.sources.push(url);
        this.sourcesSet.add(url);
      }
    }
  }

  /**
   * Generate a user-facing message for a tool call.
   */
  private generateToolCallMessage(toolCall: ToolCall): string {
    for (const tool of this.tools) {
      if (tool.name === toolCall.name) {
        return tool.userMessage(toolCall.args);
      }
    }
    return `Running ${toolCall.name}`;
  }

  /**
   * Build the initial user message with instructions and dependency results.
   */
  private async buildUserMessage(): Promise<string> {
    const parts: string[] = [this.step.instructions];

    if (this.step.dependsOn.length > 0) {
      for (const depId of this.step.dependsOn) {
        const depResult = await this.context.loadStepResult(depId);
        if (depResult !== undefined && depResult !== null) {
          parts.push(
            `**Result from Task ${depId}:**\n${JSON.stringify(depResult, null, 2)}\n`
          );
        }
      }
    }

    parts.push(
      "Please perform the step based on the provided context, instructions, and upstream task results."
    );

    return parts.join("\n");
  }

  /**
   * Check if the provider supports native agentic tool execution (onToolCall).
   * When true, the provider handles the tool-calling loop internally (e.g. Claude
   * Agent SDK with MCP), so StepExecutor delegates the entire step to a single
   * provider call rather than running its own multi-iteration loop.
   */
  private providerSupportsOnToolCall(): boolean {
    // ClaudeAgentProvider advertises MCP support. Detect by provider id.
    return (
      (this.provider as unknown as Record<string, unknown>).provider ===
      "claude_agent"
    );
  }

  /**
   * Execute the step using a provider with native agentic tool execution.
   * A single provider call handles the full tool loop: action tools → finish_step.
   * Falls back to a second call with a nudge if finish_step wasn't called.
   */
  private async *executeWithAgenticProvider(): AsyncGenerator<ProcessingMessage> {
    const allTools = this.getCurrentTools();
    const providerTools = allTools.map((t) => t.toProviderTool());

    // State captured by the onToolCall callback
    let finishStepResult: unknown = undefined;
    let finishStepCalled = false;

    const onToolCall = async (
      name: string,
      args: Record<string, unknown>
    ): Promise<string> => {
      const tool = this.tools.find((t) => t.name === name);
      if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });

      if (tool instanceof ControlNodeTool) {
        const event = tool.createControlEvent(args);
        this._controlEvents.push({ targetNodeId: tool.targetNodeId, event });
        const msg = tool.userMessage(args);
        return typeof msg === "string" ? msg : JSON.stringify(msg);
      }

      if (name === "finish_step" || name === "finish_task") {
        finishStepCalled = true;
        finishStepResult = args?.["result"] ?? args;
        return JSON.stringify({ status: "completed" });
      }

      try {
        const result = await tool.process(this.context, args);
        this.trackToolSideEffects(name, result);
        return typeof result === "string"
          ? result
          : JSON.stringify(result ?? null);
      } catch (e) {
        return JSON.stringify({ error: String(e) });
      }
    };

    // Single provider call — the SDK's agentic loop handles tool calls internally
    yield {
      type: "log_update",
      node_id: this.step.id,
      node_name: `Step: ${this.step.id}`,
      content: "Executing step...",
      severity: "info"
    } satisfies LogUpdate;

    this.inputTokensTotal += this.estimateTokens();

    let content = "";
    const toolCalls: ToolCall[] = [];

    const stream = this.provider.generateMessagesTraced({
      messages: [...this.history],
      model: this.model,
      tools: providerTools.length > 0 ? providerTools : undefined,
      threadId: this.threadId,
      onToolCall
    });

    for await (const item of stream) {
      if (isChunk(item)) {
        content += item.content ?? "";
        yield {
          type: "chunk",
          node_id: this.step.id,
          content: item.content,
          done: false
        } satisfies Chunk;
      }
      if (isToolCall(item)) {
        toolCalls.push(item);
        yield {
          type: "tool_call_update",
          node_id: this.step.id,
          name: item.name,
          args: item.args,
          message: this.generateToolCallMessage(item)
        } satisfies ToolCallUpdate;
      }
    }

    content = removeThinkTags(content);
    this.outputTokensTotal += Math.ceil(
      (content.length + JSON.stringify(toolCalls).length) / 4
    );

    // Check if finish_step was called within the agentic loop
    if (
      finishStepCalled &&
      finishStepResult !== undefined &&
      finishStepResult !== null
    ) {
      const [isValid, errorDetail, normalizedResult] =
        this.validateResultPayload(finishStepResult);
      if (
        isValid &&
        normalizedResult !== null &&
        normalizedResult !== undefined
      ) {
        await this.storeCompletionResult(normalizedResult);
        return;
      }
      log.warn("finish_step result validation failed", {
        stepId: this.step.id,
        error: errorDetail
      });
    }

    // For unstructured steps (no schema), accept text content
    if (this.resultSchema === null && content) {
      await this.storeCompletionResult(content);
      return;
    }

    // Try JSON extraction from text
    if (content) {
      const message: Message = { role: "assistant", content };
      const [completed, normalizedResult] =
        this.maybeFinalizeFromMessage(message);
      if (
        completed &&
        normalizedResult !== null &&
        normalizedResult !== undefined
      ) {
        await this.storeCompletionResult(normalizedResult);
        return;
      }
    }

    // Fallback: send a second query with a nudge to call finish_step
    if (this.finishStepTool && !this.step.completed) {
      log.debug("Nudging provider to call finish_step", {
        stepId: this.step.id
      });

      // Build nudge with tool results context
      const toolResultsSummary = toolCalls
        .filter((tc) => tc.name !== "finish_step" && tc.name !== "finish_task")
        .map((tc) => `${tc.name}(${JSON.stringify(tc.args)})`)
        .join(", ");

      const schemaStr = JSON.stringify(this.resultSchema, null, 2);
      const nudgePrompt = toolResultsSummary
        ? `You already executed: ${toolResultsSummary}. The assistant's analysis: ${content?.slice(0, 500) ?? ""}.\n\nNow call finish_step with {"result": <result>} matching this schema:\n${schemaStr}`
        : `Complete the step by calling finish_step with {"result": <result>} matching this schema:\n${schemaStr}`;

      const nudgeMessages: Message[] = [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: nudgePrompt }
      ];

      finishStepCalled = false;
      finishStepResult = undefined;

      const nudgeStream = this.provider.generateMessagesTraced({
        messages: nudgeMessages,
        model: this.model,
        tools: providerTools.length > 0 ? providerTools : undefined,
        threadId: this.threadId,
        onToolCall
      });

      let nudgeContent = "";
      for await (const item of nudgeStream) {
        if (isChunk(item)) {
          nudgeContent += item.content ?? "";
          yield {
            type: "chunk",
            node_id: this.step.id,
            content: item.content,
            done: false
          } satisfies Chunk;
        }
        if (isToolCall(item)) {
          yield {
            type: "tool_call_update",
            node_id: this.step.id,
            name: item.name,
            args: item.args,
            message: this.generateToolCallMessage(item)
          } satisfies ToolCallUpdate;
        }
      }

      if (
        finishStepCalled &&
        finishStepResult !== undefined &&
        finishStepResult !== null
      ) {
        const [isValid, , normalizedResult] =
          this.validateResultPayload(finishStepResult);
        if (
          isValid &&
          normalizedResult !== null &&
          normalizedResult !== undefined
        ) {
          await this.storeCompletionResult(normalizedResult);
          return;
        }
      }

      // Last resort: try JSON extraction from nudge response
      nudgeContent = removeThinkTags(nudgeContent);
      if (nudgeContent) {
        const msg: Message = { role: "assistant", content: nudgeContent };
        const [completed, normalizedResult] =
          this.maybeFinalizeFromMessage(msg);
        if (
          completed &&
          normalizedResult !== null &&
          normalizedResult !== undefined
        ) {
          await this.storeCompletionResult(normalizedResult);
          return;
        }
      }
    }
  }

  /**
   * Execute the step, yielding ProcessingMessages as progress updates.
   */
  async *execute(): AsyncGenerator<ProcessingMessage> {
    log.debug("Step started", {
      stepId: this.step.id,
      instructions: this.step.instructions.slice(0, 60)
    });

    // Initialize history with system prompt
    this.history.push({ role: "system" as const, content: this.systemPrompt });

    // Build user message with instructions and dependency results
    const userContent = await this.buildUserMessage();
    this.history.push({ role: "user" as const, content: userContent });

    // Yield task update: step started
    this.step.startTime = Date.now();

    yield {
      type: "task_update",
      node_id: this.step.id,
      task: { id: this.task.id, title: this.task.title },
      step: { id: this.step.id, instructions: this.step.instructions },
      event: TaskUpdateEvent.StepStarted
    } satisfies TaskUpdate;

    // --- Agentic provider fast-path (e.g. Claude Agent SDK with MCP) ---
    // The provider handles the full tool loop in a single call.
    if (this.providerSupportsOnToolCall() && this.tools.length > 0) {
      try {
        yield* this.executeWithAgenticProvider();
      } catch (e) {
        log.error("Agentic execution failed", {
          stepId: this.step.id,
          error: String(e)
        });
      }

      if (this.step.completed) {
        yield {
          type: "task_update",
          node_id: this.step.id,
          task: { id: this.task.id, title: this.task.title },
          step: { id: this.step.id, instructions: this.step.instructions },
          event: TaskUpdateEvent.StepCompleted
        } satisfies TaskUpdate;

        yield {
          type: "step_result",
          step: { id: this.step.id, instructions: this.step.instructions },
          result: this.result,
          is_task_result: this.useFinishTask
        } satisfies StepResult;
        return;
      }

      // Fall through to standard loop if agentic path didn't complete
      log.warn(
        "Agentic path did not complete step, falling back to standard loop",
        { stepId: this.step.id }
      );
    }

    // --- Standard multi-iteration loop (for non-agentic providers) ---
    while (!this.step.completed && this.iterations < this.maxIterations) {
      this.iterations++;

      // Check token budget
      const tokenCount = this.estimateTokens();
      if (tokenCount > this.maxTokenLimit && !this.inConclusionStage) {
        this.enterConclusionStage();
        yield {
          type: "task_update",
          node_id: this.step.id,
          task: { id: this.task.id, title: this.task.title },
          step: { id: this.step.id, instructions: this.step.instructions },
          event: TaskUpdateEvent.EnteredConclusionStage
        } satisfies TaskUpdate;
      }

      // Trim history if needed
      await this.trimHistoryIfNeeded();

      // Determine available tools
      const currentTools = this.getCurrentTools();
      const providerTools = currentTools.map((t) => t.toProviderTool());

      // Yield log update
      yield {
        type: "log_update",
        node_id: this.step.id,
        node_name: `Step: ${this.step.id}`,
        content: !this.inConclusionStage
          ? "Generating next steps..."
          : "Synthesizing final answer...",
        severity: "info"
      } satisfies LogUpdate;

      // Track input tokens
      this.inputTokensTotal += this.estimateTokens();

      // Call LLM
      let content = "";
      const toolCalls: ToolCall[] = [];
      let message: Message | null;

      try {
        const stream = this.provider.generateMessagesTraced({
          messages: [...this.history],
          model: this.model,
          tools: providerTools.length > 0 ? providerTools : undefined,
          threadId: this.threadId
        });

        for await (const item of stream) {
          if (isChunk(item)) {
            content += item.content ?? "";
            yield {
              type: "chunk",
              node_id: this.step.id,
              content: item.content,
              done: false
            } satisfies Chunk;
          }
          if (isToolCall(item)) {
            log.debug("Tool call", { name: item.name });
            toolCalls.push(item);
          }
        }

        // Clean think tags from content
        content = removeThinkTags(content);

        message = { role: "assistant", content: content || undefined };
        if (toolCalls.length > 0) {
          message.toolCalls = toolCalls;
        }

        // Estimate output tokens
        this.outputTokensTotal += Math.ceil(
          (content.length + JSON.stringify(toolCalls).length) / 4
        );
      } catch (e) {
        log.error("Step failed", { stepId: this.step.id, error: String(e) });
        this.generationFailures++;
        if (this.generationFailures >= 3) throw e;
        message = {
          role: "assistant",
          content: `Error generating message: ${e}`
        };
      }

      // Filter tool calls for current stage
      const filteredToolCalls = message.toolCalls
        ? this.filterToolCallsForCurrentStage(message.toolCalls)
        : [];
      message.toolCalls =
        filteredToolCalls.length > 0 ? filteredToolCalls : undefined;

      // Add assistant message to history
      this.history.push(message);

      // Process tool calls
      if (filteredToolCalls.length > 0) {
        // Check for finish_step tool call first
        const finishStepCall = filteredToolCalls.find(
          (tc) => tc.name === "finish_step"
        );

        if (finishStepCall && this.finishStepTool) {
          // Yield tool call update
          yield {
            type: "tool_call_update",
            node_id: this.step.id,
            name: finishStepCall.name,
            args: finishStepCall.args,
            message: this.generateToolCallMessage(finishStepCall)
          } satisfies ToolCallUpdate;

          // Extract and validate result
          const resultPayload =
            finishStepCall.args?.["result"] ?? finishStepCall.args;
          if (resultPayload !== undefined && resultPayload !== null) {
            const [isValid, errorDetail, normalizedResult] =
              this.validateResultPayload(resultPayload);

            if (
              isValid &&
              normalizedResult !== null &&
              normalizedResult !== undefined
            ) {
              // Add tool result to history
              this.history.push({
                role: "tool",
                toolCallId: finishStepCall.id,
                content: '{"status": "completed"}'
              });

              await this.storeCompletionResult(normalizedResult);
              log.debug("Step completed", { stepId: this.step.id });

              yield {
                type: "task_update",
                node_id: this.step.id,
                task: { id: this.task.id, title: this.task.title },
                step: {
                  id: this.step.id,
                  instructions: this.step.instructions
                },
                event: TaskUpdateEvent.StepCompleted
              } satisfies TaskUpdate;

              yield {
                type: "step_result",
                step: {
                  id: this.step.id,
                  instructions: this.step.instructions
                },
                result: normalizedResult,
                is_task_result: this.useFinishTask
              } satisfies StepResult;
              break;
            } else {
              // Invalid result - add feedback and continue loop
              this.history.push({
                role: "tool",
                toolCallId: finishStepCall.id,
                content: JSON.stringify({
                  error: `Result validation failed: ${errorDetail}`
                })
              });
              this.appendCompletionFeedback(
                errorDetail ?? "Result failed schema validation.",
                resultPayload
              );
            }
          } else {
            this.history.push({
              role: "tool",
              toolCallId: finishStepCall.id,
              content: '{"error": "Missing result in finish_step call"}'
            });
          }
        } else {
          // Process non-finish_step tool calls
          const regularToolCalls = filteredToolCalls.filter(
            (tc) => tc.name !== "finish_step"
          );

          // Yield tool call updates
          for (const tc of regularToolCalls) {
            yield {
              type: "tool_call_update",
              node_id: this.step.id,
              name: tc.name,
              args: tc.args,
              message: this.generateToolCallMessage(tc)
            } satisfies ToolCallUpdate;
          }

          const toolNamesStr = regularToolCalls.map((tc) => tc.name).join(", ");

          // Standard execution path: run tools ourselves and add results to history
          yield {
            type: "log_update",
            node_id: this.step.id,
            node_name: `Step: ${this.step.id}`,
            content: `Executing tools: ${toolNamesStr}...`,
            severity: "info"
          } satisfies LogUpdate;

          // Execute tool calls in parallel
          const toolResults = await Promise.allSettled(
            regularToolCalls.map(async (tc) => {
              const tool = this.tools.find((t) => t.name === tc.name);
              if (!tool) return { error: `Unknown tool: ${tc.name}` };
              // Intercept ControlNodeTool: create event instead of calling process()
              if (tool instanceof ControlNodeTool) {
                const event = tool.createControlEvent(tc.args ?? {});
                this._controlEvents.push({
                  targetNodeId: tool.targetNodeId,
                  event
                });
                return tool.userMessage(tc.args ?? {});
              }
              try {
                const result = await tool.process(this.context, tc.args ?? {});
                return result;
              } catch (e) {
                return { error: String(e) };
              }
            })
          );

          // Add tool results to history
          for (let i = 0; i < regularToolCalls.length; i++) {
            const tc = regularToolCalls[i];
            const settledResult = toolResults[i];
            let toolResult: unknown;

            if (settledResult.status === "fulfilled") {
              toolResult = settledResult.value;
            } else {
              toolResult = {
                error: `Tool execution failed: ${settledResult.reason}`
              };
            }

            // Save base64 binary artifacts (images, audio) to workspace files
            toolResult = await this.handleBinaryArtifact(toolResult);

            // Track browser URLs for source lineage (from args and results)
            if (tc.name === "browser" && tc.args?.["url"]) {
              const url = String(tc.args["url"]);
              if (!this.sourcesSet.has(url)) {
                this.sources.push(url);
                this.sourcesSet.add(url);
              }
            }
            this.trackToolSideEffects(tc.name, toolResult);

            const resultStr = this.serializeToolResultForHistory(
              toolResult,
              tc.name
            );
            this.history.push({
              role: "tool",
              toolCallId: tc.id,
              content: resultStr
            });
          }

          yield {
            type: "log_update",
            node_id: this.step.id,
            node_name: `Step: ${this.step.id}`,
            content: `Completed tool execution: ${toolNamesStr}.`,
            severity: "info"
          } satisfies LogUpdate;
        }
      }

      // Try to finalize from message content (inline JSON completion).
      if (!this.step.completed) {
        const [completed, normalizedResult] =
          this.maybeFinalizeFromMessage(message);
        if (
          completed &&
          normalizedResult !== null &&
          normalizedResult !== undefined
        ) {
          await this.storeCompletionResult(normalizedResult);

          yield {
            type: "task_update",
            node_id: this.step.id,
            task: { id: this.task.id, title: this.task.title },
            step: { id: this.step.id, instructions: this.step.instructions },
            event: TaskUpdateEvent.StepCompleted
          } satisfies TaskUpdate;

          yield {
            type: "step_result",
            step: { id: this.step.id, instructions: this.step.instructions },
            result: normalizedResult,
            is_task_result: this.useFinishTask
          } satisfies StepResult;
          break;
        }
      }
    }

    // If we exhausted iterations without completing, yield a failure event
    // and a step_result so downstream steps see an explicit error rather than undefined.
    if (!this.step.completed) {
      this.step.completed = true;
      this.step.endTime = Date.now();

      const errorResult = {
        error: `Step failed: exceeded ${this.maxIterations} iterations without completion`
      };
      this.result = errorResult;
      await this.context.storeStepResult(this.step.id, errorResult);

      yield {
        type: "task_update",
        node_id: this.step.id,
        task: { id: this.task.id, title: this.task.title },
        step: { id: this.step.id, instructions: this.step.instructions },
        event: TaskUpdateEvent.StepFailed
      } satisfies TaskUpdate;

      yield {
        type: "step_result",
        step: { id: this.step.id, instructions: this.step.instructions },
        result: errorResult,
        is_task_result: this.useFinishTask
      } satisfies StepResult;
    }
  }

  /**
   * Get the captured result after execution completes.
   */
  getResult(): unknown {
    return this.result;
  }

  /**
   * Get tracked sources (e.g. browser URLs).
   */
  getSources(): string[] {
    return [...this.sources];
  }

  /**
   * Get token usage statistics.
   */
  getTokenUsage(): { inputTokensTotal: number; outputTokensTotal: number } {
    return {
      inputTokensTotal: this.inputTokensTotal,
      outputTokensTotal: this.outputTokensTotal
    };
  }

  /**
   * Get control events emitted during execution (from ControlNodeTool calls).
   * The caller (workflow actor/runner) is responsible for dispatching these.
   */
  getControlEvents(): Array<{
    targetNodeId: string;
    event: import("@nodetool/protocol").ControlEvent;
  }> {
    return [...this._controlEvents];
  }
}

// ---------------------------------------------------------------------------
// Helpers to discriminate ProviderStreamItem union members
// ---------------------------------------------------------------------------

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
