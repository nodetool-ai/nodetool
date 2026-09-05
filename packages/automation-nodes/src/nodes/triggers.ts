import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
  StreamingInputs,
  StreamingOutputs,
  TriggerEvent
} from "@nodetool-ai/node-sdk";
import * as fs from "fs";
import * as path from "path";
import {
  FileWatchDebouncer,
  shouldEmitFileWatchEvent
} from "../lib/file-watch-match.js";
import type {
  FileWatchEvent,
  IntervalTickEvent
} from "../lib/trigger-payload.js";
import {
  parseFileWatchEvent,
  parseIntervalTick,
  parseManualEvent,
  parseWebhookEvent
} from "../lib/trigger-payload.js";

// Minimum wait time in seconds to prevent tight loops when drift compensation
// causes wait_time to be near zero.
const MIN_WAIT_SECONDS = 0.001;

/** A trigger's buffered run emits nothing — `emitTriggerEvent` and `genProcess` do. */
type NoBufferedOutputs = Record<string, never>;

/**
 * Async queue used by trigger nodes to receive events from external sources
 * (file watchers, etc.) and yield them in genProcess().
 */
class AsyncQueue<T> {
  private _buffer: T[] = [];
  private _waiters: Array<(value: T | null) => void> = [];
  private _closed = false;

  push(item: T): void {
    if (this._closed) return;
    if (this._waiters.length > 0) {
      const resolve = this._waiters.shift()!;
      resolve(item);
    } else {
      this._buffer.push(item);
    }
  }

  async get(timeoutMs?: number): Promise<T | null> {
    if (this._buffer.length > 0) {
      return this._buffer.shift()!;
    }
    if (this._closed) return null;

    return new Promise<T | null>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const waiterResolve = (value: T | null) => {
        if (timer !== undefined) clearTimeout(timer);
        resolve(value);
      };

      this._waiters.push(waiterResolve);

      if (timeoutMs !== undefined && timeoutMs > 0) {
        timer = setTimeout(() => {
          const idx = this._waiters.indexOf(waiterResolve);
          if (idx >= 0) this._waiters.splice(idx, 1);
          resolve(null);
        }, timeoutMs);
      }
    });
  }

  close(): void {
    this._closed = true;
    for (const w of this._waiters) {
      w(null);
    }
    this._waiters.length = 0;
  }
}

// ---------------------------------------------------------------------------
// WaitNode — suspends workflow until timeout
// ---------------------------------------------------------------------------

/** Output handles WaitNode.process() emits. */
type WaitOutputs = {
  data: unknown;
  resumed_at: string;
  waited_seconds: number;
};

export class WaitNode extends BaseNode {
  static readonly nodeType = "nodetool.triggers.Wait";
  static readonly title = "Wait";
  static readonly description =
    "Pause workflow execution for a fixed delay, then pass the input through unchanged.\n" +
    "    wait, delay, sleep, pause, throttle, timer, rate-limit\n\n" +
    "    Use cases:\n" +
    "    - Rate-limit or throttle between steps\n" +
    "    - Wait a fixed delay before continuing\n" +
    "    - Space out polling or retry attempts";
  static readonly inlineFields = [];
  static readonly inputFields = ["input"];
  static readonly metadataOutputTypes = {
    data: "any",
    resumed_at: "str",
    waited_seconds: "float"
  };

  @prop({
    type: "int",
    default: 0,
    title: "Timeout Seconds",
    description: "Seconds to wait before continuing (0 = no wait)",
    min: 0
  })
  declare timeout_seconds: number;

  @prop({
    type: "any",
    default: "",
    title: "Input",
    description: "Input data to pass through to the output after waiting"
  })
  declare input: unknown;

  async process(): Promise<WaitOutputs> {
    const timeoutSeconds = this.timeout_seconds;
    const inputData = this.input;

    const start = Date.now();
    if (timeoutSeconds > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.floor(timeoutSeconds * 1000))
      );
    }
    const waitedSeconds = (Date.now() - start) / 1000;

    return {
      data: inputData,
      resumed_at: new Date().toISOString(),
      waited_seconds: waitedSeconds
    };
  }
}

// ---------------------------------------------------------------------------
// ManualTriggerNode — waits for externally pushed events via the runner API
// ---------------------------------------------------------------------------

export class ManualTriggerNode extends BaseNode {
  static readonly nodeType = "nodetool.triggers.ManualTrigger";
  static readonly title = "Manual Trigger";
  static readonly description =
    "Wait for manual events pushed via the API to drive interactive workflows.\n" +
    "    trigger, manual, api, interactive, event, push, chatbot\n\n" +
    "    Use cases:\n" +
    "    - Build chatbot-style workflows\n" +
    "    - Interactive processing pipelines\n" +
    "    - Manual batch processing and testing";
  static readonly inlineFields = ["name"];
  static readonly inputFields = [];
  static readonly metadataOutputTypes = {
    data: "any",
    timestamp: "str",
    source: "str",
    event_type: "str"
  };

  static readonly isStreamingInput = true;
  static readonly isTrigger = true;

  @prop({
    type: "int",
    default: 0,
    title: "Max Events",
    description:
      "Events to process before the node stops listening (0 = unlimited). Applies only while the node listens in a running workflow; a fired trigger starts its own run and emits exactly one event.",
    min: 0
  })
  declare max_events: number;

  @prop({
    type: "str",
    default: "manual_trigger",
    title: "Name",
    description: "Name for this trigger, emitted on the source output"
  })
  declare name: string;

  @prop({
    type: "float",
    default: null,
    title: "Timeout Seconds",
    description:
      "How long to wait for the next event before stopping (empty = wait forever). Applies only while the node listens in a running workflow.",
    min: 0
  })
  declare timeout_seconds: number | null;

  async process(): Promise<NoBufferedOutputs> {
    return {};
  }

  /**
   * Wake-up entry point: a manually fired trigger input becomes one event.
   * The payload is either the adapter envelope ({data, timestamp, source})
   * or an arbitrary value, which is emitted whole as `data`.
   */
  async emitTriggerEvent(
    event: TriggerEvent,
    outputs: StreamingOutputs
  ): Promise<void> {
    const parsed = parseManualEvent(event.payload, this.name);
    await outputs.emit("data", parsed.data);
    await outputs.emit("timestamp", parsed.timestamp);
    await outputs.emit("source", parsed.source);
    await outputs.emit("event_type", parsed.event_type);
  }

  /**
   * Streaming run: reads events pushed into the inbox via pushInputValue()
   * and emits them downstream. Keeps running until EOS or max_events.
   */
  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    const maxEvents = this.max_events;
    const triggerName = this.name;
    // `timeout_seconds` defaults to null, the documented "wait forever" value.
    const timeoutSeconds = this.timeout_seconds ?? 0;
    const timeoutMs = timeoutSeconds > 0 ? timeoutSeconds * 1000 : 0;
    let eventsProcessed = 0;

    const iterator = inputs.any()[Symbol.asyncIterator]();
    // `unique symbol` so the `=== TIMEOUT` check below narrows the race result.
    const TIMEOUT: unique symbol = Symbol("timeout");
    while (true) {
      let result: IteratorResult<[string, unknown]>;
      if (timeoutMs > 0) {
        // Stop waiting if no event arrives within the configured timeout.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<typeof TIMEOUT>((resolve) => {
          timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
        });
        const next = await Promise.race([iterator.next(), timeoutPromise]);
        clearTimeout(timer);
        if (next === TIMEOUT) break;
        result = next;
      } else {
        result = await iterator.next();
      }
      if (result.done) break;

      const [handle, item] = result.value;
      if (handle === "__control__") continue;

      const event = {
        data: item,
        timestamp: new Date().toISOString(),
        source: triggerName,
        event_type: "manual"
      };

      await outputs.emit("data", event.data);
      await outputs.emit("timestamp", event.timestamp);
      await outputs.emit("source", event.source);
      await outputs.emit("event_type", event.event_type);

      eventsProcessed++;
      if (maxEvents > 0 && eventsProcessed >= maxEvents) {
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// IntervalTriggerNode — fires at regular time intervals
// ---------------------------------------------------------------------------

export class IntervalTriggerNode extends BaseNode {
  static readonly nodeType = "nodetool.triggers.IntervalTrigger";
  static readonly title = "Interval Trigger";
  static readonly description =
    "Fire events at regular time intervals, like a timer or scheduler.\n" +
    "    trigger, interval, timer, schedule, cron, periodic, heartbeat\n\n" +
    "    Use cases:\n" +
    "    - Periodic data collection or polling\n" +
    "    - Scheduled batch processing\n" +
    "    - Heartbeat or time-based automation";
  static readonly inlineFields = ["interval_seconds"];
  static readonly inputFields = [];
  static readonly metadataOutputTypes = {
    tick: "int",
    elapsed_seconds: "float",
    interval_seconds: "float",
    timestamp: "str",
    source: "str",
    event_type: "str"
  };

  static readonly isTrigger = true;

  @prop({
    type: "int",
    default: 0,
    title: "Max Events",
    description:
      "Ticks to emit before the node stops (0 = unlimited). Applies only while the node runs in the editor; the scheduler keeps firing an activated trigger regardless.",
    min: 0
  })
  declare max_events: number;

  @prop({
    type: "float",
    default: 60,
    title: "Interval Seconds",
    description: "Interval between triggers in seconds"
  })
  declare interval_seconds: number;

  @prop({
    type: "float",
    default: 0,
    title: "Initial Delay Seconds",
    description: "Delay before the first trigger fires",
    min: 0
  })
  declare initial_delay_seconds: number;

  @prop({
    type: "bool",
    default: true,
    title: "Emit On Start",
    description: "Whether to emit an event immediately on start"
  })
  declare emit_on_start: boolean;

  @prop({
    type: "bool",
    default: true,
    title: "Include Drift Compensation",
    description: "Compensate for execution time to maintain accurate intervals"
  })
  declare include_drift_compensation: boolean;

  async process(): Promise<NoBufferedOutputs> {
    return {};
  }

  /**
   * Wake-up entry point: the scheduler adapter synthesizes a tick payload
   * ({tick, elapsed_seconds, interval_seconds, timestamp}); missing fields
   * are synthesized here so a bare fire still yields a complete event.
   */
  async emitTriggerEvent(
    event: TriggerEvent,
    outputs: StreamingOutputs
  ): Promise<void> {
    const parsed = parseIntervalTick(event.payload, this.interval_seconds);
    await outputs.emit("tick", parsed.tick);
    await outputs.emit("elapsed_seconds", parsed.elapsed_seconds);
    await outputs.emit("interval_seconds", parsed.interval_seconds);
    await outputs.emit("timestamp", parsed.timestamp);
    await outputs.emit("source", parsed.source);
    await outputs.emit("event_type", parsed.event_type);
  }

  async *genProcess(): AsyncGenerator<IntervalTickEvent> {
    const intervalMs = Math.max(
      MIN_WAIT_SECONDS * 1000,
      this.interval_seconds * 1000
    );
    const initialDelayMs = this.initial_delay_seconds * 1000;
    const maxEvents = this.max_events;
    const emitOnStart = this.emit_on_start;
    const driftCompensation = this.include_drift_compensation;

    const startTime = Date.now();
    let tickCount = 0;

    if (initialDelayMs > 0) {
      await new Promise((r) => setTimeout(r, initialDelayMs));
    }

    if (emitOnStart) {
      tickCount++;
      yield this._createEvent(tickCount, startTime);
      if (maxEvents > 0 && tickCount >= maxEvents) return;
    }

    // Main loop. When `emit_on_start` fired, the on-start emission already
    // consumed the first slot (tickCount === 1) so `tickCount` whole intervals
    // should have elapsed by the next scheduled tick. When it did not, the next
    // tick is the very first one and must still land a full interval after the
    // initial delay — hence the +1 offset. Without it, drift compensation makes
    // the first tick fire immediately, defeating `emit_on_start = false`.
    const driftOffset = emitOnStart ? 0 : 1;
    while (true) {
      if (driftCompensation) {
        const intervalsElapsed = tickCount + driftOffset;
        const nextTickMs = intervalsElapsed * intervalMs + initialDelayMs;
        const elapsed = Date.now() - startTime;
        const waitMs = Math.max(MIN_WAIT_SECONDS * 1000, nextTickMs - elapsed);
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        await new Promise((r) => setTimeout(r, intervalMs));
      }

      tickCount++;
      yield this._createEvent(tickCount, startTime);

      if (maxEvents > 0 && tickCount >= maxEvents) return;
    }
  }

  private _createEvent(tick: number, startTime: number): IntervalTickEvent {
    return {
      tick,
      elapsed_seconds: (Date.now() - startTime) / 1000,
      interval_seconds: this.interval_seconds,
      timestamp: new Date().toISOString(),
      source: "interval",
      event_type: "tick"
    };
  }
}

// ---------------------------------------------------------------------------
// WebhookTriggerNode — emits the event delivered by the server webhook route
// ---------------------------------------------------------------------------

export class WebhookTriggerNode extends BaseNode {
  static readonly nodeType = "nodetool.triggers.WebhookTrigger";
  static readonly title = "Webhook Trigger";
  static readonly description =
    "Run the workflow whenever an HTTP request arrives at its webhook URL.\n" +
    "    trigger, webhook, http, api, request, integration\n\n" +
    "    Use cases:\n" +
    "    - Receive notifications from external services\n" +
    "    - Build API endpoints that trigger workflows\n" +
    "    - Integrate with third-party webhook providers\n\n" +
    "    The node has nothing to configure: activating the workflow creates the\n" +
    "    registration that owns the delivery URL and the shared secret. Both are\n" +
    "    shown in the workflow's trigger panel; send the secret in the\n" +
    "    x-webhook-secret header.";
  static readonly inlineFields = [];
  static readonly inputFields = [];
  static readonly metadataOutputTypes = {
    body: "any",
    headers: "dict[str, any]",
    query: "dict[str, any]",
    method: "str",
    path: "str",
    timestamp: "str",
    source: "str",
    event_type: "str"
  };

  static readonly isTrigger = true;

  async process(): Promise<NoBufferedOutputs> {
    return {};
  }

  /**
   * Wake-up entry point: the server webhook route captures
   * {body, headers, query, method} (plus path/timestamp when available)
   * into the trigger input; a non-envelope payload is treated as the body.
   */
  async emitTriggerEvent(
    event: TriggerEvent,
    outputs: StreamingOutputs
  ): Promise<void> {
    const parsed = parseWebhookEvent(event.payload);
    await outputs.emit("body", parsed.body);
    await outputs.emit("headers", parsed.headers);
    await outputs.emit("query", parsed.query);
    await outputs.emit("method", parsed.method);
    await outputs.emit("path", parsed.path);
    await outputs.emit("timestamp", parsed.timestamp);
    await outputs.emit("source", parsed.source);
    await outputs.emit("event_type", parsed.event_type);
  }
}

// ---------------------------------------------------------------------------
// FileWatchTriggerNode — monitors filesystem changes
// ---------------------------------------------------------------------------

export class FileWatchTriggerNode extends BaseNode {
  static readonly nodeType = "nodetool.triggers.FileWatchTrigger";
  static readonly title = "File Watch Trigger";
  static readonly description =
    "Monitor a directory or file and emit an event whenever a change is detected.\n" +
    "    trigger, file, watch, filesystem, monitor, change, automation\n\n" +
    "    Use cases:\n" +
    "    - Process files as they arrive in a directory\n" +
    "    - Trigger workflows on configuration changes\n" +
    "    - Build file-based automation pipelines";
  static readonly inlineFields = ["path"];
  static readonly inputFields = [];
  static readonly metadataOutputTypes = {
    event: "str",
    path: "str",
    dest_path: "str",
    is_directory: "bool",
    timestamp: "str"
  };

  static readonly isTrigger = true;

  @prop({
    type: "int",
    default: 0,
    title: "Max Events",
    description:
      "File events to emit before the node stops (0 = unlimited). Applies only while the node runs in the editor; the file-watch adapter keeps firing an activated trigger regardless.",
    min: 0
  })
  declare max_events: number;

  @prop({
    type: "str",
    default: ".",
    title: "Path",
    description: "Path to watch (file or directory)"
  })
  declare path: string;

  @prop({
    type: "bool",
    default: false,
    title: "Recursive",
    description: "Watch subdirectories recursively"
  })
  declare recursive: boolean;

  @prop({
    type: "list[str]",
    default: ["*"],
    title: "Patterns",
    description: "File patterns to watch (e.g., ['*.txt', '*.json'])"
  })
  declare patterns: string[];

  @prop({
    type: "list[str]",
    default: [],
    title: "Ignore Patterns",
    description: "File patterns to ignore"
  })
  declare ignore_patterns: string[];

  @prop({
    type: "list[str]",
    default: ["created", "modified", "deleted", "moved"],
    title: "Events",
    description: "Types of events to watch for"
  })
  declare events: string[];

  @prop({
    type: "float",
    default: 0.5,
    title: "Debounce Seconds",
    description: "Debounce time to avoid duplicate events",
    min: 0
  })
  declare debounce_seconds: number;

  async process(): Promise<NoBufferedOutputs> {
    return {};
  }

  /**
   * Wake-up entry point: the file-watch adapter (or the launch-time
   * snapshot diff) delivers {event, path, dest_path, is_directory}.
   */
  async emitTriggerEvent(
    event: TriggerEvent,
    outputs: StreamingOutputs
  ): Promise<void> {
    const parsed = parseFileWatchEvent(event.payload);
    await outputs.emit("event", parsed.event);
    await outputs.emit("path", parsed.path);
    await outputs.emit("dest_path", parsed.dest_path);
    await outputs.emit("is_directory", parsed.is_directory);
    await outputs.emit("timestamp", parsed.timestamp);
  }

  async *genProcess(): AsyncGenerator<FileWatchEvent> {
    const watchPath = path.resolve(this.path);
    const recursive = this.recursive;
    const patterns = this.patterns;
    const ignorePatterns = this.ignore_patterns;
    const watchEvents = this.events;
    const debounceMs = this.debounce_seconds * 1000;
    const maxEvents = this.max_events;

    if (!fs.existsSync(watchPath)) {
      throw new Error(`Watch path does not exist: ${watchPath}`);
    }

    const queue = new AsyncQueue<FileWatchEvent>();
    const debouncer = new FileWatchDebouncer(debounceMs);
    const filter = {
      patterns,
      ignorePatterns,
      events: watchEvents
    };

    const emitEvent = (
      eventType: string,
      filePath: string,
      isDirectory: boolean
    ) => {
      if (!shouldEmitFileWatchEvent(eventType, filePath, filter, debouncer)) {
        return;
      }

      queue.push({
        event: eventType,
        path: filePath,
        dest_path: "",
        is_directory: isDirectory,
        timestamp: new Date().toISOString()
      });
    };

    const watchers: fs.FSWatcher[] = [];

    // Returns the failure rather than throwing it, so a path that watches
    // nowhere (e.g. recursive watch unsupported on this platform) is reported
    // below instead of leaving the generator blocked on queue.get() forever.
    const watchDir = (dir: string): Error | null => {
      try {
        const watcher = fs.watch(
          dir,
          { recursive, persistent: true },
          (eventType, filename) => {
            if (!filename) return;
            const fullPath = path.join(dir, filename);
            const isDir =
              fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();

            // fs.watch emits 'rename' for create/delete and 'change' for modify
            if (eventType === "rename") {
              if (fs.existsSync(fullPath)) {
                emitEvent("created", fullPath, isDir);
              } else {
                emitEvent("deleted", fullPath, false);
              }
            } else if (eventType === "change") {
              emitEvent("modified", fullPath, isDir);
            }
          }
        );
        watchers.push(watcher);
        return null;
      } catch (err) {
        return err instanceof Error ? err : null;
      }
    };

    const watchError = watchDir(watchPath);

    if (watchers.length === 0) {
      throw new Error(
        `Failed to watch path: ${watchPath}` +
          (watchError === null ? "" : ` (${watchError.message})`)
      );
    }

    let eventsProcessed = 0;
    try {
      while (true) {
        const event = await queue.get();
        if (event === null) break;

        yield event;

        eventsProcessed++;
        if (maxEvents > 0 && eventsProcessed >= maxEvents) break;
      }
    } finally {
      for (const w of watchers) {
        w.close();
      }
    }
  }
}

export const TRIGGER_NODES = [
  WaitNode,
  ManualTriggerNode,
  IntervalTriggerNode,
  WebhookTriggerNode,
  FileWatchTriggerNode
] as const;
