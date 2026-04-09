import { BaseNode, prop } from "@nodetool/node-sdk";
import type { StreamingInputs, StreamingOutputs } from "@nodetool/node-sdk";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { URL } from "url";

// Minimum wait time in seconds to prevent tight loops when drift compensation
// causes wait_time to be near zero.
const MIN_WAIT_SECONDS = 0.001;

/**
 * Async queue used by trigger nodes to receive events from external sources
 * (HTTP handlers, file watchers, etc.) and yield them in genProcess().
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

export class WaitNode extends BaseNode {
  static readonly nodeType = "nodetool.triggers.Wait";
  static readonly title = "Wait";
  static readonly description =
    "Node that suspends workflow execution until externally resumed.\n\n" +
    "    This node pauses the workflow at this point and waits for an external\n" +
    "    signal (via API call) to continue. When resumed, it outputs the input\n" +
    "    data merged with any data provided during the resume call.\n\n" +
    "    Use cases:\n" +
    "    - Human-in-the-loop workflows requiring approval\n" +
    "    - Waiting for external processes to complete\n" +
    "    - Pausing workflows for manual data entry\n" +
    "    - Synchronization points in multi-step processes\n" +
    "    - Interactive chatbot-style workflows\n\n" +
    "    The workflow is suspended (not running) while waiting, so it doesn't\n" +
    "    consume resources. State is persisted and the workflow can be resumed\n" +
    "    even after server restarts.";
  static readonly metadataOutputTypes = {
    data: "any",
    resumed_at: "str",
    waited_seconds: "float"
  };

  @prop({
    type: "int",
    default: 0,
    title: "Timeout Seconds",
    description: "Optional timeout in seconds (0 = wait indefinitely)",
    min: 0
  })
  declare timeout_seconds: any;

  @prop({
    type: "any",
    default: "",
    title: "Input",
    description: "Input data to pass through to the output when resumed"
  })
  declare input: any;

  async process(): Promise<Record<string, unknown>> {
    const timeoutSeconds = Number(this.timeout_seconds ?? 0);
    const inputData = this.input ?? "";

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
    "Trigger node that waits for manual events pushed via the API.\n\n" +
    "    This trigger enables interactive workflows where events are pushed\n" +
    "    programmatically through the workflow runner's input API. Each event\n" +
    "    pushed to the trigger is emitted and processed by the workflow.\n\n" +
    "    This trigger is useful for:\n" +
    "    - Building chatbot-style workflows\n" +
    "    - Interactive processing pipelines\n" +
    "    - Manual batch processing\n" +
    "    - Testing and debugging workflows";
  static readonly metadataOutputTypes = {
    data: "any",
    timestamp: "str",
    source: "str",
    event_type: "str"
  };

  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;

  @prop({
    type: "int",
    default: 0,
    title: "Max Events",
    description: "Maximum number of events to process (0 = unlimited)",
    min: 0
  })
  declare max_events: any;

  @prop({
    type: "str",
    default: "manual_trigger",
    title: "Name",
    description: "Name for this trigger (used in API calls)"
  })
  declare name: any;

  @prop({
    type: "float",
    default: null,
    title: "Timeout Seconds",
    description: "Timeout waiting for events (None = wait forever)",
    min: 0
  })
  declare timeout_seconds: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  /**
   * Streaming run: reads events pushed into the inbox via pushInputValue()
   * and emits them downstream. Keeps running until EOS or max_events.
   */
  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    const maxEvents = Number(this.max_events ?? 0);
    const triggerName = String(this.name ?? "manual_trigger");
    let eventsProcessed = 0;

    for await (const [handle, item] of inputs.any()) {
      if (handle === "__control__") continue;

      const data = item;
      const event = {
        data,
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
    "Trigger node that fires at regular time intervals.\n\n" +
    "    This trigger emits events at a configured interval, similar to a timer\n" +
    "    or scheduler. Each event contains:\n" +
    "    - The tick number (how many times the trigger has fired)\n" +
    "    - The current timestamp\n" +
    "    - The configured interval\n\n" +
    "    This trigger is useful for:\n" +
    "    - Periodic data collection or polling\n" +
    "    - Scheduled batch processing\n" +
    "    - Heartbeat or keepalive workflows\n" +
    "    - Time-based automation";
  static readonly metadataOutputTypes = {
    tick: "int",
    elapsed_seconds: "float",
    interval_seconds: "float",
    timestamp: "str",
    source: "str",
    event_type: "str"
  };

  static readonly isStreamingOutput = true;

  @prop({
    type: "int",
    default: 0,
    title: "Max Events",
    description: "Maximum number of events to process (0 = unlimited)",
    min: 0
  })
  declare max_events: any;

  @prop({
    type: "float",
    default: 60,
    title: "Interval Seconds",
    description: "Interval between triggers in seconds"
  })
  declare interval_seconds: any;

  @prop({
    type: "float",
    default: 0,
    title: "Initial Delay Seconds",
    description: "Delay before the first trigger fires",
    min: 0
  })
  declare initial_delay_seconds: any;

  @prop({
    type: "bool",
    default: true,
    title: "Emit On Start",
    description: "Whether to emit an event immediately on start"
  })
  declare emit_on_start: any;

  @prop({
    type: "bool",
    default: true,
    title: "Include Drift Compensation",
    description: "Compensate for execution time to maintain accurate intervals"
  })
  declare include_drift_compensation: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const intervalMs = Number(this.interval_seconds ?? 60) * 1000;
    const initialDelayMs = Number(this.initial_delay_seconds ?? 0) * 1000;
    const maxEvents = Number(this.max_events ?? 0);
    const emitOnStart = Boolean(this.emit_on_start ?? true);
    const driftCompensation = Boolean(this.include_drift_compensation ?? true);

    const startTime = Date.now();
    let tickCount = 0;

    // Initial delay
    if (initialDelayMs > 0) {
      await new Promise((r) => setTimeout(r, initialDelayMs));
    }

    // Emit on start if configured
    if (emitOnStart) {
      tickCount++;
      yield this._createEvent(tickCount, startTime);
      if (maxEvents > 0 && tickCount >= maxEvents) return;
    }

    // Main loop
    while (true) {
      if (driftCompensation) {
        // Calculate next tick time based on start time
        const nextTickMs = tickCount * intervalMs + initialDelayMs;
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

  private _createEvent(
    tick: number,
    startTime: number
  ): Record<string, unknown> {
    return {
      tick,
      elapsed_seconds: (Date.now() - startTime) / 1000,
      interval_seconds: Number(this.interval_seconds ?? 60),
      timestamp: new Date().toISOString(),
      source: "interval",
      event_type: "tick"
    };
  }
}

// ---------------------------------------------------------------------------
// WebhookTriggerNode — starts an HTTP server and yields on each request
// ---------------------------------------------------------------------------

export class WebhookTriggerNode extends BaseNode {
  static readonly nodeType = "nodetool.triggers.WebhookTrigger";
  static readonly title = "Webhook Trigger";
  static readonly description =
    "Trigger node that starts an HTTP server to receive webhook requests.\n\n" +
    "    Each incoming HTTP request is emitted as an event containing:\n" +
    "    - The request body (parsed as JSON if applicable)\n" +
    "    - Request headers\n" +
    "    - Query parameters\n" +
    "    - HTTP method\n\n" +
    "    This trigger is useful for:\n" +
    "    - Receiving notifications from external services\n" +
    "    - Building API endpoints that trigger workflows\n" +
    "    - Integration with third-party webhook providers";
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

  static readonly isStreamingOutput = true;

  @prop({
    type: "int",
    default: 0,
    title: "Max Events",
    description: "Maximum number of events to process (0 = unlimited)",
    min: 0
  })
  declare max_events: any;

  @prop({
    type: "int",
    default: 8080,
    title: "Port",
    description: "Port to listen on for webhook requests",
    min: 1,
    max: 65535
  })
  declare port: any;

  @prop({
    type: "str",
    default: "/webhook",
    title: "Path",
    description: "URL path to listen on"
  })
  declare path: any;

  @prop({
    type: "str",
    default: "127.0.0.1",
    title: "Host",
    description:
      "Host address to bind to. Use '0.0.0.0' to listen on all interfaces."
  })
  declare host: any;

  @prop({
    type: "list[str]",
    default: ["POST"],
    title: "Methods",
    description: "HTTP methods to accept"
  })
  declare methods: any;

  @prop({
    type: "str",
    default: "",
    title: "Secret",
    description:
      "Optional secret for validating requests (checks X-Webhook-Secret header)"
  })
  declare secret: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const port = Number(this.port ?? 8080);
    const webhookPath = String(this.path ?? "/webhook");
    const host = String(this.host ?? "127.0.0.1");
    const allowedMethods = (
      Array.isArray(this.methods) ? this.methods : ["POST"]
    ).map((m: string) => m.toUpperCase());
    const secret = String(this.secret ?? "");
    const maxEvents = Number(this.max_events ?? 0);

    const queue = new AsyncQueue<Record<string, unknown>>();

    // Create HTTP server
    const server = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url ?? "/", `http://${host}:${port}`);

      // Check path
      if (reqUrl.pathname !== webhookPath) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }

      // Check method
      const method = (req.method ?? "GET").toUpperCase();
      if (!allowedMethods.includes(method)) {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end(`Method ${method} not allowed`);
        return;
      }

      // Check secret
      if (secret) {
        const provided = req.headers["x-webhook-secret"] ?? "";
        if (provided !== secret) {
          res.writeHead(401, { "Content-Type": "text/plain" });
          res.end("Invalid secret");
          return;
        }
      }

      // Read body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf-8");

      let body: unknown = rawBody;
      const contentType = req.headers["content-type"] ?? "";
      if (contentType.includes("application/json")) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          // keep raw string
        }
      }

      // Build query params
      const query: Record<string, string> = {};
      reqUrl.searchParams.forEach((v, k) => {
        query[k] = v;
      });

      queue.push({
        body,
        headers: { ...req.headers },
        query,
        method,
        path: reqUrl.pathname,
        timestamp: new Date().toISOString(),
        source: req.socket.remoteAddress ?? "",
        event_type: "webhook"
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "accepted" }));
    });

    // Start server
    await new Promise<void>((resolve, reject) => {
      server.on("error", reject);
      server.listen(port, host, () => resolve());
    });

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
      // Shut down HTTP server
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  }
}

// ---------------------------------------------------------------------------
// FileWatchTriggerNode — monitors filesystem changes
// ---------------------------------------------------------------------------

export class FileWatchTriggerNode extends BaseNode {
  static readonly nodeType = "nodetool.triggers.FileWatchTrigger";
  static readonly title = "File Watch Trigger";
  static readonly description =
    "Trigger node that monitors filesystem changes.\n\n" +
    "    This trigger monitors a directory or file for changes. When a change\n" +
    "    is detected, an event is emitted containing:\n" +
    "    - The path of the changed file\n" +
    "    - The type of change (created, modified, deleted, moved)\n" +
    "    - Timestamp of the event\n\n" +
    "    This trigger is useful for:\n" +
    "    - Processing files as they arrive in a directory\n" +
    "    - Triggering workflows on configuration changes\n" +
    "    - Building file-based automation pipelines";
  static readonly metadataOutputTypes = {
    event: "str",
    path: "str",
    dest_path: "str",
    is_directory: "bool",
    timestamp: "str"
  };

  static readonly isStreamingOutput = true;

  @prop({
    type: "int",
    default: 0,
    title: "Max Events",
    description: "Maximum number of events to process (0 = unlimited)",
    min: 0
  })
  declare max_events: any;

  @prop({
    type: "str",
    default: ".",
    title: "Path",
    description: "Path to watch (file or directory)"
  })
  declare path: any;

  @prop({
    type: "bool",
    default: false,
    title: "Recursive",
    description: "Watch subdirectories recursively"
  })
  declare recursive: any;

  @prop({
    type: "list[str]",
    default: ["*"],
    title: "Patterns",
    description: "File patterns to watch (e.g., ['*.txt', '*.json'])"
  })
  declare patterns: any;

  @prop({
    type: "list[str]",
    default: [],
    title: "Ignore Patterns",
    description: "File patterns to ignore"
  })
  declare ignore_patterns: any;

  @prop({
    type: "list[str]",
    default: ["created", "modified", "deleted", "moved"],
    title: "Events",
    description: "Types of events to watch for"
  })
  declare events: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Debounce Seconds",
    description: "Debounce time to avoid duplicate events",
    min: 0
  })
  declare debounce_seconds: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const watchPath = path.resolve(String(this.path ?? "."));
    const recursive = Boolean(this.recursive ?? false);
    const patterns: string[] = Array.isArray(this.patterns)
      ? this.patterns
      : ["*"];
    const ignorePatterns: string[] = Array.isArray(this.ignore_patterns)
      ? this.ignore_patterns
      : [];
    const watchEvents: string[] = Array.isArray(this.events)
      ? this.events
      : ["created", "modified", "deleted", "moved"];
    const debounceMs = Number(this.debounce_seconds ?? 0.5) * 1000;
    const maxEvents = Number(this.max_events ?? 0);

    // Verify path exists
    if (!fs.existsSync(watchPath)) {
      throw new Error(`Watch path does not exist: ${watchPath}`);
    }

    const queue = new AsyncQueue<Record<string, unknown>>();
    const lastEvents = new Map<string, number>();

    // Simple glob matching
    const matchesPattern = (filename: string, pattern: string): boolean => {
      if (pattern === "*") return true;
      // Convert glob to regex: *.txt -> ^.*\.txt$
      const regex = new RegExp(
        "^" +
          pattern
            .replace(/\./g, "\\.")
            .replace(/\*/g, ".*")
            .replace(/\?/g, ".") +
          "$"
      );
      return regex.test(filename);
    };

    const shouldProcess = (filePath: string): boolean => {
      const filename = path.basename(filePath);

      // Check ignore patterns
      for (const p of ignorePatterns) {
        if (matchesPattern(filename, p)) return false;
      }

      // Check include patterns
      for (const p of patterns) {
        if (matchesPattern(filename, p)) return true;
      }

      return false;
    };

    const debounce = (filePath: string): boolean => {
      const now = Date.now();
      const last = lastEvents.get(filePath) ?? 0;
      if (now - last < debounceMs) return true;
      lastEvents.set(filePath, now);
      return false;
    };

    const emitEvent = (
      eventType: string,
      filePath: string,
      isDirectory: boolean
    ) => {
      if (!watchEvents.includes(eventType)) return;
      if (!shouldProcess(filePath)) return;
      if (debounce(filePath)) return;

      queue.push({
        event: eventType,
        path: filePath,
        dest_path: "",
        is_directory: isDirectory,
        timestamp: new Date().toISOString()
      });
    };

    // Use fs.watch for filesystem monitoring
    const watchers: fs.FSWatcher[] = [];

    const watchDir = (dir: string) => {
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
      } catch (_err) {
        // Some paths may not be watchable
      }
    };

    watchDir(watchPath);

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
      // Close all watchers
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
