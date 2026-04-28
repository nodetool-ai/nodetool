/**
 * High-level wrapper around a single live realtime session held inside a
 * Python worker (see PLAN-REALTIME.md item 6c-ts).
 *
 * The wrapper keeps PythonStdioBridge usage idiomatic for the WebSocket /
 * WebRTC layer:
 *
 *   - `start()` opens the session and begins the warm-state lifecycle on the
 *     Python side (BaseNode.on_session_start → spawned gen_process loop).
 *   - `pushFrame()` enqueues a media payload onto the Python NodeInbox using
 *     the drop-oldest backpressure semantics agreed in the plan.
 *   - `updateParameter()` mutates a node field in-place (cheap; no graph
 *     re-instantiation).
 *   - `stop()` is idempotent and asks the worker to call
 *     BaseNode.on_session_stop and tear down the runner task.
 *   - `on("frame", handler)` surfaces server-pushed `realtime_output_frame`
 *     events filtered to this session.
 *
 * The class deliberately does not own the PythonStdioBridge — multiple
 * sessions can share a single worker process. `dispose()` removes the
 * session-scoped event listener; the bridge stays alive.
 */

import { EventEmitter } from "node:events";

import type { PythonStdioBridge } from "./python-stdio-bridge.js";
import type {
  RealtimeSessionInfoPayload,
  RealtimeStartSessionResult,
  RealtimePushInputFrameResult,
  RealtimeUpdateParameterResult,
  RealtimeStopSessionResult,
  RealtimeOutputFrameEvent,
  RealtimeSessionErrorEvent
} from "./python-bridge-types.js";

export interface PythonRealtimeSessionOptions {
  /** Snapshot of the session as known to the WebSocket / WebRTC layer. */
  session: RealtimeSessionInfoPayload;
  /** Fully-qualified Python node type, e.g. "nodetool.realtime.Identity". */
  nodeType: string;
  /** Initial pydantic field values for the node. */
  fields?: Record<string, unknown>;
  /** Secrets resolved by ProcessingContext (kept opaque to the bridge). */
  secrets?: Record<string, string>;
  /**
   * Per-handle ring-buffer size on the Python NodeInbox. When omitted, the
   * worker falls back to `DEFAULT_INPUT_BUFFER_SIZE` in
   * `nodetool/worker/realtime_session.py` (currently 2 frames — matches the
   * TS-side `LATEST_FRAME_WINS_CAPACITY` so drop-oldest behaviour is
   * symmetric across the bridge boundary).
   */
  inputBufferSize?: number;
}

export type PythonRealtimeSessionEvents = {
  /** Emitted for every output frame produced by the underlying node. */
  frame: [RealtimeOutputFrameEvent];
  sessionError: [RealtimeSessionErrorEvent];
};

type SessionState = "idle" | "starting" | "running" | "stopping" | "stopped";

export class PythonRealtimeSession extends EventEmitter {
  private readonly _bridge: PythonStdioBridge;
  private readonly _session: RealtimeSessionInfoPayload;
  private readonly _nodeType: string;
  private readonly _fields: Record<string, unknown>;
  private readonly _secrets: Record<string, string>;
  private readonly _inputBufferSize: number | undefined;

  private readonly _onFrame: (event: RealtimeOutputFrameEvent) => void;
  private readonly _onSessionError: (event: RealtimeSessionErrorEvent) => void;
  private _state: SessionState = "idle";

  constructor(bridge: PythonStdioBridge, options: PythonRealtimeSessionOptions) {
    super();
    this._bridge = bridge;
    this._session = options.session;
    this._nodeType = options.nodeType;
    this._fields = options.fields ?? {};
    this._secrets = options.secrets ?? {};
    this._inputBufferSize = options.inputBufferSize;

    // Filter the bridge-wide frame fan-out down to this session.
    this._onFrame = (event: RealtimeOutputFrameEvent) => {
      if (event && event.session_id === this._session.session_id) {
        this.emit("frame", event);
      }
    };
    this._onSessionError = (event: RealtimeSessionErrorEvent) => {
      if (event && event.session_id === this._session.session_id) {
        this.emit("sessionError", event);
      }
    };
    this._bridge.on("realtimeOutputFrame", this._onFrame);
    this._bridge.on("realtimeSessionError", this._onSessionError);
  }

  get sessionId(): string {
    return this._session.session_id;
  }

  get state(): SessionState {
    return this._state;
  }

  async start(): Promise<RealtimeStartSessionResult> {
    if (this._state !== "idle") {
      throw new Error(
        `PythonRealtimeSession.start: invalid state ${this._state} (expected "idle")`
      );
    }
    this._state = "starting";
    try {
      const result = await this._bridge.startRealtimeSession({
        session_id: this._session.session_id,
        session: this._session,
        node_type: this._nodeType,
        fields: this._fields,
        secrets: this._secrets,
        ...(this._inputBufferSize !== undefined
          ? { input_buffer_size: this._inputBufferSize }
          : {})
      });
      this._state = "running";
      return result;
    } catch (err) {
      // Worker rejected the session before it became live; release the
      // listener so a caller can construct a fresh session if desired.
      this._state = "stopped";
      this.removeBridgeListeners();
      throw err;
    }
  }

  async pushFrame(
    handle: string,
    payload: unknown,
    metadata?: Record<string, unknown>
  ): Promise<RealtimePushInputFrameResult> {
    if (this._state !== "running") {
      throw new Error(
        `PythonRealtimeSession.pushFrame: session is ${this._state}, not running`
      );
    }
    return this._bridge.pushRealtimeInputFrame({
      session_id: this._session.session_id,
      handle,
      payload,
      ...(metadata !== undefined ? { metadata } : {})
    });
  }

  async updateParameter(
    name: string,
    value: unknown
  ): Promise<RealtimeUpdateParameterResult> {
    if (this._state !== "running") {
      throw new Error(
        `PythonRealtimeSession.updateParameter: session is ${this._state}, not running`
      );
    }
    return this._bridge.updateRealtimeParameter({
      session_id: this._session.session_id,
      name,
      value
    });
  }

  /**
   * Idempotent — calling `stop()` on an already-stopped session is a no-op
   * and resolves with a synthesised "ok" result rather than re-issuing the
   * verb to Python.
   */
  async stop(timeout?: number): Promise<RealtimeStopSessionResult> {
    if (this._state === "stopped" || this._state === "idle") {
      return {
        session_id: this._session.session_id,
        ok: true,
        error: null
      };
    }
    this._state = "stopping";
    try {
      const result = await this._bridge.stopRealtimeSession({
        session_id: this._session.session_id,
        ...(timeout !== undefined ? { timeout } : {})
      });
      return result;
    } finally {
      this._state = "stopped";
      this.removeBridgeListeners();
    }
  }

  /**
   * Detach the bridge listener without sending a verb to Python. Use this
   * for cleanup paths where the worker is already gone (process crash) and
   * a `stop_session` round-trip would just hang.
   */
  dispose(): void {
    this._state = "stopped";
    this.removeBridgeListeners();
  }

  private removeBridgeListeners(): void {
    this._bridge.off("realtimeOutputFrame", this._onFrame);
    this._bridge.off("realtimeSessionError", this._onSessionError);
  }
}

// Augment the EventEmitter typings so consumers get accurate `on/emit` shapes
// for the typed events emitted by this class.
export interface PythonRealtimeSession {
  on<K extends keyof PythonRealtimeSessionEvents>(
    event: K,
    listener: (...args: PythonRealtimeSessionEvents[K]) => void
  ): this;
  off<K extends keyof PythonRealtimeSessionEvents>(
    event: K,
    listener: (...args: PythonRealtimeSessionEvents[K]) => void
  ): this;
  emit<K extends keyof PythonRealtimeSessionEvents>(
    event: K,
    ...args: PythonRealtimeSessionEvents[K]
  ): boolean;
}
