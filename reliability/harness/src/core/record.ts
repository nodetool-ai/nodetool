/**
 * `RunRecord`: the universal currency of the reliability harness (§12).
 *
 * Every driver — kernel, ws-server, cli, browser, app-headless, packaged,
 * electron — produces the same shape: every frame, both directions,
 * timestamped, surface-tagged. It is a superset of two existing shapes:
 *
 * - the debug harness's bundle (`packages/cli/src/debug/`: `report.json` +
 *   `server/messages.jsonl`) — one direction (server → client), no per-frame
 *   timestamps, one `ProcessingMessage` per JSONL line;
 * - the e2e_runner's `record.json` (`web/src/e2e_runner/types.ts`'s
 *   `RunRecord`) — one direction, a flat `events: WsEvent[]` array plus
 *   distilled `outputs`/`logs`/`nodeIO`.
 *
 * Invariants and diffs (§6, `diff.ts`) are pure functions over this shape,
 * so they run identically whether the record came from a live driver run or
 * from a user's field debug bundle.
 */
import type { ProcessingMessage } from "@nodetool-ai/protocol";

/** Which side of the wire a frame crossed. Debug bundles and today's
 * e2e_runner records only ever carry `server_to_client`; a real ws-server
 * driver also records `client_to_server` control frames (run/cancel/
 * stream_input), which is what makes the record a strict superset. */
export type FrameDirection = "server_to_client" | "client_to_server";

/** A single frame in a run's stream, normalized to one shared shape. */
export interface RunFrame {
  /** 0-based arrival order within this record — the tiebreaker when two
   * frames share a timestamp, and the only ordering source for records
   * whose origin (e.g. a JSONL bundle) never carried per-frame timestamps. */
  seq: number;
  /** Capture time, epoch ms. Synthetic (derived from `seq`) when the source
   * record didn't preserve a real one — see `tsSource`. */
  ts: number;
  /** Whether `ts` is a real capture time or a synthetic ordering stand-in. */
  tsSource: "captured" | "synthetic";
  direction: FrameDirection;
  /** Driver/converter that produced this frame (e.g. "kernel", "ws-server", "debug-bundle"). */
  surface: string;
  /** Per-node-channel diff key: `node:<id>` when the message names a node,
   * `job` for job-level frames, `control` otherwise (§4's "per-node-channel,
   * not globally" comparison). */
  channel: string;
  /** The raw frame payload. A `ProcessingMessage` for server→client frames;
   * an untyped record for client→server control frames (run/cancel/…). */
  message: ProcessingMessage | Record<string, unknown>;
  /**
   * Set when a driver recognizes this frame as its own surface's *documented*
   * redundancy — a repeat of information an earlier frame already carried,
   * emitted for client convenience (the ws-server's eager "running" ack and
   * its authoritative terminal snapshot; see `drivers/ws-server.ts`). The
   * value is the reason tag.
   *
   * The frame is still recorded: dropping repeats outright, as this driver
   * used to, makes "exactly one terminal job_update" unfalsifiable on the one
   * surface that has a wire. Cross-surface normalization skips tagged frames
   * (they have no kernel counterpart), and the invariants that assert
   * uniqueness discount them — so an *undocumented* duplicate, which is never
   * tagged, still fails both.
   */
  redundant?: string;
}

/**
 * Point-in-time snapshot of the leak-accounting counters §6's "Cleanup and
 * leaks" section names: zero live actors, zero pending control responses,
 * zero timers beyond the trigger timeout, zero pending Python-bridge
 * requests, and WS slot accounting (`activeJobs`/`startingJobs`) back to
 * empty. `at` distinguishes a baseline snapshot (taken before the run, so a
 * driver can express "returned to its starting count" rather than
 * "reached exactly zero" for a long-lived process) from the post-run one
 * `leaks.ts` actually asserts against.
 */
export interface ResourceCounterSnapshot {
  at: "before" | "after";
  liveActors: number;
  pendingControlResponses: number;
  pendingTimers: number;
  pythonBridgePendingRequests: number;
  activeJobs: number;
  startingJobs: number;
}

/**
 * One recorded client `WebSocketManager` state transition (§6 "State
 * transitions", `WebSocketManager.ts:95`'s `STATE_TRANSITIONS`). `action` and
 * `from`/`to` mirror that table's shape so `state-machine.ts` can replay the
 * sequence against the declared machine.
 */
export interface RecordedTransition {
  /** Ordering key — a frame `seq` this transition is anchored to, or a plain
   * incrementing index when the driver has no frame to anchor on. */
  at: number;
  action: string;
  from: string;
  to: string;
}

export interface RunRecord {
  /** Journey this record was captured for, when known. */
  journeyId?: string;
  /** The driver/surface that produced this record. */
  surface: string;
  jobId: string | null;
  workflowId: string | null;
  /** Epoch ms; null when the source never recorded a start. */
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  /** Terminal status ("completed" | "failed" | "cancelled" | …), or "unknown". */
  status: string;
  error: string | null;
  params: Record<string, unknown>;
  frames: RunFrame[];
  /**
   * Leak-accounting snapshots (§6), additive over C1's shape. Absent when the
   * driver that produced this record doesn't instrument these counters (e.g.
   * a debug-bundle conversion) — `leaks.ts` reports no violations rather than
   * treating absence itself as a leak.
   */
  resourceCounters?: ResourceCounterSnapshot[];
  /**
   * Client `WebSocketManager` transitions observed during this run (§6),
   * additive over C1's shape. Absent when the driver never touches a real
   * client connection (e.g. the kernel driver) — `state-machine.ts` reports
   * no violations rather than treating absence itself as a violation.
   */
  transitions?: RecordedTransition[];
}

function messageNodeId(message: Record<string, unknown>): string | null {
  const nodeId = message["node_id"];
  return typeof nodeId === "string" && nodeId.length > 0 ? nodeId : null;
}

/** Per-node-channel diff key for a message (§4, §12). */
export function channelForMessage(
  message: ProcessingMessage | Record<string, unknown>
): string {
  const record = message as Record<string, unknown>;
  const nodeId = messageNodeId(record);
  if (nodeId) return `node:${nodeId}`;
  if (record["type"] === "job_update") return "job";
  return "control";
}

/** Builds one `RunFrame`, filling in `channel` and a synthetic `ts` when none is given. */
export function makeFrame(
  seq: number,
  surface: string,
  direction: FrameDirection,
  message: ProcessingMessage | Record<string, unknown>,
  ts?: number
): RunFrame {
  return {
    seq,
    ts: ts ?? seq,
    tsSource: ts === undefined ? "synthetic" : "captured",
    direction,
    surface,
    channel: channelForMessage(message),
    message
  };
}

/** Minimal shape the debug harness's `report.json` needs to expose for conversion. */
interface DebugBundleReportLike {
  target?: { workflowId?: string | null } | null;
  server?: {
    status?: string;
    error?: string | null;
    durationMs?: number | null;
  } | null;
}

/**
 * Converts a decoded debug-bundle `report.json` + its `server/messages.jsonl`
 * lines into a `RunRecord`. Pure — the IO (reading the bundle directory off
 * disk) lives in {@link loadRunRecordFromDebugBundle}, so this half is
 * unit-testable without touching the filesystem.
 */
export function runRecordFromDebugBundle(
  report: DebugBundleReportLike,
  messages: Array<ProcessingMessage | Record<string, unknown>>,
  options: { journeyId?: string; startedAt?: number } = {}
): RunRecord {
  const startedAt = options.startedAt ?? 0;
  const frames = messages.map((message, index) =>
    makeFrame(index, "debug-bundle", "server_to_client", message, startedAt + index)
  );

  const jobUpdates = frames.filter((f) => f.channel === "job");
  const firstJob = jobUpdates[0]?.message as Record<string, unknown> | undefined;
  const lastJob = jobUpdates[jobUpdates.length - 1]?.message as
    | Record<string, unknown>
    | undefined;

  return {
    journeyId: options.journeyId,
    surface: "debug-bundle",
    jobId:
      (firstJob?.["job_id"] as string | undefined) ??
      (lastJob?.["job_id"] as string | undefined) ??
      null,
    workflowId: report.target?.workflowId ?? null,
    startedAt: frames.length > 0 ? startedAt : null,
    finishedAt:
      frames.length > 0 ? startedAt + (frames.length - 1) : null,
    durationMs: report.server?.durationMs ?? null,
    status: report.server?.status ?? "unknown",
    error: report.server?.error ?? null,
    params: {},
    frames
  };
}

/**
 * Reads a debug bundle directory (`report.json` + `server/messages.jsonl`)
 * off disk and converts it into a `RunRecord`. This is the "debug bundle
 * round-trips into a RunRecord" half of C1's done-when.
 */
export async function loadRunRecordFromDebugBundle(
  bundleDir: string,
  options: { journeyId?: string } = {}
): Promise<RunRecord> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const reportRaw = await readFile(join(bundleDir, "report.json"), "utf8");
  const report = JSON.parse(reportRaw) as DebugBundleReportLike;

  const messagesFile = join(bundleDir, "server", "messages.jsonl");
  const messagesRaw = await readFile(messagesFile, "utf8");
  const messages = messagesRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ProcessingMessage);

  return runRecordFromDebugBundle(report, messages, options);
}
