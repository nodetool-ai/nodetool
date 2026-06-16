/**
 * Permission classification and the gate wrapper for chat-agent tools.
 *
 * The chat agent always carries a fixed toolbelt; a permission *mode* decides
 * whether each tool call runs automatically, asks the user first, or is
 * blocked. The gate is implemented as a transparent {@link Tool} wrapper
 * ({@link GatedTool}) so both the chat loop and any `run_subtask` child loop
 * inherit gating by simply calling `tool.process()`.
 *
 * Design: docs/superpowers/specs/2026-05-28-chat-permission-model-design.md
 */

import type { ProcessingContext, ProviderTool } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";
// Type-only import: keeps tool-permissions.ts free of provider/LLM runtime
// deps and avoids any value-level import cycle with security-monitor.ts.
import type { SecurityVerdict, PendingAction } from "../security-monitor.js";

/** How risky a tool is, independent of the active mode. */
export type PermissionCategory = "read" | "write" | "execute" | "external";

/** The user-selected permission mode for a chat turn. */
export type PermissionMode = "plan" | "default" | "auto";

/** What the gate decides to do with a single call before any user prompt. */
export type PermissionDecision = "allow" | "ask" | "block";

/** The user's answer to an approval prompt. */
export type ApprovalDecision = "allow" | "allow_for_chat" | "deny";

/**
 * Tool name → category. Anything not listed defaults to `external`, the most
 * conservative class, so a newly-added tool is gated until classified.
 *
 * `read` = no side effects (search, inspect, query, pure compute, internal
 * agent bookkeeping). `write` = mutates local state or produces artifacts /
 * costly media. `execute` = runs arbitrary compute. `external` = third-party
 * side effects.
 */
export const TOOL_PERMISSION_CATEGORIES: Readonly<
  Record<string, PermissionCategory>
> = {
  // --- read: pure compute ---
  calculate: "read",
  geometry: "read",
  statistics: "read",
  trigonometry: "read",
  unit_conversion: "read",
  // --- read: filesystem / workspace reads ---
  read_file: "read",
  list_directory: "read",
  glob: "read",
  grep: "read",
  workspace_read: "read",
  workspace_list: "read",
  // --- read: web & document reads ---
  google_search: "read",
  google_news: "read",
  google_images: "read",
  google_grounded_search: "read",
  openai_web_search: "read",
  dataforseo_search: "read",
  dataforseo_news: "read",
  dataforseo_images: "read",
  take_screenshot: "read",
  extract_pdf_text: "read",
  extract_pdf_tables: "read",
  convert_pdf_to_markdown: "read",
  // --- read: nodetool inspection (REST + local) ---
  list_workflows: "read",
  get_workflow: "read",
  validate_workflow: "read",
  get_example_workflow: "read",
  export_workflow_digraph: "read",
  list_jobs: "read",
  get_job: "read",
  get_job_logs: "read",
  list_assets: "read",
  get_asset: "read",
  read_asset: "read",
  list_models: "read",
  list_provider_models: "read",
  find_model: "read",
  list_nodes: "read",
  search_nodes: "read",
  get_node_info: "read",
  search_email: "read",
  // --- read: knowledge / collections ---
  list_collections: "read",
  search_collections: "read",
  query_collection: "read",
  vector_text_search: "read",
  vector_hybrid_search: "read",
  // --- read: internal agent bookkeeping (no external side effects) ---
  todo_write: "read",
  memory_list: "read",
  memory_read: "read",
  memory_write: "read",
  ltm_recall: "read",
  ltm_remember: "read",
  create_plan: "read",
  finish_plan: "read",
  create_task: "read",
  add_task: "read",
  remove_task: "read",
  finish_task: "read",
  finish_step: "read",
  finish_graph: "read",
  add_node: "read",
  add_edge: "read",
  // run_subtask spawns a child loop whose own tools are gated; the call
  // itself has no side effects, so it always runs.
  run_subtask: "read",
  // run_search spawns a read-only child loop (read_file/glob/grep/
  // list_directory/memory_read only); the call itself has no side effects, so
  // it always runs ungated.
  run_search: "read",

  // --- write: produces files / artifacts / costly media ---
  write_file: "write",
  edit_file: "write",
  workspace_write: "write",
  download_file: "write",
  convert_markdown_to_pdf: "write",
  convert_document: "write",
  save_asset: "write",
  create_workflow: "write",
  generate_image: "write",
  edit_image: "write",
  generate_video: "write",
  animate_image: "write",
  generate_speech: "write",
  transcribe_audio: "write",
  embed_text: "write",
  openai_image_generation: "write",
  google_image_generation: "write",
  openai_text_to_speech: "write",
  vector_index: "write",
  vector_batch_index: "write",
  vector_recursive_split_and_index: "write",
  vector_markdown_split_and_index: "write",

  // --- execute: runs arbitrary compute ---
  run_node: "execute",
  run_workflow: "execute",
  start_background_job: "execute",
  run_code: "execute",
  js: "execute",

  // --- external: third-party side effects ---
  browser: "external",
  http_request: "external",
  archive_email: "external",
  add_label_to_email: "external"
};

/** Category for a tool name, defaulting to the conservative `external`. */
export function permissionCategoryFor(name: string): PermissionCategory {
  return TOOL_PERMISSION_CATEGORIES[name] ?? "external";
}

/**
 * The matrix: `read` always runs; in `auto` everything runs; in `plan`
 * anything actionable is blocked; in `default` actionable calls ask.
 */
export function decidePermission(
  mode: PermissionMode,
  category: PermissionCategory
): PermissionDecision {
  if (category === "read") return "allow";
  if (mode === "auto") return "allow";
  if (mode === "plan") return "block";
  return "ask";
}

export interface ApprovalRequest {
  toolName: string;
  category: PermissionCategory;
  /** Tool arguments, with the reserved `_message` field stripped. */
  args: Record<string, unknown>;
  /** Resolved user-facing status (LLM `_message` or the tool's template). */
  message: string;
}

export type RequestApproval = (
  request: ApprovalRequest
) => Promise<ApprovalDecision>;

export interface PermissionGateOptions {
  mode: PermissionMode;
  /**
   * Tool names the user has approved for the rest of the chat. Shared (by
   * reference) across a thread so "Allow for this chat" sticks between turns.
   */
  sessionAllow: Set<string>;
  /** Round-trips an approval prompt to the UI and resolves with the answer. */
  requestApproval: RequestApproval;
  /**
   * Opt-in LLM-judge consult. When set, every actionable (non-read) tool call
   * that the mode/approval logic would otherwise run is first vetted by the
   * monitor; a `block` verdict stops execution with a structured error. This
   * is a plain callback (NOT the monitor class) so the gate carries no
   * provider/LLM dependency. Default undefined → GatedTool behaves exactly as
   * before, byte-for-byte. Read-class tools are NEVER consulted, even when set.
   */
  securityMonitor?: (action: PendingAction) => Promise<SecurityVerdict>;
  /**
   * Optional accessor for the recent transcript text, forwarded into the
   * monitor's {@link PendingAction.transcript} so SOFT-block user-intent
   * clearing has evidence to reason over. Defaults to undefined → empty
   * transcript. Only invoked when {@link securityMonitor} is set.
   */
  recentTranscript?: () => string;
}

/**
 * Transparent permission wrapper around a {@link Tool}. Forwards identity and
 * schema to the inner tool; only `process()` runs the gate.
 */
class GatedTool extends Tool {
  override readonly needsToolCallId: boolean;

  constructor(
    private readonly inner: Tool,
    private readonly gate: PermissionGateOptions
  ) {
    super();
    this.needsToolCallId = inner.needsToolCallId;
  }

  get name(): string {
    return this.inner.name;
  }

  get description(): string {
    return this.inner.description;
  }

  get inputSchema(): Record<string, unknown> {
    return this.inner.inputSchema;
  }

  toProviderTool(): ProviderTool {
    return this.inner.toProviderTool();
  }

  userMessage(params: Record<string, unknown>): string {
    return this.inner.userMessage(params);
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const category = permissionCategoryFor(this.inner.name);
    const decision = decidePermission(this.gate.mode, category);

    // Read-class tools are never consulted by the security monitor — go
    // straight to the inner tool to guarantee that invariant even if a monitor
    // is wired in.
    if (category === "read") {
      return this.inner.process(context, params);
    }

    if (decision === "allow") {
      return this.runInner(context, params, category);
    }

    if (decision === "block") {
      return {
        error: "blocked_in_plan_mode",
        message:
          `Cannot run \`${this.inner.name}\` in plan mode — only read-only ` +
          `tools are allowed. Produce a concrete plan instead and let the ` +
          `user switch out of plan mode to execute it.`
      };
    }

    // decision === "ask"
    if (this.gate.sessionAllow.has(this.inner.name)) {
      return this.runInner(context, params, category);
    }

    const answer = await this.gate.requestApproval({
      toolName: this.inner.name,
      category,
      args: Tool.stripMessage(params),
      message: Tool.resolveMessage(this.inner, params)
    });

    if (answer === "deny") {
      return {
        error: "permission_denied",
        message:
          `The user declined to run \`${this.inner.name}\`. Do not retry the ` +
          `same call; explain what you wanted to do or propose an alternative.`
      };
    }

    if (answer === "allow_for_chat") {
      this.gate.sessionAllow.add(this.inner.name);
    }

    return this.runInner(context, params, category);
  }

  /**
   * Single execution chokepoint for actionable (non-read) tool calls. When a
   * security monitor is wired in, the call is vetted here — after the
   * mode/approval logic has already said "run" — and a `block` verdict stops
   * execution with a structured error mirroring the existing block/deny paths.
   * Without a monitor, this is just `inner.process()`.
   */
  private async runInner(
    context: ProcessingContext,
    params: Record<string, unknown>,
    category: PermissionCategory
  ): Promise<unknown> {
    const consult = this.gate.securityMonitor;
    if (consult) {
      const verdict = await consult({
        name: this.inner.name,
        category,
        args: Tool.stripMessage(params),
        transcript: this.gate.recentTranscript?.()
      });
      if (verdict.block) {
        const reason = verdict.reason?.trim()
          ? verdict.reason.trim()
          : "the security monitor flagged this action as unsafe";
        const remediation =
          verdict.tier === "hard"
            ? "This is a HARD block: it crosses a security boundary and cannot " +
              "be cleared by user instruction. Do not retry; choose a safe " +
              "alternative."
            : "This is a SOFT block: it was flagged as destructive or " +
              "high-reach. Do not retry the same call; if the user has " +
              "explicitly and specifically authorized this exact action, " +
              "surface that, otherwise propose a safer alternative.";
        return {
          error: "blocked_by_security_monitor",
          message:
            `The security monitor blocked \`${this.inner.name}\` ` +
            `(tier: ${verdict.tier}, severity: ${verdict.severity}): ` +
            `${reason}. ${remediation}`
        };
      }
    }
    return this.inner.process(context, params);
  }
}

/** Wrap each tool so its `process()` runs through the permission gate. */
export function gateTools(
  tools: Tool[],
  options: PermissionGateOptions
): Tool[] {
  return tools.map((tool) => new GatedTool(tool, options));
}
