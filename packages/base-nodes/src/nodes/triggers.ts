import { BaseNode, prop } from "@nodetool/node-sdk";

export class WaitNode extends BaseNode {
  static readonly nodeType = "nodetool.triggers.Wait";
        static readonly title = "Wait";
        static readonly description = "Node that suspends workflow execution until externally resumed.\n\n    This node pauses the workflow at this point and waits for an external\n    signal (via API call) to continue. When resumed, it outputs the input\n    data merged with any data provided during the resume call.\n\n    Use cases:\n    - Human-in-the-loop workflows requiring approval\n    - Waiting for external processes to complete\n    - Pausing workflows for manual data entry\n    - Synchronization points in multi-step processes\n    - Interactive chatbot-style workflows\n\n    The workflow is suspended (not running) while waiting, so it doesn't\n    consume resources. State is persisted and the workflow can be resumed\n    even after server restarts.";
      static readonly metadataOutputTypes = {
    data: "any",
    resumed_at: "str",
    waited_seconds: "float"
  };
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Optional timeout in seconds (0 = wait indefinitely)", min: 0 })
  declare timeout_seconds: any;

  @prop({ type: "any", default: "", title: "Input", description: "Input data to pass through to the output when resumed" })
  declare input: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const timeoutSeconds = Number(
      inputs.timeout_seconds ?? this.timeout_seconds ?? 0
    );
    const inputData = inputs.input ?? this.input ?? "";

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
      waited_seconds: waitedSeconds,
    };
  }
}

export class ManualTriggerNode extends BaseNode {
  static readonly nodeType = "nodetool.triggers.ManualTrigger";
            static readonly title = "Manual Trigger";
            static readonly description = "Trigger node that waits for manual events pushed via the API.\n\n    This trigger enables interactive workflows where events are pushed\n    programmatically through the workflow runner's input API. Each event\n    pushed to the trigger is emitted and processed by the workflow.\n\n    This trigger is useful for:\n    - Building chatbot-style workflows\n    - Interactive processing pipelines\n    - Manual batch processing\n    - Testing and debugging workflows";
        static readonly metadataOutputTypes = {
    data: "any",
    timestamp: "str",
    source: "str",
    event_type: "str"
  };
  
          static readonly isStreamingOutput = true;
  @prop({ type: "int", default: 0, title: "Max Events", description: "Maximum number of events to process (0 = unlimited)", min: 0 })
  declare max_events: any;

  @prop({ type: "str", default: "manual_trigger", title: "Name", description: "Name for this trigger (used in API calls)" })
  declare name: any;

  @prop({ type: "float", default: null, title: "Timeout Seconds", description: "Timeout waiting for events (None = wait forever)", min: 0 })
  declare timeout_seconds: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const payload = inputs.payload ?? this.payload ?? {};
    return { output: payload, payload };
  }
}

export class IntervalTriggerNode extends BaseNode {
  static readonly nodeType = "nodetool.triggers.IntervalTrigger";
            static readonly title = "Interval Trigger";
            static readonly description = "Trigger node that fires at regular time intervals.\n\n    This trigger emits events at a configured interval, similar to a timer\n    or scheduler. Each event contains:\n    - The tick number (how many times the trigger has fired)\n    - The current timestamp\n    - The configured interval\n\n    This trigger is useful for:\n    - Periodic data collection or polling\n    - Scheduled batch processing\n    - Heartbeat or keepalive workflows\n    - Time-based automation";
        static readonly metadataOutputTypes = {
    tick: "int",
    elapsed_seconds: "float",
    interval_seconds: "float",
    timestamp: "str",
    source: "str",
    event_type: "str"
  };
  
          static readonly isStreamingOutput = true;
  @prop({ type: "int", default: 0, title: "Max Events", description: "Maximum number of events to process (0 = unlimited)", min: 0 })
  declare max_events: any;

  @prop({ type: "float", default: 60, title: "Interval Seconds", description: "Interval between triggers in seconds" })
  declare interval_seconds: any;

  @prop({ type: "float", default: 0, title: "Initial Delay Seconds", description: "Delay before the first trigger fires", min: 0 })
  declare initial_delay_seconds: any;

  @prop({ type: "bool", default: true, title: "Emit On Start", description: "Whether to emit an event immediately on start" })
  declare emit_on_start: any;

  @prop({ type: "bool", default: true, title: "Include Drift Compensation", description: "Compensate for execution time to maintain accurate intervals" })
  declare include_drift_compensation: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const intervalSeconds = Number(inputs.interval_seconds ?? this.interval_seconds ?? 60);
    return {
      output: {
        interval_seconds: intervalSeconds,
        triggered_at: new Date().toISOString(),
      },
    };
  }
}

export class WebhookTriggerNode extends BaseNode {
  static readonly nodeType = "nodetool.triggers.WebhookTrigger";
            static readonly title = "Webhook Trigger";
            static readonly description = "Trigger node that starts an HTTP server to receive webhook requests.\n\n    Each incoming HTTP request is emitted as an event containing:\n    - The request body (parsed as JSON if applicable)\n    - Request headers\n    - Query parameters\n    - HTTP method\n\n    This trigger is useful for:\n    - Receiving notifications from external services\n    - Building API endpoints that trigger workflows\n    - Integration with third-party webhook providers";
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
  @prop({ type: "int", default: 0, title: "Max Events", description: "Maximum number of events to process (0 = unlimited)", min: 0 })
  declare max_events: any;

  @prop({ type: "int", default: 8080, title: "Port", description: "Port to listen on for webhook requests", min: 1, max: 65535 })
  declare port: any;

  @prop({ type: "str", default: "/webhook", title: "Path", description: "URL path to listen on" })
  declare path: any;

  @prop({ type: "str", default: "127.0.0.1", title: "Host", description: "Host address to bind to. Use '0.0.0.0' to listen on all interfaces." })
  declare host: any;

  @prop({ type: "list[str]", default: [
  "POST"
], title: "Methods", description: "HTTP methods to accept" })
  declare methods: any;

  @prop({ type: "str", default: "", title: "Secret", description: "Optional secret for validating requests (checks X-Webhook-Secret header)" })
  declare secret: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {
      output: {
        method: String(inputs.method ?? this.method ?? "POST"),
        path: String(inputs.path ?? this.path ?? "/"),
        headers: inputs.headers ?? this.headers ?? {},
        body: inputs.body ?? this.body ?? {},
      },
    };
  }
}

export class FileWatchTriggerNode extends BaseNode {
  static readonly nodeType = "nodetool.triggers.FileWatchTrigger";
            static readonly title = "File Watch Trigger";
            static readonly description = "Trigger node that monitors filesystem changes.\n\n    This trigger uses the watchdog library to monitor a directory or file\n    for changes. When a change is detected, an event is emitted containing:\n    - The path of the changed file\n    - The type of change (created, modified, deleted, moved)\n    - Timestamp of the event\n\n    This trigger is useful for:\n    - Processing files as they arrive in a directory\n    - Triggering workflows on configuration changes\n    - Building file-based automation pipelines";
        static readonly metadataOutputTypes = {
    event: "str",
    path: "str",
    dest_path: "str",
    is_directory: "bool",
    timestamp: "str"
  };
  
          static readonly isStreamingOutput = true;
  @prop({ type: "int", default: 0, title: "Max Events", description: "Maximum number of events to process (0 = unlimited)", min: 0 })
  declare max_events: any;

  @prop({ type: "str", default: ".", title: "Path", description: "Path to watch (file or directory)" })
  declare path: any;

  @prop({ type: "bool", default: false, title: "Recursive", description: "Watch subdirectories recursively" })
  declare recursive: any;

  @prop({ type: "list[str]", default: [
  "*"
], title: "Patterns", description: "File patterns to watch (e.g., ['*.txt', '*.json'])" })
  declare patterns: any;

  @prop({ type: "list[str]", default: [], title: "Ignore Patterns", description: "File patterns to ignore" })
  declare ignore_patterns: any;

  @prop({ type: "list[str]", default: [
  "created",
  "modified",
  "deleted",
  "moved"
], title: "Events", description: "Types of events to watch for" })
  declare events: any;

  @prop({ type: "float", default: 0.5, title: "Debounce Seconds", description: "Debounce time to avoid duplicate events", min: 0 })
  declare debounce_seconds: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {
      output: {
        path: String(inputs.path ?? this.path ?? ""),
        event: String(inputs.event ?? this.event ?? "modified"),
        detected_at: new Date().toISOString(),
      },
    };
  }
}

export const TRIGGER_NODES = [
  WaitNode,
  ManualTriggerNode,
  IntervalTriggerNode,
  WebhookTriggerNode,
  FileWatchTriggerNode,
] as const;
