// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Wait — nodetool.triggers.Wait
export interface WaitInputs {
  timeout_seconds?: Connectable<number>;
  input?: Connectable<unknown>;
}

export interface WaitOutputs {
  data: unknown;
  resumed_at: string;
  waited_seconds: number;
}

export function wait(inputs: WaitInputs): DslNode<WaitOutputs> {
  return createNode("nodetool.triggers.Wait", inputs as Record<string, unknown>, { outputNames: ["data", "resumed_at", "waited_seconds"] });
}

// Manual Trigger — nodetool.triggers.ManualTrigger
export interface ManualTriggerInputs {
  max_events?: Connectable<number>;
  name?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
}

export interface ManualTriggerOutputs {
  data: unknown;
  timestamp: string;
  source: string;
  event_type: string;
}

export function manualTrigger(inputs: ManualTriggerInputs): DslNode<ManualTriggerOutputs> {
  return createNode("nodetool.triggers.ManualTrigger", inputs as Record<string, unknown>, { outputNames: ["data", "timestamp", "source", "event_type"], streaming: true });
}

// Interval Trigger — nodetool.triggers.IntervalTrigger
export interface IntervalTriggerInputs {
  max_events?: Connectable<number>;
  interval_seconds?: Connectable<number>;
  initial_delay_seconds?: Connectable<number>;
  emit_on_start?: Connectable<boolean>;
  include_drift_compensation?: Connectable<boolean>;
}

export interface IntervalTriggerOutputs {
  tick: number;
  elapsed_seconds: number;
  interval_seconds: number;
  timestamp: string;
  source: string;
  event_type: string;
}

export function intervalTrigger(inputs: IntervalTriggerInputs): DslNode<IntervalTriggerOutputs> {
  return createNode("nodetool.triggers.IntervalTrigger", inputs as Record<string, unknown>, { outputNames: ["tick", "elapsed_seconds", "interval_seconds", "timestamp", "source", "event_type"], streaming: true });
}

// Webhook Trigger — nodetool.triggers.WebhookTrigger
export interface WebhookTriggerInputs {
  max_events?: Connectable<number>;
  port?: Connectable<number>;
  path?: Connectable<string>;
  host?: Connectable<string>;
  methods?: Connectable<string[]>;
  secret?: Connectable<string>;
}

export interface WebhookTriggerOutputs {
  body: unknown;
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
  method: string;
  path: string;
  timestamp: string;
  source: string;
  event_type: string;
}

export function webhookTrigger(inputs: WebhookTriggerInputs): DslNode<WebhookTriggerOutputs> {
  return createNode("nodetool.triggers.WebhookTrigger", inputs as Record<string, unknown>, { outputNames: ["body", "headers", "query", "method", "path", "timestamp", "source", "event_type"], streaming: true });
}

// File Watch Trigger — nodetool.triggers.FileWatchTrigger
export interface FileWatchTriggerInputs {
  max_events?: Connectable<number>;
  path?: Connectable<string>;
  recursive?: Connectable<boolean>;
  patterns?: Connectable<string[]>;
  ignore_patterns?: Connectable<string[]>;
  events?: Connectable<string[]>;
  debounce_seconds?: Connectable<number>;
}

export interface FileWatchTriggerOutputs {
  event: string;
  path: string;
  dest_path: string;
  is_directory: boolean;
  timestamp: string;
}

export function fileWatchTrigger(inputs: FileWatchTriggerInputs): DslNode<FileWatchTriggerOutputs> {
  return createNode("nodetool.triggers.FileWatchTrigger", inputs as Record<string, unknown>, { outputNames: ["event", "path", "dest_path", "is_directory", "timestamp"], streaming: true });
}
