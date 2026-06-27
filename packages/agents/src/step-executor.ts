/**
 * StepExecutor -- the core execution engine for a single step.
 *
 * Port of src/nodetool/agents/step_executor.py
 *
 * Manages the LLM interaction loop: sending messages, handling tool calls,
 * and capturing the step result via finish_step (for schema'd steps) or the
 * assistant's text response (for unstructured steps).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type {
  BaseProvider,
  ProcessingContext,
  Message,
  MessageContent,
  ToolCall,
  ProviderStreamItem
} from "@nodetool-ai/runtime";
import { memoryKeys, withAgentSpanGen } from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import {
  TaskUpdateEvent,
  type ProcessingMessage,
  type Chunk,
  type ToolCallUpdate,
  type StepResult,
  type TaskUpdate
} from "@nodetool-ai/protocol";
import type { Step, Task } from "./types.js";
import { Tool } from "./tools/base-tool.js";
import {
  extractInjectableImages,
  stripImagePayload
} from "./tools/image-injection.js";
import { ControlNodeTool } from "./tools/control-tool.js";
import { FinishStepTool } from "./tools/finish-step-tool.js";
import { getMemoryTools } from "./tools/memory-tools.js";
import { MAX_TOOL_RESULT_CHARS } from "./constants.js";

const log = createLogger("nodetool.agents.step-executor");

const DEFAULT_MAX_ITERATIONS = 30;

// ---------------------------------------------------------------------------
// Shared prompt fragments (DRY)
// ---------------------------------------------------------------------------

const PROMPT_NO_HUMAN_FEEDBACK = `# Hard Constraint: No Human Feedback
- Do NOT ask clarifying questions or request user input.
- If something is ambiguous or missing, choose the simplest reasonable assumption, record it in your reasoning, and proceed.`;

const PROMPT_SCHEMA_STRICT = `# Output Discipline
- Never invent fields: the final result must match the schema exactly (no extra keys; include all required keys).
- Do not reveal chain-of-thought or internal reasoning traces in assistant text.
- Keep non-tool messages concise and factual.`;

const PROMPT_OUTPUT_SCHEMA = `# Output Schema
The final result must match this JSON schema exactly:
\`\`\`json
{{ output_schema_json }}
\`\`\``;

const PROMPT_TOOL_USE = `# Tool Use
- Use tools only when they materially improve correctness or are required.
- Avoid exploratory or repeated tool calls that are unlikely to change the outcome.
- Before each tool call, emit a one-sentence rationale describing what you're doing and why.
- Every tool's input schema includes a \`_message\` string field. Set it on EVERY call to a short (5-12 words), present-continuous status describing what you're doing — this is what the user sees while the tool runs. Examples: "Reading config.json", "Searching the web for AI trends", "Adding image generator node", "Calling http_request to POST /api/items". Be specific about the target (file, URL, query, node type) — generic strings like "Running tool" are useless to the user.

## Memory Tools (progressive disclosure)
- Shared agent memory holds results from prior steps and tasks, original inputs, and facts published by other agents.
- Memory contents are NOT auto-included in your prompt. If you need upstream context, discover it on demand:
  1. Call \`memory_list\` to see what's available (returns metadata only — keys, titles, kinds, byte sizes).
  2. Call \`memory_read\` with the specific keys you actually need; it returns full values.
  3. Call \`memory_write\` to publish a value under \`shared:<key>\` so other agents can find it via \`memory_list\`.
- Pull only what you need — don't fetch every entry by reflex.

## File Tools
- Use \`read_file\` to read files. Do not use \`run_code\` with cat/head/tail.
- Use \`edit_file\` for modifying existing files — it performs exact string replacement and only sends the diff. Prefer it over \`write_file\` for modifications.
- Use \`write_file\` only for creating new files or complete rewrites.
- Use \`glob\` to find files by name pattern (e.g. "**/*.ts"). Do not use \`run_code\` with find or ls.
- Use \`grep\` to search file contents with regex. Do not use \`run_code\` with grep or rg.
- Use \`run_code\` with language="bash" only for system commands and operations that require shell execution.

## Web Tools
- Use \`browser\` to fetch and read the content of a web page. It returns cleaned, readable text extracted from HTML. This is the right choice for reading articles, documentation, or any page content.
- Use \`http_request\` for API calls, POST/PUT/PATCH requests, or when you need raw response headers and body. Do not use it for reading page content — use \`browser\` instead.
- Use \`download_file\` to save a file (binary or text) from a URL to disk.`;

const PROMPT_FINISH_STEP = `# Completion
- When you have everything you need, call \`finish_step\` exactly once with
  \`{"result": <result>}\` matching the declared schema.
- Use \`memory_read\` to fetch any upstream values you still need before
  finishing.`;

// ---------------------------------------------------------------------------
// Assembled system prompts
// ---------------------------------------------------------------------------

const DEFAULT_EXECUTION_SYSTEM_PROMPT = `# Role
You are executing EXACTLY one step within a larger plan. Complete this step end-to-end without asking for clarification.

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
You are completing the final aggregation task, synthesizing results from prior steps into a single coherent deliverable.

${PROMPT_NO_HUMAN_FEEDBACK}

# Scope & Discipline
- Focus on synthesis and aggregation only. Do NOT do additional research or data gathering.
- Preserve every concrete artifact from upstream results (image URLs, file paths, tables, key facts) — never drop or paraphrase them away.
- Use upstream step results already present in context; do not ask for them again.
${PROMPT_SCHEMA_STRICT}

${PROMPT_OUTPUT_SCHEMA}

${PROMPT_TOOL_USE}

${PROMPT_FINISH_STEP}`;

const DEFAULT_UNSTRUCTURED_SYSTEM_PROMPT = `# Role
You are executing a task. Your job is to complete it end-to-end without asking for clarification.

# Objective
{{ step_content }}

${PROMPT_NO_HUMAN_FEEDBACK}

# Operating Mode
- Use tools as needed to achieve the objective.
- When you have the final answer or have completed the task, provide the result as your final response.
- Do not reveal chain-of-thought or internal reasoning traces.

# Communication Pattern (Tool Preambles)
Before making tool calls, provide clear progress updates:
1. First assistant message: Restate the objective in one sentence, then list a short numbered plan (1-3 steps).
2. Before each tool call: Emit a one-sentence message describing what you're doing and why.
3. After tool results: Provide a brief update only if the result changes your plan.

${PROMPT_TOOL_USE}`;

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
  return text
    .replace(
      /<think>[\s\S]*?<\/(?:redacted_thinking|think)>/g,
      ""
    )
    .replace(/<think>[\s\S]*/g, "")
    .trim();
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
  maxIterations?: number;
  useFinishTask?: boolean;
  threadId?: string;
  /**
   * Additional memory keys to surface in the user message as required
   * upstream context for this step. Typically `task:<id>` keys derived from
   * the parent task's `dependsOn` (set by ParallelTaskExecutor / TaskExecutor).
   *
   * The step's own `step.dependsOn` IDs are added automatically as
   * `step:<id>` keys — callers should not duplicate them here.
   */
  upstreamMemoryKeys?: string[];
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
  private maxIterations: number;
  private useFinishTask: boolean;
  private result: unknown = null;
  private finishStepTool: FinishStepTool | null = null;
  private resultSchema: Record<string, unknown> | null = null;
  private iterations = 0;
  private generationFailures = 0;
  private sources: string[] = [];
  private sourcesSet = new Set<string>();
  private _controlEvents: Array<{
    targetNodeId: string;
    event: import("@nodetool-ai/protocol").ControlEvent;
  }> = [];
  private threadId?: string;
  private upstreamMemoryKeys: string[];

  constructor(opts: StepExecutorOptions) {
    this.task = opts.task;
    this.step = opts.step;
    this.context = opts.context;
    this.provider = opts.provider;
    this.model = opts.model;
    this.tools = opts.tools ? [...opts.tools] : [];
    this.maxIterations = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.useFinishTask = opts.useFinishTask ?? false;
    this.threadId = opts.threadId;
    this.upstreamMemoryKeys = opts.upstreamMemoryKeys ?? [];

    // Load and sanitize the output schema
    this.resultSchema = this.loadResultSchema();

    // Auto-attach memory tools so the step can list / read / write
    // shared agent memory on demand. Skip any caller-supplied duplicates.
    const existingNames = new Set(this.tools.map((t) => t.name));
    for (const memoryTool of getMemoryTools()) {
      if (!existingNames.has(memoryTool.name)) {
        this.tools.push(memoryTool);
      }
    }

    // Setup finish_step tool if we have a schema
    if (this.resultSchema) {
      this.finishStepTool = new FinishStepTool(this.resultSchema);
      this.tools.push(this.finishStepTool);
    }

    // Build the system prompt from templates
    this.systemPrompt = this.buildSystemPrompt(opts.systemPrompt);
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
   *
   * The default execution prompts encode the contract every step relies on
   * (output discipline, finish_step protocol). They must always be present.
   * A caller-supplied `userPrompt` is added as a preamble — never as a
   * replacement — so domain context can be layered in without losing the
   * execution discipline.
   */
  private buildSystemPrompt(userPrompt?: string): string {
    let basePrompt: string;
    const templateContext: Record<string, string> = {};

    if (this.resultSchema) {
      const schemaJson = JSON.stringify(this.resultSchema, null, 2);
      templateContext["output_schema_json"] = schemaJson;
      basePrompt = this.useFinishTask
        ? DEFAULT_FINISH_TASK_SYSTEM_PROMPT
        : DEFAULT_EXECUTION_SYSTEM_PROMPT;
    } else {
      basePrompt = DEFAULT_UNSTRUCTURED_SYSTEM_PROMPT;
    }
    templateContext["step_content"] = this.step.instructions;

    let prompt = renderTemplate(basePrompt, templateContext);
    if (userPrompt && userPrompt.trim().length > 0) {
      prompt = `${userPrompt.trim()}\n\n---\n\n${prompt}`;
    }
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
   *
   * Writes a `step_result` entry to {@link ProcessingContext.memory} under
   * `step:<id>`. For finish-task steps it additionally writes the same value
   * as a `task_result` under `task:<id>` so downstream tasks can discover it
   * via memory.
   */
  private storeCompletionResult(normalizedResult: unknown): void {
    this.step.completed = true;
    this.step.endTime = Date.now();
    this.context.memory.set({
      key: memoryKeys.step(this.step.id),
      kind: "step_result",
      value: normalizedResult,
      source: this.step.id,
      title: this.step.instructions.slice(0, 80)
    });
    if (this.useFinishTask) {
      this.context.memory.set({
        key: memoryKeys.task(this.task.id),
        kind: "task_result",
        value: normalizedResult,
        source: this.task.id,
        title: this.task.title
      });
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
   * For unstructured steps (no schema), accept the assistant's text content
   * as the result when the model produces a final response without tool
   * calls. Schema'd steps finalize exclusively through `finish_step`.
   */
  private maybeFinalizeFromMessage(
    message: Message | null
  ): [boolean, unknown] {
    if (!message) return [false, null];
    if (this.resultSchema !== null) return [false, null];
    if (message.toolCalls && message.toolCalls.length > 0) return [false, null];
    return [true, message.content];
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
   * Persist important sandbox outputs (downloads, screenshots, generated artifacts)
   * as assets so they survive ephemeral workspace/container cleanup.
   */
  private async capturePersistentSandboxOutputs(
    toolName: string,
    toolArgs: Record<string, unknown> | undefined,
    toolResult: unknown
  ): Promise<unknown> {
    if (
      typeof toolResult !== "object" ||
      toolResult === null ||
      Array.isArray(toolResult)
    ) {
      return toolResult;
    }

    const result = { ...(toolResult as Record<string, unknown>) };
    if (result.success === false) {
      return result;
    }

    const candidates: Array<{ label: string; path: string }> = [];
    const candidateKeys = new Set<string>();
    const isExternalUri = (value: string): boolean => {
      const lower = value.toLowerCase();
      return (
        lower.startsWith("http://") ||
        lower.startsWith("https://") ||
        lower.startsWith("asset://") ||
        lower.startsWith("memory://") ||
        lower.startsWith("s3://") ||
        lower.startsWith("file://")
      );
    };
    const maybeAdd = (label: string, value: unknown): void => {
      if (
        typeof value === "string" &&
        value.trim().length > 0 &&
        !value.startsWith("data:") &&
        !isExternalUri(value)
      ) {
        const key = `${label}:${value}`;
        if (!candidateKeys.has(key)) {
          candidates.push({ label, path: value });
          candidateKeys.add(key);
        }
      }
    };

    maybeAdd("output_file", result.output_file);
    if (result.success === true) {
      maybeAdd("output_file", toolArgs?.["output_file"]);
    }
    maybeAdd("image", result.image);
    maybeAdd("audio", result.audio);

    if (candidates.length === 0) {
      return result;
    }

    const refs: Record<string, unknown> = {};
    for (const candidate of candidates) {
      try {
        const ref = await this.context.sandboxToAsset(candidate.path);
        refs[candidate.label] = ref;
        const uri = ref.uri;
        if (typeof uri === "string" && uri && !this.sourcesSet.has(uri)) {
          this.sources.push(uri);
          this.sourcesSet.add(uri);
        }
      } catch (error) {
        log.warn("Failed to persist sandbox output as asset", {
          stepId: this.step.id,
          toolName,
          path: candidate.path,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (Object.keys(refs).length > 0) {
      const existing = result.asset_refs;
      if (
        typeof existing === "object" &&
        existing !== null &&
        !Array.isArray(existing)
      ) {
        result.asset_refs = { ...existing, ...refs };
      } else {
        result.asset_refs = refs;
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
   * Generate a user-facing message for a tool call. Prefers the LLM-authored
   * `_message` arg; falls back to the tool's parameter-aware template.
   */
  private generateToolCallMessage(toolCall: ToolCall): string {
    const llm = Tool.extractMessage(toolCall.args);
    if (llm) return llm;
    for (const tool of this.tools) {
      if (tool.name === toolCall.name) {
        return tool.userMessage(Tool.stripMessage(toolCall.args));
      }
    }
    return `Running ${toolCall.name}`;
  }

  /**
   * Build the initial user message.
   *
   * Memory contents are NOT auto-included — callers fetch on demand via the
   * `memory_list` / `memory_read` tools (progressive disclosure; tool usage
   * is documented in the default system prompt).
   *
   * The only memory information the user message carries is a short list of
   * **specific** upstream keys the planner declared as relevant to this step:
   *
   *   - `step:<id>` for every entry of `step.dependsOn` (intra-task deps).
   *   - any caller-supplied {@link StepExecutorOptions.upstreamMemoryKeys}
   *     (typically `task:<id>` entries from the parent task's `dependsOn`).
   *
   * Only keys that actually exist in `context.memory` are listed. The LLM
   * is expected to call `memory_read` with whichever subset it needs.
   */
  private buildUserMessage(): string {
    const parts: string[] = [this.step.instructions];

    const declared = [
      ...this.step.dependsOn.map((id) => memoryKeys.step(id)),
      ...this.upstreamMemoryKeys
    ];
    const seen = new Set<string>();
    const hints: { key: string; title?: string }[] = [];
    for (const key of declared) {
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = this.context.memory.get(key);
      if (!entry) continue;
      hints.push({ key: entry.key, title: entry.title });
    }

    if (hints.length > 0) {
      parts.push("");
      parts.push(
        "# Required upstream memory (call `memory_read` with these keys):"
      );
      for (const hint of hints) {
        parts.push(`- ${hint.key}${hint.title ? ` — ${hint.title}` : ""}`);
      }
    }

    return parts.join("\n");
  }


  /**
   * Execute the step, yielding ProcessingMessages as progress updates.
   */
  async *execute(): AsyncGenerator<ProcessingMessage> {
    yield* withAgentSpanGen(
      "step",
      {
        provider: this.provider.provider,
        model: this.model,
        task: this.step.instructions,
        toolsCount: this.tools.length,
        extra: {
          "agent.step.id": this.step.id,
          "agent.task.id": this.task.id
        }
      },
      () => this._executeImpl()
    );
  }

  private async *_executeImpl(): AsyncGenerator<ProcessingMessage> {
    log.debug("Step started", {
      stepId: this.step.id,
      instructions: this.step.instructions.slice(0, 60)
    });

    // Initialize history with system prompt
    this.history.push({ role: "system" as const, content: this.systemPrompt });

    // Build user message with instructions and dependency results
    const userContent = this.buildUserMessage();
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

    // The provider drives the tool loop, so backends that run their own agent
    // loop (e.g. the Claude Agent SDK) work. Each tool carries its own `execute`
    // closure — running the tool, persisting artifacts, tracking sources — and
    // buffers the completion events; the stream consumer surfaces chunks and
    // tool-call updates.
    //
    // `finish_step` is only *conditionally* terminal: it ends the loop when it
    // captures a schema-valid result, but on an invalid result it returns the
    // error so the model can retry within the iteration budget. The static
    // `terminal` flag can't express that, so the AbortController stops the loop
    // on a valid completion instead.
    const abort = new AbortController();
    const uiEvents: ProcessingMessage[] = [];
    let lastAssistant: Message | null = null;

    const emitCompletion = (normalizedResult: unknown): void => {
      this.storeCompletionResult(normalizedResult);
      uiEvents.push({
        type: "task_update",
        node_id: this.step.id,
        task: { id: this.task.id, title: this.task.title },
        step: { id: this.step.id, instructions: this.step.instructions },
        event: TaskUpdateEvent.StepCompleted
      } satisfies TaskUpdate);
      uiEvents.push({
        type: "step_result",
        step: { id: this.step.id, instructions: this.step.instructions },
        result: normalizedResult,
        is_task_result: this.useFinishTask
      } satisfies StepResult);
    };

    // finish_step is the only completion path for schema'd steps.
    const finishStepExecute = async (
      args: Record<string, unknown>
    ): Promise<string | MessageContent[]> => {
      const resultPayload = args?.["result"] ?? args;
      if (resultPayload === undefined || resultPayload === null) {
        return '{"error": "Missing result in finish_step call"}';
      }
      const [isValid, errorDetail, normalizedResult] =
        this.validateResultPayload(resultPayload);
      if (
        isValid &&
        normalizedResult !== null &&
        normalizedResult !== undefined
      ) {
        emitCompletion(normalizedResult);
        abort.abort();
        return '{"status": "completed"}';
      }
      return JSON.stringify({
        error: `Result validation failed: ${
          errorDetail ?? "Result failed schema validation."
        }`
      });
    };

    const runTool = async (
      tool: Tool,
      args: Record<string, unknown>,
      toolCallId?: string
    ): Promise<string | MessageContent[]> => {
      const cleanArgs = Tool.stripMessage(args ?? {});
      // ControlNodeTool: emit a control event instead of calling process().
      if (tool instanceof ControlNodeTool) {
        const event = tool.createControlEvent(cleanArgs);
        this._controlEvents.push({ targetNodeId: tool.targetNodeId, event });
        return Tool.resolveMessage(tool, args);
      }

      let toolResult: unknown;
      try {
        toolResult = await Tool.executeTool(tool, this.context, args, {
          toolCallId
        });
      } catch (e) {
        return JSON.stringify({ error: String(e) });
      }

      // A view-image-style result carries pixels the model asked for. Forward
      // them as a user image message (generateLoop splits a MessageContent[]
      // result into a light tool note + the image); the note stays in history.
      const injected = extractInjectableImages(toolResult);
      if (injected) {
        toolResult = stripImagePayload(toolResult);
      }

      toolResult = await this.handleBinaryArtifact(toolResult);
      toolResult = await this.capturePersistentSandboxOutputs(
        tool.name,
        args,
        toolResult
      );

      // Track browser URLs for source lineage.
      if (tool.name === "browser" && args?.["url"]) {
        const url = String(args["url"]);
        if (!this.sourcesSet.has(url)) {
          this.sources.push(url);
          this.sourcesSet.add(url);
        }
      }
      this.trackToolSideEffects(tool.name, toolResult);

      const resultStr = this.serializeToolResultForHistory(
        toolResult,
        tool.name
      );
      if (injected) {
        return [{ type: "text", text: resultStr }, ...injected.images];
      }
      return resultStr;
    };

    const providerTools = this.tools.map((tool) => {
      if (tool === this.finishStepTool) {
        return { ...tool.toProviderTool(), execute: finishStepExecute };
      }
      return {
        ...tool.toProviderTool(),
        execute: (args: Record<string, unknown>, toolCallId?: string) =>
          runTool(tool, args, toolCallId)
      };
    });

    const drainUi = function* (): Generator<ProcessingMessage> {
      while (uiEvents.length > 0) yield uiEvents.shift() as ProcessingMessage;
    };

    try {
      const stream = this.provider.generateLoop({
        messages: this.history,
        model: this.model,
        tools: providerTools.length > 0 ? providerTools : undefined,
        threadId: this.threadId,
        maxIterations: this.maxIterations,
        sequentialTools: true,
        signal: abort.signal
      });

      for await (const item of stream) {
        if (isToolCall(item)) {
          yield {
            type: "tool_call_update",
            node_id: this.step.id,
            tool_call_id: item.id,
            name: item.name,
            args: item.args,
            message: this.generateToolCallMessage(item)
          } satisfies ToolCallUpdate;
          yield* drainUi();
          continue;
        }
        if (isChunk(item)) {
          if (typeof item.content === "string" && item.content.length > 0) {
            yield {
              type: "chunk",
              node_id: this.step.id,
              content: item.content,
              done: false
            } satisfies Chunk;
          }
          yield* drainUi();
          continue;
        }
        if ("type" in item && (item as { type?: string }).type === "message") {
          const m = (item as { message?: Message }).message;
          if (m && m.role === "assistant") {
            lastAssistant =
              typeof m.content === "string"
                ? { ...m, content: removeThinkTags(m.content) }
                : m;
          }
        }
        yield* drainUi();
      }
    } catch (e) {
      log.error("Step generation failed", {
        stepId: this.step.id,
        error: String(e)
      });
    }

    yield* drainUi();

    // Unstructured steps finalize from the final assistant text (no finish_step).
    if (!this.step.completed) {
      const [done, normalizedResult] =
        this.maybeFinalizeFromMessage(lastAssistant);
      if (done && normalizedResult !== null && normalizedResult !== undefined) {
        emitCompletion(normalizedResult);
        yield* drainUi();
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
      this.context.memory.set({
        key: memoryKeys.step(this.step.id),
        kind: "step_result",
        value: errorResult,
        source: this.step.id,
        title: `Failed: ${this.step.instructions.slice(0, 60)}`
      });

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
   * Get control events emitted during execution (from ControlNodeTool calls).
   * The caller (workflow actor/runner) is responsible for dispatching these.
   */
  getControlEvents(): Array<{
    targetNodeId: string;
    event: import("@nodetool-ai/protocol").ControlEvent;
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
