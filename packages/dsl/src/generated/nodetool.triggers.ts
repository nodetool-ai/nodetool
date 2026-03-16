// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, OutputHandle } from "../core.js";

// Wait — nodetool.triggers.Wait
export interface WaitInputs {
  timeout_seconds?: Connectable<number>;
  input?: Connectable<unknown>;
}

export interface WaitOutputs {
  data: OutputHandle<unknown>;
  resumed_at: OutputHandle<string>;
  waited_seconds: OutputHandle<number>;
}

export function wait(inputs: WaitInputs): DslNode<WaitOutputs> {
  return createNode("nodetool.triggers.Wait", inputs as Record<string, unknown>, { multiOutput: true });
}

// Manual Trigger — nodetool.triggers.ManualTrigger
export interface ManualTriggerInputs {
  max_events?: Connectable<number>;
  name?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
}

export interface ManualTriggerOutputs {
  data: OutputHandle<unknown>;
  timestamp: OutputHandle<string>;
  source: OutputHandle<string>;
  event_type: OutputHandle<string>;
}

export function manualTrigger(inputs: ManualTriggerInputs): DslNode<ManualTriggerOutputs> {
  return createNode("nodetool.triggers.ManualTrigger", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
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
  tick: OutputHandle<number>;
  elapsed_seconds: OutputHandle<number>;
  interval_seconds: OutputHandle<number>;
  timestamp: OutputHandle<string>;
  source: OutputHandle<string>;
  event_type: OutputHandle<string>;
}

export function intervalTrigger(inputs: IntervalTriggerInputs): DslNode<IntervalTriggerOutputs> {
  return createNode("nodetool.triggers.IntervalTrigger", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
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
  body: OutputHandle<unknown>;
  headers: OutputHandle<Record<string, unknown>>;
  query: OutputHandle<Record<string, unknown>>;
  method: OutputHandle<string>;
  path: OutputHandle<string>;
  timestamp: OutputHandle<string>;
  source: OutputHandle<string>;
  event_type: OutputHandle<string>;
}

export function webhookTrigger(inputs: WebhookTriggerInputs): DslNode<WebhookTriggerOutputs> {
  return createNode("nodetool.triggers.WebhookTrigger", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
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
  event: OutputHandle<string>;
  path: OutputHandle<string>;
  dest_path: OutputHandle<string>;
  is_directory: OutputHandle<boolean>;
  timestamp: OutputHandle<string>;
}

export function fileWatchTrigger(inputs: FileWatchTriggerInputs): DslNode<FileWatchTriggerOutputs> {
  return createNode("nodetool.triggers.FileWatchTrigger", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}
