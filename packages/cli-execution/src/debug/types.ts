/**
 * Shared types for the workflow debug harness.
 *
 * The harness runs a workflow end-to-end on two surfaces — the headless server
 * (kernel `WorkflowRunner`) and a real browser (the `e2e_runner` page driven by
 * Playwright) — and folds everything worth inspecting into a single
 * `DebugReport`: the workflow graph JSON, every processing message (logs, node
 * IO, outputs, edges, LLM calls), an OpenTelemetry span summary, browser console
 * errors and a screenshot. The report is written to a bundle directory and also
 * returned so an agent can iterate without re-parsing files.
 */

// The target, execution-summary, and server-run vocabulary is shared with
// every other host that reports on a run — see `@nodetool-ai/execution`.
import type {
  DebugGraph,
  DebugTargetInfo,
  DebugVerdict,
  ExecutionSummary,
  ServerRunReport
} from "@nodetool-ai/execution/debug";
import type { SupervisorRunConfig } from "../supervisor.js";

export type {
  DebugError,
  DebugGraph,
  DebugTargetInfo,
  DebugVerdict,
  EdgeDebug,
  ExecutionSummary,
  LlmCallDebug,
  LogEntry,
  NodeDebug,
  NodeOutput,
  RunVerdict,
  ServerRunReport,
  TraceSummary
} from "@nodetool-ai/execution/debug";

/** A canvas screenshot captured at one stage of the browser run. */
interface BrowserStageShot {
  /** 0-based capture order. */
  index: number;
  /** Run status at capture time (running until the final frame). */
  status: string;
  /** Bundle-relative path to the screenshot. */
  file: string;
}

export interface BrowserRunReport {
  surface: "browser";
  ok: boolean;
  status: string;
  error: string | null;
  durationMs: number | null;
  summary: ExecutionSummary;
  consoleErrors: string[];
  /** Bundle-relative path to the final settled screenshot. */
  screenshotFile?: string;
  /** Canvas screenshots captured at successive stages of the run. */
  stages?: BrowserStageShot[];
  /** Bundle-relative path to the raw browser RunRecord JSON. */
  recordFile?: string;
  /** Set when the browser surface could not run (missing deps / browser). */
  unavailableReason?: string;
}

export interface DebugReport {
  generatedAt: string;
  target: DebugTargetInfo;
  /** The workflow graph JSON (runner shape). */
  workflow: DebugGraph;
  server: ServerRunReport | null;
  browser: BrowserRunReport | null;
  verdict: DebugVerdict;
  /** Absolute path to the on-disk bundle, when one was written. */
  bundleDir: string | null;
}

/** Options that drive a debug run. */
export interface DebugOptions {
  /** Run the headless server surface. Default true. */
  server?: boolean;
  /** Run the real-browser surface (Playwright). Expensive; default false. */
  browser?: boolean;
  /**
   * Capture an OpenTelemetry trace of the server run (timing/tokens/cost).
   * Expensive — loads the OTel SDK and adds per-span overhead. Default false.
   */
  trace?: boolean;
  /**
   * On the browser surface, capture a canvas screenshot at every stage of the
   * run instead of only the final frame. Expensive; implies `browser`. Default
   * false.
   */
  stages?: boolean;
  /** Input params keyed by input-node name. */
  params?: Record<string, unknown>;
  /** Bundle output directory. When omitted a timestamped dir is generated. */
  outDir?: string;
  /** Per-surface run timeout, ms. */
  timeoutMs?: number;
  /**
   * Supervise the server surface (`--supervise` and its bounds). The browser
   * surface runs the workflow through the web runtime, which has no supervisor
   * of its own until the editor toggle ships, so it is unaffected.
   */
  supervisor?: SupervisorRunConfig;
}
