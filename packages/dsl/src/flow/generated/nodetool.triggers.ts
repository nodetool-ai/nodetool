// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode, streamNode } from "../guest-core.js";

// Wait — nodetool.triggers.Wait
export type WaitInputs = {
  timeout_seconds?: number;
  input?: unknown;
};

export interface WaitOutputs {
  data: unknown;
  resumed_at: string;
  waited_seconds: number;
}

export function wait(inputs: WaitInputs): Promise<WaitOutputs> {
  return callNode<WaitOutputs>("nodetool.triggers.Wait", inputs);
}

// Manual Trigger — nodetool.triggers.ManualTrigger
export type ManualTriggerInputs = {
  max_events?: number | number[];
  name?: string | string[];
  timeout_seconds?: number | number[];
};

export interface ManualTriggerOutputs {
  data: unknown;
  timestamp: string;
  source: string;
  event_type: string;
}

export function manualTrigger(inputs: ManualTriggerInputs): Promise<ManualTriggerOutputs> {
  return callNode<ManualTriggerOutputs>("nodetool.triggers.ManualTrigger", inputs);
}

manualTrigger.stream = function (inputs: ManualTriggerInputs): AsyncIterable<{ slot: keyof ManualTriggerOutputs & string; value: unknown }> {
  return streamNode<{ slot: keyof ManualTriggerOutputs & string; value: unknown }>("nodetool.triggers.ManualTrigger", inputs);
};

// Interval Trigger — nodetool.triggers.IntervalTrigger
export type IntervalTriggerInputs = {
  max_events?: number;
  interval_seconds?: number;
  initial_delay_seconds?: number;
  emit_on_start?: boolean;
  include_drift_compensation?: boolean;
};

export interface IntervalTriggerOutputs {
  tick: number;
  elapsed_seconds: number;
  interval_seconds: number;
  timestamp: string;
  source: string;
  event_type: string;
}

export function intervalTrigger(inputs: IntervalTriggerInputs): Promise<IntervalTriggerOutputs> {
  return callNode<IntervalTriggerOutputs>("nodetool.triggers.IntervalTrigger", inputs);
}

intervalTrigger.stream = function (inputs: IntervalTriggerInputs): AsyncIterable<Partial<IntervalTriggerOutputs>> {
  return streamNode<Partial<IntervalTriggerOutputs>>("nodetool.triggers.IntervalTrigger", inputs);
};

// Webhook Trigger — nodetool.triggers.WebhookTrigger
export type WebhookTriggerInputs = {
};

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

export function webhookTrigger(inputs?: WebhookTriggerInputs): Promise<WebhookTriggerOutputs> {
  return callNode<WebhookTriggerOutputs>("nodetool.triggers.WebhookTrigger", inputs ?? {});
}

// File Watch Trigger — nodetool.triggers.FileWatchTrigger
export type FileWatchTriggerInputs = {
  max_events?: number;
  path?: string;
  recursive?: boolean;
  patterns?: string[];
  ignore_patterns?: string[];
  events?: string[];
  debounce_seconds?: number;
};

export interface FileWatchTriggerOutputs {
  event: string;
  path: string;
  dest_path: string;
  is_directory: boolean;
  timestamp: string;
}

export function fileWatchTrigger(inputs: FileWatchTriggerInputs): Promise<FileWatchTriggerOutputs> {
  return callNode<FileWatchTriggerOutputs>("nodetool.triggers.FileWatchTrigger", inputs);
}

fileWatchTrigger.stream = function (inputs: FileWatchTriggerInputs): AsyncIterable<Partial<FileWatchTriggerOutputs>> {
  return streamNode<Partial<FileWatchTriggerOutputs>>("nodetool.triggers.FileWatchTrigger", inputs);
};
