import { createLogger } from "@nodetool-ai/config";
import { randomUUID } from "node:crypto";
import {
  SUPERSEDED_TOOL_RESULT,
  repairOrphanedToolCalls
} from "../chat-tool-call-repair.js";
import { attachChatPredictionForwarder } from "../chat-prediction-forwarder.js";
import { isGoogleWorkspaceEnabled } from "@nodetool-ai/config";
import {
  isFunctionValue,
  isNonEmptyString,
  isNumber,
  isObjectLike,
  isRecord,
  isString
} from "../lib/wire-values.js";
import { storeAssetWithThumbnail } from "../lib/thumbnail.js";
import {
  attachRunCostLedger,
  ExecutionSession,
  isExecutionPreflightError,
  toRawGraphInput
} from "@nodetool-ai/execution";
import {
  Asset,
  Job,
  Message,
  Prediction,
  Project,
  Skill,
  Thread,
  Memory,
  Workflow,
  type MemoryResource
} from "@nodetool-ai/models";
import { WORKFLOW_DOCUMENT_TOOL_NAMES } from "@nodetool-ai/node-sdk";
import type {
  ProviderTool,
  Message as ProviderMessage,
  MessageContent,
  BaseProvider,
  ProcessingContext,
  ProviderSession,
  ToolCall as ProviderToolCall,
  ImageModel as ProviderImageModel,
  VideoModel as ProviderVideoModel,
  TextToImageParams,
  TextToVideoParams,
  ImageToImageParams,
  ImageToVideoParams,
  PromptAssetRef
} from "@nodetool-ai/runtime";
import {
  ACTIVE_MODEL_CONTEXT_KEY,
  DIRECT_TOOL_NAMES,
  detectImageMime,
  IMAGE_MIME_TO_EXT,
  expandEntitiesForGeneration,
  getProcessSandboxModuleCatalog,
  isProviderSessionUpdate,
  isProviderMessageEvent,
  type ActiveModelSelection
} from "@nodetool-ai/runtime";
import {
  isModelSelection,
  PROVIDER_IDS,
  NO_MODEL_SELECTED_MESSAGE,
  noMediaModelSelectedMessage
} from "@nodetool-ai/protocol";
import type {
  Chunk,
  HydratedGraphData,
  ProcessingMessage
} from "@nodetool-ai/protocol";
import type { UiContext } from "@nodetool-ai/protocol";
import { Tool } from "@nodetool-ai/agents";
import {
  createChatCodeActSession,
  createSandboxClock,
  sandboxPackagesForChat,
  CODEACT_RESIDENT_TOOL_NAMES,
  EXECUTE_CODE_TOOL_NAME,
  type ChatCodeActSession,
  type ChatCodeActToolCall
} from "@nodetool-ai/agents";
import {
  getAgentToolbelt,
  getAllMcpTools,
  registerBuiltinTools,
  getGoogleWorkspaceTools,
  registerGoogleWorkspaceTools,
  getApifyTools,
  getSerpApiTools,
  toolForCapabilityName,
  gateTools,
  capabilityFromTool,
  createCapabilityRun,
  contextSecretAvailability,
  BackgroundSubtaskRegistry,
  UNGATED,
  extractInjectableImages,
  type CapabilityRun,
  type PermissionGateOptions,
  type SubAgentRuntime,
  type PermissionMode,
  type ApprovalDecision,
  type ApprovalRequest,
  type PlanApprovalDecision,
  type SecretPromptRequest,
  type SecretPromptStatus,
  type TaskPlan
} from "@nodetool-ai/agents";
import { mcpToolHostDeps } from "../mcp-tool-deps.js";
import {
  formatSkillCatalogForPrompt,
  mergeSystemSkills,
  formatMemoriesForPrompt
} from "@nodetool-ai/agents";
import { RunNodeTool } from "../agent/run-node-tool.js";
import { extractEmbeddedImage } from "./asset-autosave.js";
import {
  buildChatAgentSystemPrompt,
  focusedUiToolNames,
  normalizeToolCallName,
  RESIDENT_TOOL_NAMES,
  unroutableToolMessage
} from "./chat-prompt.js";
import { createRuntimeContext } from "./model-interfaces.js";
import {
  appendContextToLastUser,
  createWorkflowResponseContent,
  dbMessageToProviderMessage,
  extractTextContent,
  invokedSkillsSection,
  toolResultDisplayText,
  attachPlanApproval,
  type SkillEntry
} from "./chat-history.js";
import type { ClientSession } from "./client-session.js";
import {
  createRelayActivityWaiter,
  DEFAULT_RUN_JOB_EXECUTION_OPTIONS,
  type ActiveJob,
  type ToolBridge,
  type UnifiedWebSocketRunnerOptions
} from "../unified-websocket-runner.js";

const log = createLogger("nodetool.websocket.runner");

/**
 * How many of a user's newest memories the turn reads to build its block. The
 * read doubles as the "how many live in other threads" count, so it is capped:
 * the number is a nudge toward `memory_search`, not an audit.
 */
const MEMORY_SCAN_LIMIT = 400;
/** How many of this thread's memories are pasted into the block. */
const MEMORY_BLOCK_LIMIT = 100;

/**
 * How many recent messages to scan when probing for a resumable session before
 * deciding whether the full thread needs loading. Large enough to clear the
 * occasional errored turn between sessioned assistant replies, tiny next to a
 * full thread load.
 */
const SESSION_PROBE_WINDOW = 50;

/**
 * Find the continuation token to resume this thread with: the `provider_session`
 * of the most recent assistant message, but only if it was produced by the same
 * `provider` and `model` as the incoming request (a session is bound to both).
 * Returns null when there is nothing to resume, so the provider starts fresh.
 */
function lastMatchingProviderSession(
  dbMessages: Message[],
  providerId: string,
  model: string
): ProviderSession | null {
  for (let i = dbMessages.length - 1; i >= 0; i--) {
    const m = dbMessages[i];
    if (m.role !== "assistant") continue;
    const session = m.provider_session;
    if (!session) continue;
    return session.providerId === providerId && session.model === model
      ? session
      : null;
  }
  return null;
}

/**
 * What a chat turn needs from the connection's job bookkeeping. A chat message
 * bound to a workflow runs that workflow on the same concurrency accounting a
 * `run_job` does, so the run has to be registered and released there rather
 * than in a map of chat's own.
 *
 * Backed today by thin methods on the connection host; it is re-pointed at
 * `JobExecutionManager` when the job-execution extraction lands.
 */
export interface ChatJobAccess {
  /** Register a chat-driven run against the connection's concurrency slots. */
  registerJob(jobId: string, active: ActiveJob): void;
  /** Drop a run without draining the queue (the caller's finally does that). */
  dropJob(jobId: string): void;
  /** Drop a run and start whatever was queued behind it. */
  releaseJob(jobId: string): void;
  handleNodeProviderCost(
    active: ActiveJob,
    outbound: Record<string, unknown>
  ): void;
  runMeasuredCost(active: ActiveJob): number | null;
}

/**
 * Everything a chat turn needs that is not the connection itself.
 *
 * The two `ToolBridge` instances are created by the host, not here: client
 * frames land on the socket, and a dropped socket must be able to cancel every
 * pending waiter without asking the chat handler anything.
 */
export interface ChatTurnDeps {
  jobs: ChatJobAccess;
  toolBridge: ToolBridge;
  approvalBridge: ToolBridge;
  /** The tool manifest the client declared for this connection. */
  clientTools: () => Record<string, Record<string, unknown>>;
  /** The connection's bearer token, for tools that call back into the API. */
  authToken: () => string | null;
  beforeRunJob?: UnifiedWebSocketRunnerOptions["beforeRunJob"];
  defaults: { provider: string; model: string };
  hydrateGraph: (graph: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  }) => Promise<HydratedGraphData>;
  configuredProviders: (
    userId: string
  ) => Promise<Record<string, BaseProvider>>;
  entityRefResolver: (userId: string) => {
    getAssetInfo: (assetId: string) => Promise<{
      id: string;
      content_type: string;
      name: string;
      metadata: Record<string, unknown> | null;
    } | null>;
  };
  resolveEntityReferenceImages: (
    userId: string,
    refs: PromptAssetRef[]
  ) => Promise<Uint8Array[]>;
  resolveSourceImageBytes: (
    data: Record<string, unknown>,
    mediaGeneration: Record<string, unknown>,
    userId: string
  ) => Promise<Uint8Array | null>;
}

/**
 * One connection's chat turns: the turn counter and abort controller, the
 * per-thread permission state, the capability run, and the three message
 * shapes a `chat_message` frame can take — an agent turn, a workflow run, or
 * a media generation.
 *
 * It reaches the connection only through {@link ClientSession}. Everything
 * else another region owns arrives in {@link ChatTurnDeps}.
 */
export class ChatTurnHandler {
  private chatRequestSeq = 0;
  /**
   * Aborts the in-flight chat/inference turn. The seq counter above only filters
   * stale output at yield boundaries — it cannot interrupt a provider that is
   * blocked awaiting a response, nor tell one that owns a subprocess (the Claude
   * Agent provider) to stop working. This signal does, and is threaded into
   * every provider call the turn makes.
   */
  private chatAbort: AbortController | null = null;
  /**
   * Per-thread set of tool names the user approved for the rest of the chat
   * via "Allow for this chat". Persists across messages within a thread.
   */
  private chatSessionAllow = new Map<string, Set<string>>();
  /**
   * Live permission mode for an in-flight turn. `set_permission_mode` writes
   * here so switching to Auto mid-turn applies to the next gated call.
   */
  private chatTurnPermissionMode = new Map<string, { value: PermissionMode }>();
  /**
   * The capability run for the chat turn this connection is executing — the
   * gate, the context, and everything a capability needs that only exists per
   * turn. Built beside the toolbelt; the sandbox still calls the belt, and PR
   * 11 is what switches the guest onto `run.invoke`.
   */
  private chatCapabilityRun: CapabilityRun | null = null;

  constructor(
    private readonly session: ClientSession,
    private readonly deps: ChatTurnDeps
  ) {}

  /** The run built for the last chat turn — what PR 11 hands to the sandbox. */
  getCapabilityRun(): CapabilityRun | null {
    return this.chatCapabilityRun;
  }

  /**
   * Open a chat/inference turn: cancel whatever was running and hand back the
   * seq + signal the new turn runs under. A superseding message cancels the
   * previous turn exactly as an explicit Stop does.
   */
  beginTurn() {
    this.cancel();
    this.chatRequestSeq += 1;
    this.chatAbort = new AbortController();
    return {
      seq: this.chatRequestSeq,
      signal: this.chatAbort.signal,
      controller: this.chatAbort
    };
  }

  /** Bump the turn counter without opening a new turn — what `stop` does. */
  bumpRequestSeq(): void {
    this.chatRequestSeq += 1;
  }

  /** The turn a caller's `requestSeq` is compared against. */
  get currentRequestSeq(): number {
    return this.chatRequestSeq;
  }

  /** Abort the in-flight turn, if any. Idempotent. */
  cancel(): void {
    this.chatAbort?.abort();
    this.chatAbort = null;
  }

  /**
   * Retire a turn that finished on its own. Clears the controller only when it
   * is still the current one — a superseding turn has already installed its
   * own, and clearing that would make a later Stop a no-op.
   */
  endTurn(controller: AbortController | null): void {
    if (controller && this.chatAbort === controller) this.chatAbort = null;
  }

  /** Resolve a client tool call this turn is waiting on. */
  resolveToolResult(
    toolCallId: string,
    payload: Record<string, unknown>
  ): void {
    this.deps.toolBridge.resolveResult(toolCallId, payload);
  }

  /**
   * Apply a mid-turn permission-mode switch. Auto also releases every
   * approval already waiting on this thread — the user just said yes to all
   * of them.
   */
  setPermissionMode(threadId: string, mode: PermissionMode): void {
    const liveMode = this.chatTurnPermissionMode.get(threadId);
    if (liveMode) {
      liveMode.value = mode;
    }
    if (mode === "auto") {
      this.deps.approvalBridge.resolveScope(threadId, { decision: "allow" });
    }
  }

  /**
   * Which workflow decides where this conversation's files go.
   *
   * The workspace must not move between turns of one conversation: a file
   * written in the previous message has to still be there in the next. The
   * message's own `workflow_id` is not stable enough to key it on — the client
   * attaches the id it has when it sends, so a turn sent before the thread list
   * loaded carries none, resolves the default workspace instead of the
   * workflow's, and the files the agent wrote a moment ago read as wiped. The
   * thread's binding is the durable one, so it fills in whenever the message
   * omits it.
   */
  private async threadWorkspaceWorkflowId(
    userId: string,
    threadId: string,
    messageWorkflowId: string | null
  ): Promise<string | null> {
    if (messageWorkflowId) return messageWorkflowId;
    if (!threadId) return null;
    try {
      const thread = await Thread.find(userId, threadId);
      return isNonEmptyString(thread?.workflow_id) ? thread.workflow_id : null;
    } catch (err) {
      this.session.logError("thread workspace lookup failed", err);
      return null;
    }
  }

  private async ensureThreadExists(
    threadId?: string,
    workflowId?: string | null
  ): Promise<string> {
    const userId = this.session.userId ?? "1";
    if (!threadId) {
      const thread = await Thread.create({
        user_id: userId,
        workflow_id: workflowId ?? null,
        title: ""
      });
      return thread.id;
    }
    const existing = await Thread.find(userId, threadId);
    if (existing) return existing.id;
    const thread = await Thread.create({
      id: threadId,
      user_id: userId,
      workflow_id: workflowId ?? null,
      title: ""
    });
    return thread.id;
  }

  /**
   * Save a message dict to the database.
   * Mirrors Python's _save_message_to_db_async: pops id, type, user_id before create.
   */
  private async saveMessageToDb(
    messageData: Record<string, unknown>
  ): Promise<void> {
    const data = { ...messageData };
    delete data.id;
    delete data.type;
    const threadId = isString(data.thread_id) ? data.thread_id : "";
    delete data.thread_id;
    const userId = this.session.userId ?? "1";
    delete data.user_id;

    await Message.create({
      thread_id: threadId,
      user_id: userId,
      ...data
    });
  }

  /**
   * Persist raw image bytes carried on an assistant message (native providers
   * that run a server-side image tool emit them inline) as real assets, and
   * rewrite each such block to the wire shape `{ type: "image_url", image: {
   * type: "image", asset_id, mimeType } }`. Blocks that already reference an
   * asset (uri / asset_id, no raw data) and non-image blocks pass through
   * untouched. Raw base64 is never persisted or sent.
   */
  async materializeAssistantImageContent(
    content: MessageContent[],
    userId: string,
    workflowId: string | null
  ): Promise<Array<Record<string, unknown>>> {
    const out: Array<Record<string, unknown>> = [];
    for (const block of content) {
      if (block.type !== "image_url") {
        out.push({ ...block });
        continue;
      }
      const image = block.image;
      const rawData = image.data;
      let bytes: Uint8Array | null = null;
      if (rawData instanceof Uint8Array) {
        bytes = rawData;
      } else if (isString(rawData) && rawData) {
        bytes = new Uint8Array(Buffer.from(rawData, "base64"));
      }
      if (!bytes) {
        // Already an asset/uri reference (or empty) — leave as-is.
        out.push({ ...block });
        continue;
      }
      const mimeType = isString(image.mimeType) ? image.mimeType : "image/png";
      const ext = IMAGE_MIME_TO_EXT[mimeType] ?? "png";
      // Per-block isolation: a storage failure must not abort the whole turn —
      // the image is already generated (and billed), and the assistant text
      // plus any sibling images should still reach the user. Degrade the
      // failed block to a text notice; never fall back to raw base64.
      try {
        const asset = new Asset({
          user_id: userId,
          workflow_id: workflowId ?? null,
          name: `image_${Date.now()}`,
          content_type: mimeType,
          // Home — see the chat media generation path.
          parent_id: userId
        });
        const fileName = `${asset.id}.${ext}`;
        await storeAssetWithThumbnail(
          asset.user_id,
          asset.id,
          fileName,
          bytes,
          mimeType
        );
        asset.size = bytes.length;
        await asset.save();
        // The DB / wire shape mirrors handleMediaGenerationMessage: an asset_id
        // reference (never raw bytes). resolveContentUrls / resolveContentForProvider
        // dereference asset_id on the way out and on the next turn.
        out.push({
          type: "image_url",
          image: { type: "image", asset_id: asset.id, mimeType }
        });
      } catch (err) {
        log.error("Failed to store generated image as asset", {
          error: err instanceof Error ? err.message : String(err)
        });
        out.push({
          type: "text",
          text: "[a generated image could not be saved]"
        });
      }
    }
    return out;
  }

  /**
   * Recursively process tool results, handling asset-like objects.
   * Mirrors Python's RegularChatProcessor._process_tool_result().
   *
   * - Asset-like objects (have type + uri/data): materialized via storage
   * - Date/datetime: converted to ISO string
   * - Arrays/objects: recursed into
   * - Primitives: returned as-is
   */
  // HOLDOUT (anti-slop/no-unknown-returns): a tool result is an arbitrary
  // value — the same open domain `ProcessingContext.normalizeOutputValue`
  // rewrites — and this walk answers in that domain.
  private async processToolResult(
    obj: unknown,
    ctx: ProcessingContext
  ): Promise<unknown> {
    if (obj === null || obj === undefined) return obj;

    // Asset-like objects: { type: "image"|"audio"|"video"|..., uri?: string, data?: ... }
    if (isRecord(obj)) {
      const record = obj as Record<string, unknown>;

      // Check if it's an asset-like object (has type + uri or data)
      if (
        "type" in record &&
        ("uri" in record || "data" in record || "asset_id" in record)
      ) {
        // Use ProcessingContext's normalizeOutputValue to handle asset materialization
        return ctx.normalizeOutputValue(record, "storage_url");
      }

      // Date objects
      if (obj instanceof Date) {
        return obj.toISOString();
      }

      // Regular objects — recurse into values
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        result[key] = await this.processToolResult(value, ctx);
      }
      return result;
    }

    // Arrays — recurse into items
    if (Array.isArray(obj)) {
      return Promise.all(obj.map((item) => this.processToolResult(item, ctx)));
    }

    // Uint8Array/Buffer — store as asset
    if (obj instanceof Uint8Array) {
      if (!ctx.storage) return obj;
      const key = `assets/${randomUUID()}.bin`;
      const uri = await ctx.storage.store(key, obj);
      return { type: "asset", uri };
    }

    // Primitives
    return obj;
  }

  /**
   * Persist image bytes to temp storage and return a handle `view_image` can
   * resolve — a bare `<uuid>.<ext>` storage key. No DB asset row is created, so
   * these captures never clutter the user's asset library; the bytes live only
   * in the request's temp storage. Returns null if there is no storage adapter
   * or the write fails.
   */
  private async storeTempImageAsset(
    ctx: ProcessingContext,
    bytes: Uint8Array,
    mimeType: string
  ): Promise<string | null> {
    if (!ctx.storage) return null;
    const ext = IMAGE_MIME_TO_EXT[mimeType] ?? "png";
    const key = `${randomUUID()}.${ext}`;
    try {
      await ctx.storage.store(key, bytes, mimeType);
      return key;
    } catch (err) {
      log.error("Failed to store temp image asset", {
        error: err instanceof Error ? err.message : String(err)
      });
      return null;
    }
  }

  /**
   * Replace embedded image pixels in a tool result — timeline `frames[]` or an
   * `image_content` blob (e.g. `ui_3d_capture_view`) — with temp-asset handles.
   * The model receives a handle and an instruction to call `view_image`, which
   * is the single mechanism that pulls pixels into context. Keeps image bytes
   * out of the standing chat history. Non-image results pass through untouched.
   */
  // HOLDOUT (anti-slop/no-unknown-returns): same open tool-result domain as
  // `processToolResult`; non-image results pass through untouched.
  async materializeToolResultImages(
    toolResult: unknown,
    ctx: ProcessingContext
  ): Promise<unknown> {
    if (!isRecord(toolResult)) {
      return toolResult;
    }
    const record = toolResult as Record<string, unknown>;

    const handleFor = async (
      payload: { bytes: Uint8Array; mimeType: string } | { uri: string } | null
    ): Promise<string | null> => {
      if (!payload) return null;
      if ("uri" in payload) return payload.uri;
      return this.storeTempImageAsset(ctx, payload.bytes, payload.mimeType);
    };

    // Timeline frames → one image handle per frame.
    if (Array.isArray(record.frames)) {
      const handles: unknown[] = [];
      let stored = 0;
      for (const frame of record.frames) {
        if (!isObjectLike(frame)) {
          handles.push(frame);
          continue;
        }
        const f = { ...(frame as Record<string, unknown>) };
        const payload = extractEmbeddedImage({
          uri: f.dataUrl,
          mimeType: "image/jpeg"
        });
        delete f.dataUrl;
        const id = await handleFor(payload);
        if (id) {
          f.image_id = id;
          stored++;
        }
        handles.push(f);
      }
      const out: Record<string, unknown> = { ...record, frames: handles };
      if (stored > 0) {
        out.note = `Captured ${stored} timeline frame(s) as image assets. Call view_image({ image_id }) to inspect a frame.`;
      }
      return out;
    }

    // Single image_content blob → one image handle.
    if (isObjectLike(record.image_content)) {
      const payload = extractEmbeddedImage(
        record.image_content as Record<string, unknown>
      );
      const id = await handleFor(payload);
      const out: Record<string, unknown> = { ...record };
      delete out.image_content;
      if (id) {
        out.image_id = id;
        const base = isString(record.note) ? record.note : "Captured an image.";
        out.note = `${base} Saved as image asset "${id}". Call view_image({ image_id: "${id}" }) to inspect it.`;
      }
      return out;
    }

    return toolResult;
  }

  /**
   * Render the turn's memory block.
   *
   * Memory is user-scoped, but only **this thread's** memories are pasted in:
   * the store grows for the life of the account, and a block that grew with it
   * would eventually cost more than the turn. What the agent gets instead is
   * this thread's notes in full plus a count of the ones saved elsewhere, so
   * it knows to reach them with `memory_search` rather than assume the block
   * is everything.
   *
   * Resource refs are used as stored (asset refs already carry the `asset://`
   * uri captured at save time) — one indexed query, no per-asset lookups on
   * the hot path. Best-effort: a DB hiccup returns an empty block rather than
   * breaking the turn.
   */
  private async buildMemoryBlock(
    userId: string,
    threadId: string
  ): Promise<string> {
    try {
      // One read over the user's newest memories, split by thread here rather
      // than issuing a second count query.
      const recent = await Memory.list(userId, { limit: MEMORY_SCAN_LIMIT });
      const mine = recent.filter((memory) => memory.thread_id === threadId);
      const elsewhere = recent.length - mine.length;
      if (mine.length === 0 && elsewhere === 0) return "";
      const rendered = mine.slice(0, MEMORY_BLOCK_LIMIT).map((memory) => ({
        kind: memory.kind,
        title: memory.title,
        content: memory.content,
        resources: (Array.isArray(memory.resources)
          ? memory.resources
          : []) as MemoryResource[]
      }));
      return formatMemoriesForPrompt(rendered, elsewhere);
    } catch (err) {
      log.warn("Failed to build memory block", {
        threadId,
        error: err instanceof Error ? err.message : String(err)
      });
      return "";
    }
  }

  /**
   * The user's skills, read once per turn.
   *
   * Two halves with different lifetimes, which is why the caller splits them.
   * The catalog (name + description) changes only when the skills table does,
   * so it belongs in the system prompt where a provider's automatic prefix
   * cache can keep it. The body of a skill the message invoked with `/<name>`
   * changes per turn, so it rides at the tail with the other volatile context.
   *
   * Best-effort like the memory block: a DB hiccup costs the skills, not the
   * turn.
   */
  private async loadUserSkills(userId: string): Promise<SkillEntry[]> {
    let rows: Skill[] = [];
    try {
      rows = await Skill.listByUser(userId);
    } catch (err) {
      log.warn("Failed to load user skills", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
    // The shipped skills ride in the same catalog. They come off disk rather
    // than the table, so a DB hiccup costs the user's own rows and not these.
    return mergeSystemSkills(
      rows.map((row) => ({
        name: row.name,
        description: row.description,
        content: row.content
      }))
    );
  }

  /**
   * Round-trip a permission approval to the client and resolve with the
   * user's decision. Emits a `tool_approval_request`, then waits for the
   * matching `tool_approval_response` (resolved via {@link approvalBridge}).
   * A cancelled wait (stop) is treated as a denial.
   */
  private async requestToolApproval(
    threadId: string,
    request: ApprovalRequest
  ): Promise<ApprovalDecision> {
    const approvalId = `appr_${randomUUID()}`;
    await this.session.send({
      type: "tool_approval_request",
      thread_id: threadId,
      approval_id: approvalId,
      tool_name: request.toolName,
      category: request.category,
      message: request.message,
      description: request.description ?? "",
      args: request.args
    });
    try {
      // No timeout — the user may take a while; `stop` cancels this thread.
      const response = await this.deps.approvalBridge.createWaiter(
        approvalId,
        0,
        threadId
      );
      const decision = response.decision;
      if (
        decision === "allow" ||
        decision === "allow_for_chat" ||
        decision === "deny"
      ) {
        return decision;
      }
      return "deny";
    } catch {
      // Cancelled (generation stopped) — treat as a denial.
      return "deny";
    }
  }

  /**
   * Open the bespoke secret dialog on the client and resolve with what the
   * user did — never with what they typed.
   *
   * The value does not travel over this socket in either direction. The
   * dialog writes it with the client's own `settings.secrets.upsert` call, so
   * the credential never enters the chat transcript, the run's message log, or
   * the model's context; this frame only asks, and the response only reports.
   *
   * A cancelled wait (the user pressed Stop) is a decline, which is the same
   * fail-closed reading the approval prompts take.
   */
  private async requestSecretEntry(
    threadId: string,
    request: SecretPromptRequest
  ): Promise<SecretPromptStatus> {
    const approvalId = `secret_${randomUUID()}`;
    await this.session.send({
      type: "secret_request",
      thread_id: threadId,
      approval_id: approvalId,
      key: request.key,
      description: request.description ?? null,
      reason: request.reason ?? null,
      help_url: request.helpUrl ?? null
    });
    try {
      // No timeout — finding an API key takes as long as it takes; `stop`
      // cancels this thread.
      const response = await this.deps.approvalBridge.createWaiter(
        approvalId,
        0,
        threadId
      );
      return response.status === "saved" ? "saved" : "declined";
    } catch {
      return "declined";
    }
  }

  /**
   * Round-trip a plan approval to the client and resolve with the user's
   * decision. Emits a `plan_approval_request` carrying the serialized plan,
   * then waits for the matching `plan_approval_response` (resolved via
   * {@link approvalBridge}). A cancelled wait (stop) is treated as a
   * rejection without feedback, which aborts the agent run.
   */
  async requestPlanApproval(
    threadId: string | null,
    plan: TaskPlan
  ): Promise<PlanApprovalDecision> {
    const approvalId = `plan_${randomUUID()}`;
    await this.session.send({
      type: "plan_approval_request",
      thread_id: threadId,
      approval_id: approvalId,
      plan: {
        title: plan.title,
        tasks: plan.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          depends_on: t.dependsOn ?? [],
          steps: t.steps.map((s) => ({
            id: s.id,
            instructions: s.instructions
          }))
        }))
      }
    });
    try {
      // No timeout — the user may take a while; `stop` cancels this run.
      const response = await this.deps.approvalBridge.createWaiter(
        approvalId,
        0,
        threadId ?? undefined
      );
      if (response.decision === "approve") {
        return { decision: "approve" };
      }
      const feedback =
        isString(response.feedback) && response.feedback.trim()
          ? response.feedback.trim()
          : undefined;
      return { decision: "reject", feedback };
    } catch {
      // Cancelled (generation stopped) — treat as a rejection.
      return { decision: "reject" };
    }
  }

  /**
   * Execute a single node by type and return its output. Builds a one-node
   * graph and runs it through a fresh `ExecutionSession` (@nodetool-ai/execution),
   * then returns the
   * node's completed result. Backs the `run_node` chat tool.
   */
  // HOLDOUT (anti-slop/no-unknown-returns): answers with the node's own output
  // — an arbitrary workflow value — or an `{ error }` bag when the run failed.
  private async runSingleNode(
    nodeType: string,
    inputs: Record<string, unknown>,
    userId: string,
    threadId: string | null = null,
    projectId: string | null = null
  ): Promise<unknown> {
    const jobId = randomUUID();
    const nodeId = "node_0";
    const rawGraph = {
      nodes: [{ id: nodeId, type: nodeType, data: inputs ?? {} }],
      edges: [] as Array<Record<string, unknown>>
    };

    let graph: HydratedGraphData;
    try {
      graph = await this.deps.hydrateGraph(rawGraph);
    } catch (err) {
      return {
        error: `Failed to prepare node '${nodeType}': ${
          err instanceof Error ? err.message : String(err)
        }`
      };
    }

    if (this.deps.beforeRunJob) {
      try {
        await this.deps.beforeRunJob(graph);
      } catch (err) {
        return {
          error: `Node prerequisites failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        };
      }
    }

    const context = createRuntimeContext({
      jobId,
      workflowId: null,
      userId,
      workspace: this.session.workspaceResolver
        ? await this.session.workspaceResolver(null, userId)
        : null,
      assetOutputMode: this.session.mode === "text" ? "data_uri" : "temp_url"
    });
    attachPlanApproval(context, threadId, (id, plan) =>
      this.requestPlanApproval(id, plan)
    );
    context.setResolveExecutor((node) => this.session.resolveExecutor(node));
    if (this.session.resolveNodeType) {
      const resolverObj = isFunctionValue(this.session.resolveNodeType)
        ? { resolveNodeType: this.session.resolveNodeType }
        : this.session.resolveNodeType;
      context.setResolveNodeType(
        (type) =>
          resolverObj.resolveNodeType(type) as Promise<{
            nodeType: string;
            propertyTypes?: Record<string, string>;
            outputs?: Record<string, string>;
            isDynamic?: boolean;
            descriptorDefaults?: Record<string, unknown>;
          } | null>
      );
    }

    // A node selecting a model this runtime cannot honour is refused before
    // the kernel starts; the tool answers with the reason, like every other
    // preparation failure here.
    let session: ExecutionSession;
    try {
      session = await ExecutionSession.create({
        graph: toRawGraphInput(graph),
        resolveExecutor: (node) =>
          this.session.resolveExecutor(
            node as { id: string; type: string; [key: string]: unknown }
          ),
        bridgeFactory: async () => null,
        jobLifecycleBridge: this.session.pythonBridge ?? null,
        jobId,
        context,
        params: {},
        // A node run from a project's agent thread is that project's spend;
        // the ledger this session attaches writes it. Null outside a project.
        projectId: projectId ?? null,
        validateNode: this.session.validateNode
      });
    } catch (err) {
      if (!isExecutionPreflightError(err)) throw err;
      return { error: err.message };
    }
    const result = await session.result;

    // Capture the node's completed result from the streamed updates.
    let nodeResult: unknown;
    while (context.hasMessages()) {
      const msg = context.popMessage() as Record<string, unknown> | undefined;
      if (
        msg &&
        msg.type === "node_update" &&
        msg.node_id === nodeId &&
        msg.status === "completed" &&
        msg.result != null
      ) {
        nodeResult = msg.result;
      }
    }

    if (result.status === "failed") {
      return { error: result.error ?? `Node '${nodeType}' failed` };
    }
    if (nodeResult === undefined) {
      // Fall back to the runner's collected outputs (e.g. Output nodes).
      return result.outputs ?? { status: result.status };
    }
    return this.processToolResult(nodeResult, context);
  }

  /**
   * Handle an incoming chat message.
   *
   * Mirrors Python's full 3-layer flow:
   *   handle_chat_message → handle_message_impl → process_messages
   *     → _run_processor + RegularChatProcessor.process()
   *
   * The processor sends messages to a queue. _run_processor reads them:
   *   - type === "message" → persist to DB AND forward to client
   *   - anything else → forward to client only
   *
   * RegularChatProcessor.process():
   *   1. Prepend system prompt if first message isn't system role
   *   2. while True: messages_to_send = chat_history + unprocessed_messages
   *   3. Stream chunks (type: "chunk") — forwarded to client (not persisted)
   *   4. On tool call: build assistant Message + tool result Message (type: "message")
   *      → persisted to DB AND forwarded to client
   *   5. If unprocessed_messages empty, break
   *   6. Send done chunk + final assistant Message
   */
  async handleChatMessage(
    data: Record<string, unknown>,
    requestSeq?: number,
    signal?: AbortSignal
  ): Promise<void> {
    const messageWorkflowId = isString(data.workflow_id)
      ? data.workflow_id
      : null;
    const threadId = await this.ensureThreadExists(
      isString(data.thread_id) ? data.thread_id : undefined,
      messageWorkflowId
    );
    data.thread_id = threadId;

    // Route this turn takes: a workflow chatbot and a media generation carry
    // their own model selection (checked in their handlers), a plain chat turn
    // is served by the language model the composer picked.
    const workflowTargetHint = isString(data.workflow_target)
      ? data.workflow_target
      : null;
    const mediaModeHint = isObjectLike(data.media_generation)
      ? (data.media_generation as Record<string, unknown>).mode
      : null;
    const isPlainChatTurn =
      workflowTargetHint !== "workflow" &&
      (!isString(mediaModeHint) || mediaModeHint === "chat");

    // A plain chat turn without a chosen model used to fall through to the
    // built-in default and die deep in provider resolution ("No provider
    // registered for \"empty\"") — after the user's message had been
    // persisted. Reject it up front and say what to do instead.
    if (isPlainChatTurn && !isModelSelection(data.provider, data.model)) {
      await this.session.send({
        type: "error",
        message: NO_MODEL_SELECTED_MESSAGE,
        thread_id: threadId
      });
      return;
    }

    // Apply defaults — matches Python's handle_chat_message
    if (!data.model) data.model = this.deps.defaults.model;
    if (!data.provider) data.provider = this.deps.defaults.provider;

    const providerId = data.provider as string;
    const model = data.model as string;
    const workflowId = messageWorkflowId;
    const userId = this.session.userId ?? "1";
    log.debug("Chat message", { threadId, model, provider: providerId });

    // Save user message to DB — matches Python's _save_message_to_db_async(data)
    await this.saveMessageToDb(data);

    if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq) return;

    if (!this.session.resolveProvider) {
      await this.session.send({
        type: "error",
        message: "No provider resolver configured",
        thread_id: threadId
      });
      return;
    }

    // Route to the workflow processor ONLY when the client explicitly opts in
    // via `workflow_target: "workflow"`. A bare `workflow_id` is context, not a
    // routing signal: the editor binds the open workflow so `ui_*` tools target
    // it, and that ambient id must not hijack the turn into running the
    // workflow as a chatbot. Genuine workflow-chatbot runs set `workflow_target`
    // (and carry `workflow_id`/`graph` for the processor to load/execute).
    const workflowTarget = isString(data.workflow_target)
      ? data.workflow_target
      : null;
    if (workflowTarget === "workflow") {
      await this.handleWorkflowMessage(data, requestSeq, signal);
      return;
    }

    // Route to media generation when the client requests a text-to-image or
    // text-to-video turn. The composer attaches a `media_generation` field
    // with mode + params; when mode is a media mode we invoke the provider's
    // textToImage / textToVideo instead of a regular LLM round and return an
    // assistant message containing MessageImageContent / MessageVideoContent.
    const mediaGeneration = isObjectLike(data.media_generation)
      ? (data.media_generation as Record<string, unknown>)
      : null;
    if (
      mediaGeneration &&
      isString(mediaGeneration.mode) &&
      mediaGeneration.mode !== "chat"
    ) {
      await this.handleMediaGenerationMessage(
        data,
        mediaGeneration,
        requestSeq,
        signal
      );
      return;
    }

    const provider = await this.session.resolveProvider(providerId, userId);

    // Permission mode for this turn. Governs whether gated tool calls run,
    // ask for approval, or are blocked. Defaults to "default".
    const permissionMode: PermissionMode =
      data.permission_mode === "plan" ||
      data.permission_mode === "auto" ||
      data.permission_mode === "default"
        ? data.permission_mode
        : "default";

    // A surface can send a context-specific system-prompt addendum (e.g. the
    // App Builder's build-an-app-UI guidance), layered after the base prompt.
    const extraSystemPrompt = isString(data.system_prompt)
      ? data.system_prompt
      : null;

    // Which documents the user has open, and which one has focus. The `ui_*`
    // tools all require an explicit document id, so this is what makes them
    // usable — see `formatUiContext`.
    const uiContext = isObjectLike(data.ui_context)
      ? (data.ui_context as UiContext)
      : null;

    // History load. Session-based providers (e.g. claude_agent) keep the
    // conversation upstream, so when a resumable session exists for this
    // provider+model we do NOT reload the whole thread: we probe a bounded
    // recent window, send only the turns since the session, and hand the
    // provider a `loadFullHistory` thunk it calls only if it must prime context
    // (resume failed / system prompt changed). Otherwise we load the full
    // history and use the standard slice-based resume. The DB column is the
    // source of truth; the provider also keeps an in-process cache.
    // The action contract + tool catalog section, assigned once the codeact
    // session exists (before the system message is materialized). Read lazily
    // here because the resume `loadFullHistory` thunk and the prepend both run
    // after tool resolution.
    let codeactPromptSection = "";
    // The user's skills, read once. The catalog goes into the system prompt
    // below because it is stable — it changes only when the skills table does,
    // so a provider's prefix cache keeps it across turns. The body of an
    // invoked skill is volatile and rides at the tail instead.
    const userSkills = await this.loadUserSkills(userId);
    const skillCatalogSection = formatSkillCatalogForPrompt(userSkills);
    const buildSystemContent = (): string => {
      const base = buildChatAgentSystemPrompt(
        permissionMode,
        extraSystemPrompt,
        uiContext,
        workflowId
      );
      const sections = [base];
      if (codeactPromptSection) sections.push(codeactPromptSection);
      if (skillCatalogSection) sections.push(skillCatalogSection);
      return sections.join("\n\n");
    };
    const systemChatMessage = (): ProviderMessage => ({
      role: "system",
      content: buildSystemContent(),
      toolCallId: null,
      toolCalls: null,
      threadId: null
    });
    const convertDbMessages = (rows: Message[]): ProviderMessage[] => {
      const out: ProviderMessage[] = [];
      for (const m of rows) {
        const pm = dbMessageToProviderMessage(m, this.session.userId);
        if (pm) out.push(pm);
      }
      // A thread that took an interleave before this was fixed still holds a
      // tool call with no result. Anthropic 400s on one, so loading such a
      // thread under a different provider or model would fail every turn from
      // here on. Patch the history we send; the stored rows are left alone.
      return repairOrphanedToolCalls(out);
    };

    let chatHistory: ProviderMessage[];
    let priorSession: ProviderSession | null = null;
    // The provider calls this only on a priming fallback; null on the full path.
    let loadFullHistory: (() => Promise<ProviderMessage[]>) | null = null;
    // Absolute checkpoint to persist on the assistant message when the fast path
    // sent only a delta (so the stored value matches the full-load path); null
    // when the provider's own checkpoint is already absolute.
    let sessionCheckpointOverride: number | null = null;
    {
      const [recent] = await Message.paginate(threadId, {
        reverse: true,
        limit: SESSION_PROBE_WINDOW
      });
      const probeHasWholeThread = recent.length < SESSION_PROBE_WINDOW;
      // `recent` is newest-first. Walk to the most recent assistant carrying a
      // session token — that message is the resume boundary.
      let probeSession: ProviderSession | null = null;
      const sinceSessionNewestFirst: Message[] = [];
      for (const m of recent) {
        if (m.role === "assistant" && m.provider_session) {
          const s = m.provider_session;
          if (s.providerId === providerId && s.model === model)
            probeSession = s;
          break;
        }
        sinceSessionNewestFirst.push(m);
      }

      if (probeSession) {
        // RESUME fast path: the SDK already holds the prior turns, so send only
        // the messages since the session — no full-thread load.
        const newTurns = convertDbMessages(sinceSessionNewestFirst.reverse());
        chatHistory = newTurns;
        // The single system message prepended below sits at index 0, so the new
        // turns begin at index 1 (the provider's relative resume checkpoint).
        priorSession = {
          providerId,
          model,
          token: probeSession.token,
          systemHash: probeSession.systemHash,
          checkpoint: 1
        };
        // Absolute position to persist: prior prefix + the prior assistant + the
        // new turns — identical to what the full-load path would store.
        sessionCheckpointOverride =
          probeSession.checkpoint + 1 + newTurns.length;
        loadFullHistory = async () => {
          const [rows] = await Message.paginate(threadId, { limit: 1000 });
          const full = convertDbMessages(rows);
          full.unshift(systemChatMessage());
          return full;
        };
      } else if (probeHasWholeThread) {
        // The whole thread fit in the probe window — reuse it, no second query.
        const rows = [...recent].reverse();
        chatHistory = convertDbMessages(rows);
        priorSession = lastMatchingProviderSession(rows, providerId, model);
      } else {
        // Long thread without a resumable session in the recent window: load it
        // all (a far-back session still resumes via the slice path).
        const [rows] = await Message.paginate(threadId, { limit: 1000 });
        chatHistory = convertDbMessages(rows);
        priorSession = lastMatchingProviderSession(rows, providerId, model);
      }
    }

    // Expose the read-only `run_search` fan-out primitive by default. A client
    // can opt out by sending `enable_read_only_search: false`.
    const enableReadOnlySearch = data.enable_read_only_search !== false;

    // Assemble the fixed, always-on toolbelt. There is no per-message tool
    // selection anymore — the agent reasons over the full toolbelt and the
    // permission gate (below) governs execution.
    registerBuiltinTools();
    // Google Workspace runs on the token from the user's Google sign-in, so it
    // only exists on deployments that have a login. Local mode never sees it.
    const googleWorkspace = isGoogleWorkspaceEnabled();
    if (googleWorkspace) registerGoogleWorkspaceTools();
    const chatProviders = await this.deps.configuredProviders(userId);
    // The project this conversation belongs to, when it is a project's own
    // agent thread. Documents the turn creates land in it rather than in the
    // loose bucket, without the model having to pass `project_id` every time,
    // and everything the turn spends is billed to it.
    const chatProjectId =
      (await Project.findByThread(userId, threadId))?.id ?? undefined;
    // The single-node runner is a closure only this package can build, so
    // `run_node` reaches a capability run as a host-supplied capability rather
    // than out of the registry.
    const runNodeTool = new RunNodeTool((nodeType, inputs) =>
      this.runSingleNode(nodeType, inputs, userId, threadId, chatProjectId)
    );
    // The permission gate the belt is wrapped in below. Built before the belt
    // because the Apify tools carry it into their own run: in discovery mode
    // the actor policy asks this gate to approve an actor the install has not
    // allowlisted, so the user sees that question in the same place as every
    // other permission prompt. The session allow-set is shared per thread so
    // "Allow for this chat" sticks.
    const sessionAllow =
      this.chatSessionAllow.get(threadId) ?? new Set<string>();
    this.chatSessionAllow.set(threadId, sessionAllow);
    // A gated call inside a code action parks the guest program until the user
    // answers, and the gate stops the clock for exactly that long — the wait is
    // the user's, not the program's, and charged to the action's wall clock it
    // would kill the very program that asked.
    const codeactClock = createSandboxClock();
    const liveMode = { value: permissionMode };
    this.chatTurnPermissionMode.set(threadId, liveMode);
    const chatGate: PermissionGateOptions = {
      get mode() {
        return liveMode.value;
      },
      sessionAllow,
      requestApproval: async (
        request: ApprovalRequest
      ): Promise<ApprovalDecision> =>
        this.requestToolApproval(threadId, request),
      clock: codeactClock
    };
    const gatedRun = (context: ProcessingContext): CapabilityRun =>
      createCapabilityRun({
        context,
        gate: chatGate,
        projectId: chatProjectId,
        availableSecrets: contextSecretAvailability(context)
      });
    const rawToolbelt: Tool[] = [
      ...getAgentToolbelt(),
      ...(googleWorkspace ? getGoogleWorkspaceTools() : []),
      // Apify and SerpAPI have no `nodetool.*` namespace, so the belt is how
      // a chat discovers them (`nodetool.searchTools("apify")`) at all.
      ...getApifyTools(gatedRun),
      ...getSerpApiTools(gatedRun),
      ...getAllMcpTools({
        registry: this.session.nodeRegistry,
        providers: chatProviders,
        ...mcpToolHostDeps()
      }),
      toolForCapabilityName("list_collections"),
      toolForCapabilityName("query_collection"),
      runNodeTool
    ];
    // De-duplicate by name (builtins / mcp / extras may overlap); first wins.
    const dedupedToolbelt: Tool[] = [];
    const seenToolNames = new Set<string>();
    for (const tool of rawToolbelt) {
      if (seenToolNames.has(tool.name)) continue;
      seenToolNames.add(tool.name);
      dedupedToolbelt.push(tool);
    }

    // Wrap the toolbelt in the permission gate. The wrapper is transparent
    // except for `process()`, so the chat loop AND any `run_subtask` child
    // loop inherit gating by simply calling `tool.process()`.
    const baseTools = gateTools(dedupedToolbelt, chatGate);

    // Inject the recursive-decomposition primitive (ungated — it spawns a
    // child loop whose own tools are the gated `baseTools`). Child events
    // stream back tagged with `parent_tool_call_id` so the UI can nest cards.
    const serverTools: Tool[] = baseTools.slice();
    // The same runtime the delegation tools take, kept for the capability run
    // below: provider, model, the parent belt, and the event forwarder.
    let subAgentRuntime: SubAgentRuntime | undefined;
    {
      const subtaskThreadId = threadId;
      const subtaskWorkflowId = workflowId;
      const forwardSubtaskMessage = async (msg: ProcessingMessage) => {
        const enriched: Record<string, unknown> = { ...msg };
        if (enriched.thread_id == null) enriched.thread_id = subtaskThreadId;
        if (enriched.workflow_id == null)
          enriched.workflow_id = subtaskWorkflowId;
        try {
          await this.session.send(enriched);
          // Tool calls inside a subtask only arrive here as transient
          // tool_call_update events; the chat UI needs a persistent assistant
          // message with tool_calls to render a ToolCallCard. Emit a synthetic
          // one so child tool calls show up as cards nested below the parent
          // run_subtask card.
          await this.emitSyntheticToolCallCard(enriched);
        } catch (err) {
          log.warn("Failed to forward subtask event", {
            error: err instanceof Error ? err.message : String(err)
          });
        }
      };
      subAgentRuntime = {
        provider,
        model,
        parentTools: () => baseTools,
        forwardMessage: forwardSubtaskMessage,
        background: new BackgroundSubtaskRegistry()
      };
      // All four delegation tools reach the belt as capabilities over this
      // runtime. The class is still what runs — the `agents` module builds one
      // per call — so the depth gate, the child's inherited belt (with a
      // `run_subtask` of its own stitched in by `buildChildToolset`, since this
      // snapshot deliberately predates the unshift), and the
      // `parent_tool_call_id` / `subtask_depth` tagging are unchanged.
      // `start_subtask` / `wait_subtasks` share the per-turn registry above:
      // spawn returns immediately, and the parent collects on its own terms.
      const delegationRun = (context: ProcessingContext) =>
        createCapabilityRun({
          context,
          // Ungated on purpose, as before: spawning a child loop has no side
          // effect of its own, and the child's tools are the gated `baseTools`.
          gate: UNGATED,
          availableSecrets: contextSecretAvailability(context),
          subAgent: subAgentRuntime
        });
      serverTools.unshift(toolForCapabilityName("run_subtask", delegationRun));
      serverTools.unshift(
        toolForCapabilityName("start_subtask", delegationRun)
      );
      serverTools.unshift(
        toolForCapabilityName("wait_subtasks", delegationRun)
      );

      // Read-only fan-out search (opt-in). Reuses the same runtime — the
      // capability filters the parent belt to its read-only allowlist
      // internally, so passing the full snapshot is correct.
      if (enableReadOnlySearch) {
        serverTools.unshift(toolForCapabilityName("run_search", delegationRun));
      }
    }

    const serverToolMap = new Map(serverTools.map((t) => [t.name, t]));
    const workflowDocumentToolNames = new Set<string>(
      WORKFLOW_DOCUMENT_TOOL_NAMES
    );
    log.info("Resolved server tools", {
      permissionMode,
      resolved: serverTools.map((t) => t.name)
    });

    const serverSchemas: ProviderTool[] = serverTools.map((t) =>
      t.toProviderTool()
    );
    // Every client tool the connected UI registered is exposed. They used to be
    // gated on an active workflow, which made the editor tools unreachable from
    // plain chat; they are deferred behind `nodetool.searchTools()` anyway, and each one now
    // takes an explicit document id, so the gate cost reach without buying
    // safety. Which ids are valid comes from `ui_context` in the system prompt.
    const clientToolNames = Object.keys(this.deps.clientTools());
    const clientSchemas: ProviderTool[] = [];
    for (const [name, manifest] of Object.entries(this.deps.clientTools())) {
      if (serverToolMap.has(name)) continue;
      // The frontend manifest carries the JSON schema under `parameters`
      // (FrontendToolRegistry.getManifest); accept `inputSchema` too for any
      // client that uses the provider-tool field name.
      const schema =
        typeof manifest.parameters === "object"
          ? (manifest.parameters as Record<string, unknown>)
          : typeof manifest.inputSchema === "object"
            ? (manifest.inputSchema as Record<string, unknown>)
            : undefined;
      clientSchemas.push({
        name,
        description: isString(manifest.description)
          ? manifest.description
          : undefined,
        inputSchema: schema
      });
    }
    const allSchemas: ProviderTool[] = [...serverSchemas, ...clientSchemas];

    // A chat turn with tools always runs in CodeAct: the model acts by writing
    // sandboxed JavaScript over the toolbelt (docs/codeact-design.md), and the
    // session's in-sandbox `nodetool.searchTools()` is the discovery path. The session
    // is created below, once the tool router and processing context exist.
    const useCodeAct = allSchemas.length > 0;

    // The tool list handed to the provider: `execute_code`, the direct tools
    // (DIRECT_TOOL_NAMES) and `view_image`, pushed once the session exists.
    const providerToolSchemas: ProviderTool[] = [];
    log.info("Provider tool schemas", {
      permissionMode,
      serverToolCount: serverTools.length,
      clientToolCount: clientToolNames.length,
      codeact: useCodeAct
    });

    // Create a processing context for tool execution
    // A chat turn without a workflow still resolves a workspace — the user's
    // default one. It used to fall back to the whole OS temp dir, which is
    // neither bounded nor anywhere the user would look for what an agent wrote.
    const chatWorkspace = this.session.workspaceResolver
      ? await this.session.workspaceResolver(
          await this.threadWorkspaceWorkflowId(userId, threadId, workflowId),
          userId
        )
      : null;
    const ctx = createRuntimeContext({
      jobId: randomUUID(),
      workflowId,
      threadId: threadId || null,
      userId,
      workspace: chatWorkspace,
      authToken: this.deps.authToken()
    });
    const detachPredictions = attachChatPredictionForwarder(
      (listener) => ctx.addMessageListener(listener),
      (msg) => this.session.sendDetached(msg),
      { threadId: threadId || null, workflowId }
    );
    // A chat turn that generates an image or a video spends real money without
    // ever constructing an ExecutionSession, so the ledger is attached here
    // too — otherwise the turn is invisible to `nodetool costs`.
    const detachCostLedger = attachRunCostLedger(ctx, {
      userId,
      workflowId: workflowId ?? null,
      // A project's own thread attributes its spend to that project, so
      // `nodetool costs` can answer what a project cost.
      projectId: chatProjectId ?? null,
      resolveSecret: (key) => ctx.getSecret(key)
    });
    // Any agent planning inside this turn (e.g. via run_node spawning an
    // Agent node in plan mode) pauses for user plan approval.
    attachPlanApproval(
      ctx,
      threadId || null,
      (id, plan) => this.requestPlanApproval(id, plan),
      codeactClock
    );
    // Stamp the turn's own selection so a tool that launches another harness
    // inherits this chat's provider/model when the call doesn't name one.
    ctx.set(ACTIVE_MODEL_CONTEXT_KEY, {
      provider: providerId,
      model
    } satisfies ActiveModelSelection);

    // The capability run for this turn: the same gate the belt is wrapped in,
    // this context, and the singletons the tool constructors take today. Every
    // capability a host must supply itself goes in `capabilities` — `run_node`
    // carries a closure only this package can build. The codeact session below
    // mounts it, so an action can import
    // `@nodetool-ai/sandbox-nodetool/<namespace>` and land on `run.invoke`.
    this.chatCapabilityRun = createCapabilityRun({
      context: ctx,
      gate: chatGate,
      projectId: chatProjectId,
      availableSecrets: contextSecretAvailability(ctx),
      nodeRegistry: this.session.nodeRegistry,
      providers: chatProviders,
      subAgent: subAgentRuntime,
      secretPrompt: (request) => this.requestSecretEntry(threadId, request),
      ...mcpToolHostDeps(),
      capabilities: [capabilityFromTool(runNodeTool)]
    });

    // CodeAct session for this turn. Created here so its prompt section is in
    // place before the system message is materialized below. The tool router
    // (`executeTool`, defined further down) is late-bound through a ref; it is
    // assigned before the provider loop can run any action.
    let codeactExecuteToolRef:
      | ((toolCall: ProviderToolCall) => Promise<string | MessageContent[]>)
      | null = null;
    let codeactSession: ChatCodeActSession | null = null;
    if (useCodeAct) {
      // The core set (file, search, fetch, todo, delegation) and discovery
      // (which providers, models and node types this install has) are also
      // plain tool calls: one question with one answer, which routing through
      // a sandbox action only delays. They stay on the belt so code can still
      // compose them; the prompt documents the direct call.
      const directSchemas = allSchemas.filter(
        (s) => s.name !== "view_image" && DIRECT_TOOL_NAMES.has(s.name)
      );
      codeactSession = createChatCodeActSession({
        tools: allSchemas
          .filter((s) => s.name !== "view_image")
          .map((s) => ({
            name: s.name,
            description: s.description,
            inputSchema: s.inputSchema
          })),
        sandboxPackages: sandboxPackagesForChat({
          source: uiContext?.source,
          focusedType: uiContext?.focused?.type,
          catalog: getProcessSandboxModuleCatalog()
        }),
        directToolNames: directSchemas.map((s) => s.name),
        executeTool: async (call: ChatCodeActToolCall) => {
          if (!codeactExecuteToolRef) {
            throw new Error("Tool router not ready");
          }
          return codeactExecuteToolRef({
            id: call.id,
            name: call.name,
            args: call.args
          });
        },
        residentToolNames: [
          ...CODEACT_RESIDENT_TOOL_NAMES,
          ...RESIDENT_TOOL_NAMES,
          ...focusedUiToolNames(
            uiContext,
            allSchemas.map((schema) => schema.name)
          )
        ],
        context: ctx,
        signal,
        clock: codeactClock,
        capabilityRun: this.chatCapabilityRun ?? undefined
      });
      providerToolSchemas.push(codeactSession.providerTool);
      providerToolSchemas.push(...directSchemas);
      // `view_image` stays a direct provider tool: it is the one channel that
      // puts pixels into the model's context, and pixels cannot ride the
      // sandbox's JSON observation envelope.
      const viewImage = allSchemas.find((s) => s.name === "view_image");
      if (viewImage) providerToolSchemas.push(viewImage);
      codeactPromptSection = codeactSession.systemPromptSection;
      log.info("Chat turn running in codeact mode", {
        threadId,
        toolCount: allSchemas.length,
        directToolCount: directSchemas.length
      });
    }

    // Prepend system prompt if first message isn't system role — matches Python
    if (chatHistory.length === 0 || chatHistory[0].role !== "system") {
      chatHistory.unshift({
        role: "system",
        content: buildSystemContent(),
        toolCallId: null,
        toolCalls: null,
        threadId: null
      });
    }

    // The agent now discovers and queries collections itself via the
    // list_collections / query_collection tools, so there is no client-driven
    // RAG pre-query here.
    const userContent = extractTextContent(data.content);

    // Final assistant text. Updated as the provider emits assistant
    // messages; the last one wins.
    let content = "";
    // The session token to persist onto the assistant message. Seeds from the
    // prior turn's token (so a session-based provider resumes) and is refreshed
    // whenever the provider emits a new ProviderSessionUpdate this turn.
    let capturedSession: ProviderSession | null = priorSession;
    // What to persist onto the assistant message: the provider's token, but with
    // the absolute checkpoint when the fast path sent only a delta (the
    // provider's emitted checkpoint is relative to the trimmed view).
    const sessionForPersist = (): ProviderSession | null =>
      sessionCheckpointOverride != null && capturedSession
        ? { ...capturedSession, checkpoint: sessionCheckpointOverride }
        : capturedSession;

    // Cap on tool-calling rounds before the loop stops. Generous enough to
    // build a multi-component app UI or run a long edit session in one turn —
    // 10 was too low and cut off the app builder mid-build.
    const MAX_TOOL_ROUNDS = 50;
    // Items still read from a superseded turn, purely to catch tool results
    // already in flight. A provider that honors the abort ends well inside it.
    const MAX_SUPERSEDED_DRAIN_ITEMS = 200;
    const useTools = providerToolSchemas.length > 0;

    // The wire messages. The provider's generateLoop owns the tool-calling
    // rounds and message assembly from here.
    let messagesToSend = [...chatHistory];

    // Everything turn-scoped, gathered in one place and appended once, after
    // media resolution, to the last user message. None of it is persisted, so
    // whatever is injected here is absent from the history a later turn sends
    // — which is exactly why it must sit behind every byte a later turn will
    // reuse. See `appendContextToLastUser`.
    const volatileContext: string[] = [];
    // Durable memories (memory_* tools), so the agent starts each turn aware
    // of what it recorded — project facts, decisions, and the assets it
    // generated for reuse. This thread's in full, the rest as a count it can
    // search. Deterministic and always-on.
    if (threadId) {
      const memoryBlock = await this.buildMemoryBlock(
        userId,
        threadId
      );
      if (memoryBlock) volatileContext.push(memoryBlock);
    }

    // The bodies of any skills the message invoked with `/<name>`. The catalog
    // half is stable and already sits in the system prompt.
    const invokedSkills = invokedSkillsSection(userSkills, userContent);
    if (invokedSkills) volatileContext.push(invokedSkills);

    // Expand any `asset://<id>.<ext>` references the composer or a prior turn
    // attached and dereference the URIs to data the provider can consume.
    // Image / audio mentions typed inline in a text part get split into proper
    // blocks first (mirroring what the workflow agent node does in
    // `buildUserMessage`), then every block with an `asset://` / storage URI is
    // resolved to a data URI. Text-document mentions are inlined as their
    // decoded contents. Without this step the provider would see literal
    // `asset://…` text and never look at the referenced media.
    messagesToSend = await ctx.resolveMessageMediaUris(messagesToSend);

    // After resolution, so a memory's `asset://` reference stays a reference
    // instead of being inlined as a data URI.
    if (volatileContext.length > 0) {
      messagesToSend = appendContextToLastUser(
        messagesToSend,
        volatileContext.join("\n\n")
      );
    }

    // Run one tool call and return the result to feed back to the model. Owns
    // server/client tool routing, side effects (client round-trips via the
    // ToolBridge), and asset materialization; the provider's loop orchestrates.
    // Image results (e.g. ui_3d_capture_view) return MessageContent blocks so
    // vision providers can see them; everything else returns result text.
    const executeTool = async (
      toolCall: ProviderToolCall
    ): Promise<string | MessageContent[]> => {
      let toolResult: unknown;
      const serverTool = serverToolMap.get(toolCall.name);
      const preferClientDocumentTool =
        workflowDocumentToolNames.has(toolCall.name) &&
        this.deps.clientTools()[toolCall.name] !== undefined;
      if (preferClientDocumentTool) {
        // The renderer owns live, potentially unsaved state. Use it when it is
        // present; the server implementation remains the headless fallback.
        await this.session.send({
          type: "tool_call",
          thread_id: threadId,
          tool_call_id: toolCall.id,
          name: toolCall.name,
          args: toolCall.args
        });
        const clientResult = await this.deps.toolBridge.createWaiter(
          toolCall.id,
          300_000,
          threadId
        );
        toolResult =
          clientResult.result ?? clientResult.content ?? clientResult;
      } else if (serverTool) {
        try {
          toolResult = await Tool.executeTool(serverTool, ctx, toolCall.args, {
            toolCallId: toolCall.id
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          log.error("Tool execution failed", {
            tool: toolCall.name,
            error: errMsg
          });
          toolResult = { error: errMsg };
        }
      } else if (this.deps.clientTools()[toolCall.name]) {
        // Client-side tool — round-trip through the UI via the ToolBridge.
        await this.session.send({
          type: "tool_call",
          thread_id: threadId,
          tool_call_id: toolCall.id,
          name: toolCall.name,
          args: toolCall.args
        });
        const clientResult = await this.deps.toolBridge.createWaiter(
          toolCall.id,
          300_000,
          threadId
        );
        toolResult =
          clientResult.result ?? clientResult.content ?? clientResult;
      } else {
        toolResult = { error: `Tool "${toolCall.name}" not available` };
      }

      // view_image is the ONE mechanism that puts pixels into the model's
      // context: its image_content rides the tool message so the model sees the
      // image this turn. (The chat loop builds tool messages inside
      // provider.generateLoop, so the tool return value is the only hook.)
      if (toolCall.name === "view_image") {
        const injected = extractInjectableImages(toolResult);
        if (injected) {
          return [{ type: "text", text: injected.text }, ...injected.images];
        }
      }

      // Every other tool that produced pixels (timeline frames, 3D capture, …)
      // gets them persisted as temp image assets; the model receives only a
      // handle and calls view_image when it wants to look.
      toolResult = await this.materializeToolResultImages(toolResult, ctx);

      const processed = await this.processToolResult(toolResult, ctx);
      return isString(processed) ? processed : JSON.stringify(processed);
    };

    // Late-bind the codeact bridge to the router above, and route
    // `execute_code` calls into the sandbox session; everything else (only
    // `view_image` is offered in codeact mode) keeps the normal path.
    codeactExecuteToolRef = executeTool;
    const session = codeactSession;
    const beltToolNames = new Set(allSchemas.map((s) => s.name));
    const effectiveExecuteTool = async (
      rawCall: ProviderToolCall
    ): Promise<string | MessageContent[]> => {
      // A model that read the CodeAct prompt sometimes calls
      // `tools.<name>` at the top level. Recover the plain name first, so the
      // call reaches the tool instead of dying as "no such tool".
      const name = normalizeToolCallName(rawCall.name);
      const toolCall = name === rawCall.name ? rawCall : { ...rawCall, name };
      if (!session) return executeTool(toolCall);
      if (name === EXECUTE_CODE_TOOL_NAME) {
        return session.executeAction(toolCall.args);
      }
      // A belt tool named directly still runs: the router is the same gate the
      // sandbox bridge goes through, so answering the call is strictly better
      // than refusing it and spending a round on the correction.
      if (beltToolNames.has(name)) return executeTool(toolCall);
      // Answer, do not throw: the model can only correct course if the
      // recovery instructions arrive as this call's tool result.
      return JSON.stringify({ error: unroutableToolMessage(name) });
    };

    // Tool name by call id, so persisted tool messages keep their name (the
    // provider Message carries only the id).
    const toolNames = new Map<string, string>();
    // Calls announced by an assistant message that have not been answered by a
    // tool message yet. Whatever is still here when the turn tears down never
    // got its result row, and the `finally` below writes a stand-in so the
    // transcript stays well-formed.
    const openToolCalls = new Set<string>();
    // Set when a newer turn supersedes this one. The loop then stops feeding
    // the client and only rescues the results still coming.
    let superseded = false;
    let drainedItems = 0;

    /**
     * Write one message this turn produced. `echo` is false for a superseded
     * turn: the row still belongs in the thread, but the client has moved on
     * and replaying it there would interleave a dead turn into a live one.
     */
    const persistTurnMessage = async (
      m: ProviderMessage,
      echo: boolean
    ): Promise<void> => {
      if (m.role === "assistant") {
        // Content may be a plain string or a MessageContent[] carrying
        // native-image blocks. Raw image bytes are turned into real assets
        // here so base64 never lands in the DB or on the wire.
        let persistedContent: unknown = m.content ?? null;
        if (isString(m.content)) {
          if (echo) content = m.content;
        } else if (Array.isArray(m.content)) {
          const materialized = await this.materializeAssistantImageContent(
            m.content,
            userId,
            workflowId
          );
          persistedContent = materialized;
          if (echo) {
            content = materialized
              .filter((c) => c.type === "text" && isString(c.text))
              .map((c) => c.text as string)
              .join("");
          }
        }
        const toolCalls = Array.isArray(m.toolCalls)
          ? m.toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              args: tc.args,
              result: null,
              // Gemini 3 rejects a history that replays a function call
              // without the signature it issued, so it rides into the DB.
              thought_signature: tc.thought_signature ?? null
            }))
          : null;
        for (const tc of toolCalls ?? []) {
          if (!isString(tc.id)) continue;
          openToolCalls.add(tc.id);
          toolNames.set(tc.id, tc.name);
        }
        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: persistedContent
        };
        if (toolCalls) {
          assistantMsgData.tool_calls = toolCalls;
        }
        assistantMsgData.thread_id = threadId;
        assistantMsgData.workflow_id = workflowId;
        assistantMsgData.provider = providerId;
        assistantMsgData.model = model;
        assistantMsgData.provider_session = sessionForPersist();
        await this.saveMessageToDb(assistantMsgData);
        if (echo) await this.session.send(assistantMsgData);
        return;
      }
      if (m.role !== "tool") return;
      // Image tool results carry MessageContent blocks; persist/echo only
      // their note text so chat history stays light (the base64 rode the
      // in-flight provider message, never the DB).
      const toolContent = Array.isArray(m.content)
        ? toolResultDisplayText(m.content)
        : isString(m.content)
          ? m.content
          : "";
      if (isString(m.toolCallId)) openToolCalls.delete(m.toolCallId);
      const toolMsgData = {
        type: "message",
        role: "tool",
        tool_call_id: m.toolCallId ?? null,
        name: m.toolCallId ? (toolNames.get(m.toolCallId) ?? null) : null,
        content: toolContent,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model
      } satisfies Record<string, unknown>;
      await this.saveMessageToDb(toolMsgData);
      if (echo) await this.session.send(toolMsgData);
    };

    // The Claude Agent provider runs the SDK's own loop, which resolves skills
    // through its native `Skill` tool (progressive disclosure) rather than the
    // always-on catalog every other provider reads from the system prompt. Hand
    // it the user's DB skills so that loop can list and load them; it
    // materializes them into an isolated local plugin (no `settingSources`
    // leakage). Other providers get skills via the system-prompt catalog above
    // and ignore this field.
    const skillsForProvider =
      provider.provider === PROVIDER_IDS.CLAUDE_AGENT_SDK
        ? userSkills.map((skill) => ({
            name: skill.name,
            description: skill.description,
            content: skill.content
          }))
        : undefined;

    try {
      for await (const item of provider.generateLoop({
        messages: messagesToSend,
        model,
        tools: useTools ? providerToolSchemas : undefined,
        threadId,
        providerSession: capturedSession,
        loadFullHistory: loadFullHistory ?? undefined,
        executeTool: useTools ? effectiveExecuteTool : undefined,
        maxIterations: MAX_TOOL_ROUNDS,
        sequentialTools: session ? true : undefined,
        workspaceDir: chatWorkspace?.localDir ?? undefined,
        skills: skillsForProvider,
        signal
      })) {
        // A newer turn has taken over. Stop driving the client, but do NOT
        // drop what this turn already produced: the provider checks its abort
        // signal before dispatching a tool, never during one, so a call in
        // flight runs to completion and its result is arriving right now.
        // Discarding it left the model blind to a side effect it had already
        // caused, and it silently redid the work.
        if (
          !superseded &&
          requestSeq !== undefined &&
          requestSeq !== this.chatRequestSeq
        ) {
          superseded = true;
        }
        if (superseded) {
          if (isProviderMessageEvent(item)) {
            await persistTurnMessage(item.message, false);
          }
          // Nothing left outstanding: the rest of this turn is work the user
          // has already moved on from.
          if (openToolCalls.size === 0) break;
          // The turn's signal is already aborted, so a provider that honors it
          // ends within a few items. One that does not must never hold this
          // handler open — stop reading and let the `finally` stand in for
          // whatever is still missing.
          if (++drainedItems > MAX_SUPERSEDED_DRAIN_ITEMS) {
            log.warn("Superseded turn kept producing; stopped draining", {
              threadId,
              openToolCalls: openToolCalls.size
            });
            break;
          }
          continue;
        }

        if (isProviderSessionUpdate(item)) {
          // Internal continuity token — capture for persistence, never wired.
          capturedSession = item.session;
          continue;
        }

        if (isProviderMessageEvent(item)) {
          await persistTurnMessage(item.message, true);
          continue;
        }

        if ("type" in item && (item as Chunk).type === "chunk") {
          // --- Text chunk --- forward to client (not persisted)
          const chunk = item as Chunk;
          if (!chunk.thread_id) chunk.thread_id = threadId;
          await this.session.send({ ...chunk });
        } else if ("name" in item && "id" in item) {
          // --- Tool call from the provider (informational; executed by the
          // loop via executeTool) ---
          const tc = item as ProviderToolCall;
          toolNames.set(tc.id, tc.name);
          log.info("Tool call", { tool: tc.name, args: tc.args });
        }
      }

      // A superseded turn is done once its outstanding results are saved. The
      // completion chunk and the memory pass belong to the turn the user is
      // actually watching, which has its own.
      if (superseded) return;

      // Log provider call for cost tracking — matches Python's _log_provider_call()
      await this._logProviderCall(
        userId,
        provider,
        providerId,
        model,
        workflowId,
        chatProjectId ?? null
      );

      // Signal completion — matches Python's done chunk.
      await this.session.send({
        type: "chunk",
        content: "",
        done: true,
        thread_id: threadId
      });

      log.debug("Chat complete", { threadId, chars: content.length });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("Chat processing error", { threadId, error: errMsg });

      // Detect error type — matches Python's separate ConnectError / HTTPStatusError handlers
      let errorType = "error";
      let statusCode: number | undefined;
      let formattedMsg = errMsg;

      // Connection errors (ECONNREFUSED, ENOTFOUND, etc.)
      if (
        errMsg.includes("ECONNREFUSED") ||
        errMsg.includes("ENOTFOUND") ||
        errMsg.includes("fetch failed") ||
        errMsg.includes("nodename nor servname")
      ) {
        errorType = "connection_error";
        if (
          errMsg.includes("ENOTFOUND") ||
          errMsg.includes("nodename nor servname")
        ) {
          formattedMsg =
            "Connection error: Unable to resolve hostname. Please check your network connection and API endpoint configuration.";
        } else {
          formattedMsg = `Connection error: ${errMsg}`;
        }
      }
      // HTTP status errors — check for status code in error
      else if (isObjectLike(err) && "status" in err) {
        const status = (err as { status: number }).status;
        errorType = "http_status_error";
        statusCode = status;

        // Try to extract error message from response body
        let bodyMsg: string | null = null;
        try {
          if ("body" in err || "response" in err) {
            const errObj = err as Record<string, unknown>;
            const body = errObj.body ?? errObj.response;
            if (isObjectLike(body) && "error" in body) {
              const errorDetail = body.error;
              if (isObjectLike(errorDetail) && "message" in errorDetail) {
                bodyMsg = String(errorDetail.message);
              }
            }
          }
        } catch {
          // Intentional: best-effort extraction of error message from response body
        }

        if (bodyMsg) {
          formattedMsg = bodyMsg;
        } else if (status === 400) {
          formattedMsg = `Bad request: ${errMsg}`;
        } else if (status === 401) {
          formattedMsg = "Authentication failed: Invalid API key or token";
        } else if (status === 403) {
          formattedMsg =
            "Access forbidden: You don't have permission for this resource";
        } else if (status === 404) {
          formattedMsg = "Not found: The requested resource was not found";
        } else if (status === 429) {
          formattedMsg = "Rate limited: Too many requests, please slow down";
        } else if (status >= 500) {
          formattedMsg = `Server error (${status}): The service is temporarily unavailable`;
        } else {
          formattedMsg = `HTTP error (${status}): ${errMsg}`;
        }
      }

      type ErrorMessageFields = {
        type: "error";
        message: string;
        error_type: string;
        status_code?: number;
        thread_id?: string | null;
        workflow_id?: string | null;
      };
      const errorMessage: ErrorMessageFields = {
        type: "error",
        message: formattedMsg,
        error_type: errorType
      };
      if (statusCode !== undefined) {
        errorMessage.status_code = statusCode;
      }
      errorMessage.thread_id = threadId;
      errorMessage.workflow_id = workflowId;
      await this.session.send(errorMessage);
      // Signal completion even on error — matches Python
      await this.session.send({
        type: "chunk",
        content: "",
        done: true,
        thread_id: threadId
      });
      const errorMsgData = {
        type: "message",
        role: "assistant",
        content:
          errorType === "connection_error"
            ? `I encountered a connection error: ${formattedMsg}. Please check your network connection and try again.`
            : errorType === "http_status_error"
              ? `I encountered an API error (HTTP ${statusCode}): ${formattedMsg}`
              : `I encountered an error: ${formattedMsg}`,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model
      } satisfies Record<string, unknown>;
      await this.saveMessageToDb(errorMsgData);
      await this.session.send(errorMsgData);
    } finally {
      detachPredictions();
      detachCostLedger();
      // Whatever is still outstanding never got a result row. Leaving the gap
      // makes the thread malformed — Anthropic rejects a `tool_use` with no
      // `tool_result` — and leaves the model unaware the call was abandoned,
      // which is what made it silently redo the work.
      for (const toolCallId of openToolCalls) {
        try {
          await this.saveMessageToDb({
            type: "message",
            role: "tool",
            tool_call_id: toolCallId,
            name: toolNames.get(toolCallId) ?? null,
            content: SUPERSEDED_TOOL_RESULT,
            thread_id: threadId,
            workflow_id: workflowId,
            provider: providerId,
            model
          });
        } catch (err) {
          // Best effort: a turn that already failed must not fail again here.
          this.session.logError("superseded tool result save failed", err);
        }
      }
      openToolCalls.clear();
    }
  }

  /**
   * Log a provider call for cost tracking — mirrors Python's _log_provider_call().
   * Best-effort: never throws, logs warnings on failure.
   */
  async _logProviderCall(
    userId: string,
    provider: BaseProvider,
    providerId: string,
    model: string,
    workflowId: string | null,
    projectId: string | null
  ): Promise<void> {
    if (!providerId || !model) {
      log.warn("Cannot log provider call: missing provider or model");
      return;
    }
    try {
      // A provider that could not price a call reports why. Its running total
      // is then missing that spend, so a zero is written as null — the row
      // reads unpriced in `nodetool costs` instead of summing as free, the
      // same posture the cost ledger takes.
      const unpricedReason = provider.unpricedReason;
      const cost = provider.cost;
      const unpriced = cost === 0 && unpricedReason != null;
      await Prediction.create({
        user_id: userId,
        provider: providerId,
        model,
        cost: unpriced ? null : cost,
        metadata: unpricedReason ? { unpriced_reason: unpricedReason } : null,
        workflow_id: workflowId,
        // Token spend from a project's agent thread is the project's; a turn
        // outside a project records a null rather than a bucket name.
        project_id: projectId,
        status: "completed",
        node_id: ""
      });
      log.debug("Logged provider call", { provider: providerId, model, cost });
    } catch (err) {
      if (err instanceof TypeError || err instanceof ReferenceError) {
        log.warn("Failed to log provider call due to invalid data", {
          error: err instanceof Error ? err.message : String(err)
        });
      } else {
        log.error("Unexpected error logging provider call", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  /**
   * Detect message input node names from a workflow graph.
   * Mirrors Python's WorkflowMessageProcessor._detect_message_input_names().
   *
   * Scans graph nodes for types ending in .MessageInput / .MessageListInput
   * and returns their data.name values.
   */
  private detectMessageInputNames(graph: {
    nodes: Array<Record<string, unknown>>;
    edges: unknown[];
  }) {
    let messageName: string | null = null;
    let messagesName: string | null = null;

    for (const node of graph.nodes) {
      const nodeType = isString(node.type) ? node.type : "";
      const data = isObjectLike(node.data)
        ? (node.data as Record<string, unknown>)
        : {};
      const nodeName = isString(data.name) ? data.name.trim() : "";
      if (!nodeName) continue;

      if (
        messageName === null &&
        (nodeType === "nodetool.input.MessageInput" ||
          nodeType.endsWith(".MessageInput"))
      ) {
        messageName = nodeName;
      }
      if (
        messagesName === null &&
        (nodeType === "nodetool.input.MessageListInput" ||
          nodeType.endsWith(".MessageListInput"))
      ) {
        messagesName = nodeName;
      }
    }

    return { messageName, messagesName };
  }

  /**
   * Handle a chat_message with a `media_generation` payload by invoking the
   * selected provider's textToImage / textToVideo API, storing the resulting
   * asset(s), and returning them to the client as an assistant `Message`
   * whose `content` is an array of `MessageImageContent` / `MessageVideoContent`
   * blocks.
   *
   * The generated bytes are persisted via `ctx.storage.store()` so each
   * output receives a stable URI the client can resolve as a server asset.
   * The `media_generation` echo on the assistant message lets the UI render
   * the generation header (model, variation count, resolution, etc.) in the
   * conversation stream.
   */
  private async handleMediaGenerationMessage(
    data: Record<string, unknown>,
    mediaGeneration: Record<string, unknown>,
    requestSeq?: number,
    signal?: AbortSignal
  ): Promise<void> {
    const threadId = isString(data.thread_id) ? data.thread_id : "";
    const workflowId = isString(data.workflow_id) ? data.workflow_id : null;
    const userId = this.session.userId ?? "1";
    const mode = String(mediaGeneration.mode ?? "");
    // The media composer's own selection first; a client without a separate
    // media picker (mobile) sends only the message-level one. The built-in
    // chat default is not in the chain — a text model can never serve a
    // generation, so falling back to it only buys an obscure provider error.
    const providerId = String(mediaGeneration.provider ?? data.provider ?? "");
    const modelId = String(mediaGeneration.model ?? data.model ?? "");
    const prompt = extractTextContent(data.content);

    /**
     * Whether this turn has been cancelled. The media provider APIs take no
     * AbortSignal, so an in-flight generation runs to completion regardless —
     * but its result must not be stored as an asset or delivered to a user who
     * pressed Stop. Checked after every provider call, before any write.
     */
    const cancelled = (): boolean =>
      signal?.aborted === true ||
      (requestSeq !== undefined && requestSeq !== this.chatRequestSeq);

    log.info("Media generation", {
      threadId,
      mode,
      provider: providerId,
      model: modelId,
      promptLen: prompt.length
    });

    if (!this.session.resolveProvider) {
      await this.session.send({
        type: "error",
        message: "No provider resolver configured",
        thread_id: threadId
      });
      return;
    }

    if (!isModelSelection(providerId, modelId)) {
      await this.session.send({
        type: "error",
        message: noMediaModelSelectedMessage(mode),
        thread_id: threadId
      });
      return;
    }

    if (!prompt) {
      await this.session.send({
        type: "error",
        message: "Please enter a prompt",
        thread_id: threadId
      });
      return;
    }

    if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq) return;

    // Entity mentions in the prompt (`entity://<id>`, written by @-mention
    // pickers) expand against the library here, exactly as the generate_media
    // RPC expands them: name inline, descriptor into a Consistency references
    // block, reference image routed into the generation inputs below. A
    // mention that resolves to no entity drops.
    const { prompt: expandedPrompt, referenceImages } =
      await expandEntitiesForGeneration(
        prompt,
        this.deps.entityRefResolver(userId)
      );
    const entityImageBytes = await this.deps.resolveEntityReferenceImages(
      userId,
      referenceImages
    );

    const provider = await this.session.resolveProvider(providerId, userId);
    // Wire up progress forwarding so provider.emitMessage() reaches the client.
    provider.setMessageEmitter((msg) => {
      this.session.sendDetached(msg as Record<string, unknown>);
    });

    // Store generated media as a proper Asset record and return the
    // asset ID.  The DB message stores only `asset_id` — URLs are
    // resolved at serve time by resolveContentUrls / sendMessage.
    const storeMediaAsset = async (
      bytes: Uint8Array,
      contentType: string,
      ext: string
    ): Promise<string> => {
      const asset = new Asset({
        user_id: userId,
        workflow_id: workflowId ?? null,
        name: `${mode}_${Date.now()}`,
        content_type: contentType,
        // Home, the same folder an upload lands in. A null parent is
        // unreachable from the folder the asset browser opens on.
        parent_id: userId
      });
      const fileName = `${asset.id}.${ext}`;
      await storeAssetWithThumbnail(
        asset.user_id,
        asset.id,
        fileName,
        bytes,
        contentType
      );
      asset.size = bytes.length;
      await asset.save();
      return asset.id;
    };

    try {
      if (mode === "image") {
        const variations = Math.max(
          1,
          Math.min(Number(mediaGeneration.variations ?? 1), 8)
        );
        const width = isNumber(mediaGeneration.width)
          ? mediaGeneration.width
          : undefined;
        const height = isNumber(mediaGeneration.height)
          ? mediaGeneration.height
          : undefined;
        const imageModel: ProviderImageModel = {
          id: modelId,
          name: modelId,
          provider: providerId
        };
        const params: TextToImageParams = {
          model: imageModel,
          prompt: expandedPrompt,
          width,
          height,
          signal
        };

        // Surface a progress chunk so the UI can show the request flight
        await this.session.send({
          type: "chunk",
          thread_id: threadId,
          content: "",
          content_type: "text",
          content_metadata: { media_generation: mediaGeneration },
          done: false
        });

        if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq)
          return;
        // A mentioned entity carries a reference image: the generation becomes
        // an edit against those images, mirroring the generate_media RPC.
        const imageBytesList =
          entityImageBytes.length > 0
            ? await provider.imageToImages(
                entityImageBytes,
                {
                  model: imageModel,
                  prompt: expandedPrompt,
                  targetWidth: width ?? null,
                  targetHeight: height ?? null,
                  signal
                },
                variations
              )
            : await provider.textToImages(params, variations);
        if (cancelled()) return;
        const imageContents: Array<Record<string, unknown>> = [];
        for (const bytes of imageBytesList) {
          // Per-variation: a cancel partway through must not keep persisting.
          if (cancelled()) return;
          const mimeType = detectImageMime(bytes);
          const assetId = await storeMediaAsset(
            bytes,
            mimeType,
            IMAGE_MIME_TO_EXT[mimeType] ?? "png"
          );
          imageContents.push({
            type: "image_url",
            image: { type: "image", asset_id: assetId, mimeType }
          });
        }

        await this.session.send({
          type: "chunk",
          thread_id: threadId,
          content: "",
          done: true
        });

        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: imageContents,
          thread_id: threadId,
          workflow_id: workflowId,
          provider: providerId,
          model: modelId,
          media_generation: mediaGeneration
        };
        // Re-check: cancellation may have landed while the asset was persisting.
        if (cancelled()) return;
        await this.saveMessageToDb(assistantMsgData);
        await this.session.send(assistantMsgData);
        return;
      }

      if (mode === "video") {
        const aspectRatio = isString(mediaGeneration.aspect_ratio)
          ? (mediaGeneration.aspect_ratio as string)
          : null;
        const resolution = isString(mediaGeneration.resolution)
          ? (mediaGeneration.resolution as string)
          : null;
        const duration = isNumber(mediaGeneration.duration)
          ? (mediaGeneration.duration as number)
          : null;
        const videoModel: ProviderVideoModel = {
          id: modelId,
          name: modelId,
          provider: providerId
        };

        await this.session.send({
          type: "chunk",
          thread_id: threadId,
          content: "",
          content_type: "text",
          content_metadata: { media_generation: mediaGeneration },
          done: false
        });

        // If the user referenced/attached an image, they want it animated:
        // route to image-to-video so the image actually reaches the provider.
        // Many "video" models (e.g. fal-ai/stable-video) in fact require an
        // image and reject a text-only request with an opaque 422.
        const sourceBytes = await this.deps.resolveSourceImageBytes(
          data,
          mediaGeneration,
          userId
        );
        let bytes: Uint8Array;
        if (sourceBytes && sourceBytes.length > 0) {
          const i2vParams: ImageToVideoParams = {
            model: videoModel,
            prompt: expandedPrompt,
            aspectRatio,
            resolution,
            durationSeconds: duration,
            numInferenceSteps: null,
            signal
          };
          bytes = await provider.imageToVideo([sourceBytes], i2vParams);
        } else {
          const params: TextToVideoParams = {
            model: videoModel,
            prompt: expandedPrompt,
            aspectRatio,
            resolution,
            durationSeconds: duration,
            signal
          };
          bytes = await provider.textToVideo(params);
        }
        if (cancelled()) return;
        const assetId = await storeMediaAsset(bytes, "video/mp4", "mp4");

        await this.session.send({
          type: "chunk",
          thread_id: threadId,
          content: "",
          done: true
        });

        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "video",
              video: {
                type: "video",
                asset_id: assetId,
                format: "mp4",
                duration: duration
              }
            }
          ],
          thread_id: threadId,
          workflow_id: workflowId,
          provider: providerId,
          model: modelId,
          media_generation: mediaGeneration
        };
        // Re-check: cancellation may have landed while the asset was persisting.
        if (cancelled()) return;
        await this.saveMessageToDb(assistantMsgData);
        await this.session.send(assistantMsgData);
        return;
      }

      if (mode === "audio") {
        const voice = isString(mediaGeneration.voice)
          ? (mediaGeneration.voice as string)
          : undefined;
        const speed = isNumber(mediaGeneration.speed)
          ? (mediaGeneration.speed as number)
          : 1.0;
        const requestedFormatRaw = isString(mediaGeneration.audio_format)
          ? (mediaGeneration.audio_format as string).toLowerCase()
          : null;
        const supportedFormats = new Set([
          "mp3",
          "wav",
          "pcm",
          "opus",
          "flac",
          "aac"
        ]);
        const requestedFormat =
          requestedFormatRaw && supportedFormats.has(requestedFormatRaw)
            ? requestedFormatRaw
            : null;
        await this.session.send({
          type: "chunk",
          thread_id: threadId,
          content: "",
          content_type: "text",
          content_metadata: { media_generation: mediaGeneration },
          done: false
        });

        let assetId: string;
        let audioMimeType: string;

        // Some providers (e.g. HuggingFace, OpenAI) can return fully-encoded
        // audio. Prefer that path when available and honor the requested
        // container when the provider supports it.
        const encoded = await provider.textToSpeechEncoded({
          text: expandedPrompt,
          model: modelId,
          voice,
          speed,
          audioFormat: requestedFormat ?? undefined
        });

        if (encoded) {
          const mimeToExt: Record<string, string> = {
            "audio/mpeg": "mp3",
            "audio/wav": "wav",
            "audio/ogg": "ogg",
            "audio/flac": "flac",
            "audio/aac": "aac"
          };
          const ext = mimeToExt[encoded.mimeType] ?? "flac";
          if (
            requestedFormat &&
            requestedFormat !== ext &&
            requestedFormat !== "pcm"
          ) {
            log.warn(
              "Requested audio_format not supported by provider; returning native format",
              {
                providerId,
                modelId,
                requestedFormat,
                returnedMime: encoded.mimeType
              }
            );
          }
          if (cancelled()) return;
          assetId = await storeMediaAsset(encoded.data, encoded.mimeType, ext);
          audioMimeType = encoded.mimeType;
        } else {
          // Streaming PCM path (OpenAI, Gemini, etc.)
          const pcmChunks: Uint8Array[] = [];
          let totalBytes = 0;
          let chunkSampleRate = 24000;
          for await (const chunk of provider.textToSpeech({
            text: expandedPrompt,
            model: modelId,
            voice,
            speed,
            audioFormat: requestedFormat ?? undefined
          })) {
            if (cancelled()) return;
            if (chunk?.samples) {
              if (chunk.sampleRate) chunkSampleRate = chunk.sampleRate;
              const view = new Uint8Array(
                chunk.samples.buffer,
                chunk.samples.byteOffset,
                chunk.samples.byteLength
              );
              const copy = new Uint8Array(view);
              pcmChunks.push(copy);
              totalBytes += copy.byteLength;
            }
          }
          const merged = new Uint8Array(totalBytes);
          let off = 0;
          for (const c of pcmChunks) {
            merged.set(c, off);
            off += c.byteLength;
          }

          if (requestedFormat === "pcm") {
            // Return raw PCM Int16 bytes (no container).
            if (cancelled()) return;
            assetId = await storeMediaAsset(merged, "audio/pcm", "pcm");
            audioMimeType = "audio/pcm";
          } else {
            if (
              requestedFormat &&
              requestedFormat !== "wav" &&
              requestedFormat !== "pcm"
            ) {
              log.warn(
                "Requested audio_format cannot be produced from streaming PCM; falling back to WAV",
                { providerId, modelId, requestedFormat }
              );
            }
            // Wrap raw PCM Int16 in a WAV container so browsers can play it.
            const sampleRate = chunkSampleRate;
            const numChannels = 1;
            const bitsPerSample = 16;
            const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
            const blockAlign = numChannels * (bitsPerSample / 8);
            const wavHeader = new ArrayBuffer(44);
            const dv = new DataView(wavHeader);
            const writeStr = (pos: number, str: string) => {
              for (let i = 0; i < str.length; i++)
                dv.setUint8(pos + i, str.charCodeAt(i));
            };
            writeStr(0, "RIFF");
            dv.setUint32(4, 36 + merged.byteLength, true);
            writeStr(8, "WAVE");
            writeStr(12, "fmt ");
            dv.setUint32(16, 16, true);
            dv.setUint16(20, 1, true);
            dv.setUint16(22, numChannels, true);
            dv.setUint32(24, sampleRate, true);
            dv.setUint32(28, byteRate, true);
            dv.setUint16(32, blockAlign, true);
            dv.setUint16(34, bitsPerSample, true);
            writeStr(36, "data");
            dv.setUint32(40, merged.byteLength, true);

            const wav = new Uint8Array(44 + merged.byteLength);
            wav.set(new Uint8Array(wavHeader), 0);
            wav.set(merged, 44);

            if (cancelled()) return;
            assetId = await storeMediaAsset(wav, "audio/wav", "wav");
            audioMimeType = "audio/wav";
          }
        }

        await this.session.send({
          type: "chunk",
          thread_id: threadId,
          content: "",
          done: true
        });

        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "audio",
              audio: {
                type: "audio",
                asset_id: assetId,
                mimeType: audioMimeType
              }
            }
          ],
          thread_id: threadId,
          workflow_id: workflowId,
          provider: providerId,
          model: modelId,
          media_generation: mediaGeneration
        };
        // Re-check: cancellation may have landed while the asset was persisting.
        if (cancelled()) return;
        await this.saveMessageToDb(assistantMsgData);
        await this.session.send(assistantMsgData);
        return;
      }

      if (mode === "image_edit" || mode === "image_to_video") {
        // Resolve the source image from either the message content (most
        // common path: user dropped an image into the composer) or from the
        // explicit `source_asset_id` echo on the media_generation payload.
        const sourceBytes = await this.deps.resolveSourceImageBytes(
          data,
          mediaGeneration,
          userId
        );
        // A zero-length buffer (e.g. a storage read that resolved but came
        // back empty) is truthy — without the length check it sails past this
        // guard, then silently drops out of `attachAssets`'s image field
        // downstream, so fal gets a request with no image at all and rejects
        // it with an opaque 422 instead of the friendly error below.
        if (!sourceBytes || sourceBytes.length === 0) {
          await this.session.send({
            type: "error",
            message:
              "A source image is required — drop or attach an image first",
            thread_id: threadId
          });
          return;
        }

        await this.session.send({
          type: "chunk",
          thread_id: threadId,
          content: "",
          content_type: "text",
          content_metadata: { media_generation: mediaGeneration },
          done: false
        });

        if (mode === "image_edit") {
          const variations = Math.max(
            1,
            Math.min(Number(mediaGeneration.variations ?? 1), 8)
          );
          const targetWidth = isNumber(mediaGeneration.width)
            ? (mediaGeneration.width as number)
            : undefined;
          const targetHeight = isNumber(mediaGeneration.height)
            ? (mediaGeneration.height as number)
            : undefined;
          const strength = isNumber(mediaGeneration.strength)
            ? (mediaGeneration.strength as number)
            : undefined;
          const numInferenceSteps = isNumber(
            mediaGeneration.num_inference_steps
          )
            ? (mediaGeneration.num_inference_steps as number)
            : undefined;
          const editModel: ProviderImageModel = {
            id: modelId,
            name: modelId,
            provider: providerId
          };
          const params: ImageToImageParams = {
            model: editModel,
            prompt: expandedPrompt,
            targetWidth: targetWidth ?? null,
            targetHeight: targetHeight ?? null,
            strength: strength ?? null,
            numInferenceSteps: numInferenceSteps ?? null,
            signal
          };
          if (requestSeq !== undefined && requestSeq !== this.chatRequestSeq)
            return;
          const imageBytesList = await provider.imageToImages(
            [sourceBytes, ...entityImageBytes],
            params,
            variations
          );
          if (cancelled()) return;
          const imageContents: Array<Record<string, unknown>> = [];
          for (const bytes of imageBytesList) {
            // Per-variation: a cancel partway through must not keep persisting.
            if (cancelled()) return;
            const mimeType = detectImageMime(bytes);
            const assetId = await storeMediaAsset(
              bytes,
              mimeType,
              IMAGE_MIME_TO_EXT[mimeType] ?? "png"
            );
            imageContents.push({
              type: "image_url",
              image: {
                type: "image",
                asset_id: assetId,
                mimeType
              }
            });
          }
          await this.session.send({
            type: "chunk",
            thread_id: threadId,
            content: "",
            done: true
          });
          const assistantMsgData: Record<string, unknown> = {
            type: "message",
            role: "assistant",
            content: imageContents,
            thread_id: threadId,
            workflow_id: workflowId,
            provider: providerId,
            model: modelId,
            media_generation: mediaGeneration
          };
          // Re-check: cancellation may have landed while the asset was persisting.
          if (cancelled()) return;
          await this.saveMessageToDb(assistantMsgData);
          await this.session.send(assistantMsgData);
          return;
        }

        // image_to_video
        const aspectRatio = isString(mediaGeneration.aspect_ratio)
          ? (mediaGeneration.aspect_ratio as string)
          : null;
        const resolution = isString(mediaGeneration.resolution)
          ? (mediaGeneration.resolution as string)
          : null;
        const duration = isNumber(mediaGeneration.duration)
          ? (mediaGeneration.duration as number)
          : null;
        const numInferenceSteps = isNumber(mediaGeneration.num_inference_steps)
          ? (mediaGeneration.num_inference_steps as number)
          : null;
        const i2vModel: ProviderVideoModel = {
          id: modelId,
          name: modelId,
          provider: providerId
        };
        const params: ImageToVideoParams = {
          model: i2vModel,
          prompt: expandedPrompt,
          aspectRatio,
          resolution,
          durationSeconds: duration,
          numInferenceSteps,
          signal
        };
        const bytes = await provider.imageToVideo([sourceBytes], params);
        if (cancelled()) return;
        const assetId = await storeMediaAsset(bytes, "video/mp4", "mp4");
        await this.session.send({
          type: "chunk",
          thread_id: threadId,
          content: "",
          done: true
        });
        const assistantMsgData: Record<string, unknown> = {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "video",
              video: {
                type: "video",
                asset_id: assetId,
                format: "mp4",
                duration
              }
            }
          ],
          thread_id: threadId,
          workflow_id: workflowId,
          provider: providerId,
          model: modelId,
          media_generation: mediaGeneration
        };
        // Re-check: cancellation may have landed while the asset was persisting.
        if (cancelled()) return;
        await this.saveMessageToDb(assistantMsgData);
        await this.session.send(assistantMsgData);
        return;
      }

      // Modes not yet implemented on the backend — fall back to an informative
      // error so the client can render the unsupported state cleanly.
      await this.session.send({
        type: "error",
        message: `Media generation mode "${mode}" is not yet supported`,
        thread_id: threadId
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("Media generation error", { threadId, mode, error: errMsg });
      await this.session.send({
        type: "error",
        message: `Generation failed: ${errMsg}`,
        thread_id: threadId
      });
    }
  }

  /**
   * Handle a chat message that targets a workflow.
   *
   * Mirrors Python's process_messages_for_workflow → WorkflowMessageProcessor/
   * ChatWorkflowMessageProcessor flow:
   *   1. Load workflow from DB
   *   2. Detect message input node names from graph
   *   3. Prepare params (serialized message + history)
   *   4. Run workflow via ExecutionSession (@nodetool-ai/execution)
   *   5. Stream events (job_update, node_update, output_update)
   *   6. Collect output_update results
   *   7. Send done chunk + response message with typed content
   */
  private async handleWorkflowMessage(
    data: Record<string, unknown>,
    requestSeq?: number,
    signal?: AbortSignal
  ): Promise<void> {
    const threadId = isString(data.thread_id) ? data.thread_id : "";
    const workflowId = isString(data.workflow_id) ? data.workflow_id : null;
    const providerId = isString(data.provider)
      ? data.provider
      : this.deps.defaults.provider;
    const model = isString(data.model) ? data.model : this.deps.defaults.model;
    const userId = this.session.userId ?? "1";
    const jobId = randomUUID();

    log.info("Workflow message", { threadId, workflowId, jobId });

    // Assigned once the run's abort listener is registered; released in the
    // finally so a completed workflow's listener can't cancel() a runner that
    // already finished when a later Stop/disconnect fires the same signal.
    let releaseAbortListener: (() => void) | null = null;

    try {
      if (!workflowId) {
        throw new Error("workflow_id is required for workflow processing");
      }

      // Load workflow from DB
      const workflow = await Workflow.find(userId, workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      const rawGraph = workflow.graph as {
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
      };

      // Detect message input names from raw graph (reads node.data) — matches Python
      const { messageName, messagesName } =
        this.detectMessageInputNames(rawGraph);
      const graph = await this.deps.hydrateGraph(rawGraph);

      if (this.deps.beforeRunJob) {
        await this.deps.beforeRunJob(graph);
      }
      const messageInputName =
        (isString(data.workflow_message_input_name)
          ? data.workflow_message_input_name
          : null) ??
        messageName ??
        "message";
      const messagesInputName =
        (isString(data.workflow_messages_input_name)
          ? data.workflow_messages_input_name
          : null) ??
        messagesName ??
        "messages";

      // Build chat history for params — matches Python
      const [dbMessages] = await Message.paginate(threadId, { limit: 1000 });
      const chatHistorySerialized = dbMessages.map((m) => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
        thread_id: m.thread_id
      }));

      // Serialize current message
      const currentMessage = {
        role: isString(data.role) ? data.role : "user",
        content: data.content,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model
      };

      // Prepare params — matches Python's WorkflowMessageProcessor
      const params: Record<string, unknown> = {
        [messageInputName]: currentMessage,
        [messagesInputName]: [...chatHistorySerialized, currentMessage]
      };
      if (isObjectLike(data.params)) {
        Object.assign(params, data.params as Record<string, unknown>);
      }

      // If chat workflow, add legacy params — matches Python's ChatWorkflowMessageProcessor
      if (workflow.run_mode === "chat") {
        const legacyChatInput = chatHistorySerialized.map((m) => ({
          role: m.role,
          content: extractTextContent(m.content),
          created_at: m.created_at
        }));
        params["chat_input"] = legacyChatInput;
        if (messagesInputName !== "messages") {
          params["messages"] = legacyChatInput;
        }
      }

      // Create processing context
      const workspace = this.session.workspaceResolver
        ? await this.session.workspaceResolver(workflowId, userId)
        : null;
      const context = createRuntimeContext({
        jobId,
        workflowId,
        userId,
        workspace,
        assetOutputMode: this.session.mode === "text" ? "data_uri" : "temp_url"
      });

      // Expose executor/node-type resolution for sub-workflow nodes
      context.setResolveExecutor((node) => this.session.resolveExecutor(node));
      if (this.session.resolveNodeType) {
        const resolverObj = isFunctionValue(this.session.resolveNodeType)
          ? { resolveNodeType: this.session.resolveNodeType }
          : this.session.resolveNodeType;
        context.setResolveNodeType(
          (nodeType) =>
            resolverObj.resolveNodeType(nodeType) as Promise<{
              nodeType: string;
              propertyTypes?: Record<string, string>;
              outputs?: Record<string, string>;
              supportsDynamicInputs?: boolean;
              descriptorDefaults?: Record<string, unknown>;
            } | null>
        );
      }

      // Create and run workflow (A5: via the ExecutionSession facade — see
      // the identical note in `startJobInner`).
      const session = await ExecutionSession.create({
        graph: toRawGraphInput(graph),
        resolveExecutor: (node) =>
          this.session.resolveExecutor(
            node as { id: string; type: string; [key: string]: unknown }
          ),
        bridgeFactory: async () => null,
        jobLifecycleBridge: this.session.pythonBridge ?? null,
        jobId,
        workflowId,
        context,
        params,
        validateNode: this.session.validateNode
      });

      const active: ActiveJob = {
        jobId,
        workflowId,
        context,
        session,
        graph,
        finished: false,
        status: "running",
        requireTerminalResult: false,
        executionOptions: { ...DEFAULT_RUN_JOB_EXECUTION_OPTIONS },
        timings: {
          acceptedAt: performance.now(),
          queueMs: 0,
          graphLoadedMs: 0,
          graphHydratedMs: 0,
          preRunMs: 0,
          persistenceMs: 0,
          kernelStartedAt: performance.now()
        }
      };
      this.deps.jobs.registerJob(jobId, active);

      // Persist job to DB (best-effort)
      try {
        await Job.create({
          id: jobId,
          workflow_id: workflowId,
          user_id: userId,
          status: "running",
          params,
          graph
        });
      } catch (error) {
        this.session.logError("workflow job persistence failed", error);
      }

      // The run already started inside `ExecutionSession.create()` above.
      const executePromise = session.result;

      // Stream events, collect output_update results
      const result: Record<string, unknown> = {};
      await this.session.send({
        type: "job_update",
        status: "running",
        job_id: jobId,
        workflow_id: workflowId
      });

      let finalOutputs: Record<string, unknown[]> = {};
      const executionSettled = executePromise
        .then((r) => {
          active.status = r.status;
          active.error = r.error;
          finalOutputs = r.outputs ?? {};
        })
        .catch((err) => {
          active.status = "failed";
          active.error = err instanceof Error ? err.message : String(err);
        })
        .finally(() => {
          active.finished = true;
        });
      const waitForActivity = createRelayActivityWaiter(
        active.context,
        executionSettled,
        signal
      );

      const nodeTypes = new Map<string, string>();
      const graphNodes = graph.nodes ?? [];
      for (const n of graphNodes) {
        if (n.id) {
          nodeTypes.set(String(n.id), isString(n.type) ? n.type : "");
        }
      }

      // A chat Stop / superseding message bumps chatRequestSeq. Unlike the
      // other chat handlers this one owns a workflow runner, so cancel it and
      // stop streaming when our turn is no longer current — otherwise the run
      // completes and delivers an assistant message after the user stopped.
      const superseded = (): boolean =>
        requestSeq !== undefined && requestSeq !== this.chatRequestSeq;

      // Cancel the moment Stop fires rather than waiting for the streaming loop
      // below to come back around — the run may be parked inside a long node.
      const onAbort = (): void => {
        try {
          active.session.cancel();
        } catch {
          // best-effort cancel
        }
      };
      if (signal?.aborted) {
        onAbort();
      } else if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
        releaseAbortListener = () =>
          signal.removeEventListener("abort", onAbort);
      }

      while (!active.finished || active.context.hasMessages()) {
        if (superseded()) {
          try {
            active.session.cancel();
          } catch {
            // best-effort cancel
          }
          active.status = "cancelled";
          try {
            const job = await Job.get(jobId);
            if (job && job.status !== "cancelled") {
              job.markCancelled();
              await job.save();
            }
          } catch (err) {
            this.session.logError(
              "workflow chat cancellation persistence failed",
              err
            );
          }
          this.deps.jobs.dropJob(jobId);
          return;
        }
        while (active.context.hasMessages()) {
          const msg = active.context.popMessage();
          if (!msg) break;
          const outbound: Record<string, unknown> = { ...msg };
          outbound.job_id ??= jobId;
          outbound.workflow_id ??= workflowId;

          // Every message, not just node updates: a `prediction` is where
          // ledger-priced generation spend (Replicate, Gemini, OpenAI, …)
          // reports itself.
          this.deps.jobs.handleNodeProviderCost(active, outbound);

          if (
            outbound.type === "node_update" ||
            outbound.type === "output_update"
          ) {
            const nodeId = String(outbound.node_id ?? "");
            const nodeType = nodeTypes.get(nodeId) ?? "";

            // Capture output_update values for the response message
            if (outbound.type === "output_update") {
              if (nodeType.includes("Output")) {
                const nodeName = isString(outbound.node_name)
                  ? outbound.node_name
                  : nodeType;
                result[nodeName] = outbound.value;
              } else {
                continue; // Skip non-output node output_updates
              }
            }
          }

          await this.session.send(outbound);
        }
        if (!active.finished) {
          await waitForActivity();
        }
      }

      // Collect any outputs from the runner result — only Output-type nodes
      // The kernel considers all leaf nodes as "output nodes", but for the
      // response message we only want nodes whose type includes "Output"
      // (matching Python's WorkflowMessageProcessor behavior).
      for (const [nodeType, values] of Object.entries(finalOutputs)) {
        if (!nodeType.includes("Output")) continue;
        if (!result[nodeType] && Array.isArray(values) && values.length > 0) {
          result[nodeType] = values.length === 1 ? values[0] : values;
        }
      }

      // Send terminal job_update if not already sent
      await this.session.send({
        type: "job_update",
        status: active.status,
        job_id: jobId,
        workflow_id: workflowId,
        error: active.error,
        result: { outputs: finalOutputs }
      });

      // Persist final job status
      try {
        const job = (await Job.get(jobId)) as Job | null;
        // Don't overwrite a cancelled row (DB-only tRPC cancel) when the
        // in-flight run finishes — keep the cancellation authoritative.
        if (job) {
          if (job.status !== "cancelled") {
            if (active.status === "completed") job.markCompleted();
            else if (active.status === "failed")
              job.markFailed(active.error ?? "Unknown error");
            else if (active.status === "cancelled") job.markCancelled();
          }
          job.cost = this.deps.jobs.runMeasuredCost(active);
          await job.save();
        }
      } catch (error) {
        this.session.logError("workflow job persistence (final) failed", error);
      }

      // Signal completion — done chunk with job_id + workflow_id
      await this.session.send({
        type: "chunk",
        content: "",
        done: true,
        job_id: jobId,
        workflow_id: workflowId,
        thread_id: threadId
      });

      // Create response message from workflow outputs — matches Python's _create_response_message
      const responseContent = createWorkflowResponseContent(result);
      const responseMsg = {
        type: "message",
        role: "assistant",
        content: responseContent,
        thread_id: threadId,
        workflow_id: workflowId,
        provider: providerId,
        model,
        job_id: jobId
      } satisfies Record<string, unknown>;
      await this.saveMessageToDb(responseMsg);
      await this.session.send(responseMsg);

      log.debug("Workflow message complete", { threadId, workflowId, jobId });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error("Workflow message error", {
        threadId,
        workflowId,
        error: errMsg
      });

      await this.session.send({
        type: "error",
        message: `Error processing workflow: ${errMsg}`,
        job_id: jobId,
        workflow_id: workflowId,
        thread_id: threadId
      });

      // Send done chunk even on error — matches Python
      await this.session.send({
        type: "chunk",
        content: "",
        done: true,
        job_id: jobId,
        workflow_id: workflowId,
        thread_id: threadId
      });
    } finally {
      releaseAbortListener?.();
      // Always release the concurrency slot and drain the queue, even if
      // streaming/persist/sendMessage threw above. Otherwise a mid-stream
      // socket-write failure would orphan the ActiveJob and permanently shrink
      // the MAX_CONCURRENT_JOBS cap (run_job then queues forever).
      this.deps.jobs.releaseJob(jobId);
    }
  }

  /**
   * If `event` is a tool_call_update, also emit a synthetic assistant message
   * whose `tool_calls` array contains this call. The chat UI renders a
   * persistent ToolCallCard from messages with tool_calls; tool_call_update
   * by itself only drives transient "now running" state. We skip events that
   * already carry `agent_execution_id` because those are routed to
   * ExecutionTree via the agent_execution path.
   */
  private async emitSyntheticToolCallCard(
    event: Record<string, unknown>
  ): Promise<void> {
    if (event["type"] !== "tool_call_update") return;
    const toolCallId = event["tool_call_id"];
    const name = event["name"];
    if (!isString(toolCallId) || !isString(name)) return;
    if (!toolCallId || !name) return;
    const args = isObjectLike(event["args"])
      ? (event["args"] as Record<string, unknown>)
      : {};
    const message = isString(event["message"]) ? event["message"] : null;
    await this.session.send({
      type: "message",
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: toolCallId,
          name,
          args,
          message,
          result: null
        }
      ],
      parent_tool_call_id: event["parent_tool_call_id"] ?? null,
      subtask_depth: event["subtask_depth"] ?? null,
      thread_id: event["thread_id"] ?? null,
      workflow_id: event["workflow_id"] ?? null
    });
  }
}
