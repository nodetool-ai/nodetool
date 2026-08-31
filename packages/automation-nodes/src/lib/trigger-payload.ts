/**
 * The boundary between a trigger adapter's payload and the output slots each
 * trigger node declares. A payload arrives as JSON somebody else wrote, so each
 * parse below keeps a field only when it carries the type its slot emits and
 * fills the rest in. A payload that is not an object of named fields carries no
 * fields at all; the manual and webhook parses emit the whole value instead.
 */

import type { TriggerEvent } from "@nodetool-ai/node-sdk";

/** A payload's named fields — empty when the payload was a bare value. */
type Envelope = ReadonlyMap<string, unknown>;

function isString<T>(value: T): value is T & string {
  return typeof value === "string";
}

function isFiniteNumber<T>(value: T): value is T & number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean<T>(value: T): value is T & boolean {
  return typeof value === "boolean";
}

/** An object of named fields. `null` and arrays are bare values, not envelopes. */
function isFieldObject<T>(value: T): value is T & object {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function envelopeOf(payload: TriggerEvent["payload"]): Envelope {
  const fields = new Map<string, unknown>();
  if (isFieldObject(payload)) {
    for (const [key, value] of Object.entries(payload)) {
      fields.set(key, value);
    }
  }
  return fields;
}

function stringField(fields: Envelope, key: string, fallback: string): string {
  const value = fields.get(key);
  return isString(value) ? value : fallback;
}

function numberField(fields: Envelope, key: string, fallback: number): number {
  const value = fields.get(key);
  return isFiniteNumber(value) ? value : fallback;
}

function booleanField(
  fields: Envelope,
  key: string,
  fallback: boolean
): boolean {
  const value = fields.get(key);
  return isBoolean(value) ? value : fallback;
}

/** A `dict[str, any]` slot: the field's object, or an empty one. */
function objectField(fields: Envelope, key: string): object {
  const value = fields.get(key);
  return isFieldObject(value) ? value : {};
}

/** What `nodetool.triggers.ManualTrigger` emits — one field per declared slot. */
export type ManualTriggerEvent = {
  data: unknown;
  timestamp: string;
  source: string;
  event_type: "manual";
};

/**
 * The adapter envelope is `{data, timestamp, source}`; a payload without a
 * `data` field is emitted whole as the data slot.
 */
export function parseManualEvent(
  payload: TriggerEvent["payload"],
  triggerName: string
): ManualTriggerEvent {
  const fields = envelopeOf(payload);
  return {
    data: fields.has("data") ? fields.get("data") : payload,
    timestamp: stringField(fields, "timestamp", new Date().toISOString()),
    source: stringField(fields, "source", triggerName),
    event_type: "manual"
  };
}

/** What `nodetool.triggers.IntervalTrigger` emits — one field per declared slot. */
export type IntervalTickEvent = {
  tick: number;
  elapsed_seconds: number;
  interval_seconds: number;
  timestamp: string;
  source: "interval";
  event_type: "tick";
};

/**
 * The scheduler adapter synthesizes the tick fields; a bare fire carries none
 * of them, so each falls back to a value that still describes a first tick of
 * this node's configured interval.
 */
export function parseIntervalTick(
  payload: TriggerEvent["payload"],
  intervalSeconds: number
): IntervalTickEvent {
  const fields = envelopeOf(payload);
  return {
    tick: numberField(fields, "tick", 1),
    elapsed_seconds: numberField(fields, "elapsed_seconds", 0),
    interval_seconds: numberField(fields, "interval_seconds", intervalSeconds),
    timestamp: stringField(fields, "timestamp", new Date().toISOString()),
    source: "interval",
    event_type: "tick"
  };
}

/** What `nodetool.triggers.WebhookTrigger` emits — one field per declared slot. */
export type WebhookEvent = {
  body: unknown;
  headers: object;
  query: object;
  method: string;
  path: string;
  timestamp: string;
  source: string;
  event_type: "webhook";
};

/**
 * The webhook route captures `{body, headers, query, method}` (plus
 * path/timestamp when available); a payload carrying none of those four is
 * treated as the body itself.
 */
export function parseWebhookEvent(
  payload: TriggerEvent["payload"]
): WebhookEvent {
  const fields = envelopeOf(payload);
  const isEnvelope =
    fields.has("body") ||
    fields.has("headers") ||
    fields.has("query") ||
    fields.has("method");
  return {
    body: isEnvelope ? fields.get("body") : payload,
    headers: objectField(fields, "headers"),
    query: objectField(fields, "query"),
    method: stringField(fields, "method", "POST"),
    path: stringField(fields, "path", ""),
    timestamp: stringField(fields, "timestamp", new Date().toISOString()),
    source: stringField(fields, "source", "webhook"),
    event_type: "webhook"
  };
}

/** What `nodetool.triggers.FileWatchTrigger` emits — one field per declared slot. */
export type FileWatchEvent = {
  event: string;
  path: string;
  dest_path: string;
  is_directory: boolean;
  timestamp: string;
};

/**
 * The file-watch adapter — or the launch-time snapshot diff — delivers
 * `{event, path, dest_path, is_directory}`.
 */
export function parseFileWatchEvent(
  payload: TriggerEvent["payload"]
): FileWatchEvent {
  const fields = envelopeOf(payload);
  return {
    event: stringField(fields, "event", "modified"),
    path: stringField(fields, "path", ""),
    dest_path: stringField(fields, "dest_path", ""),
    is_directory: booleanField(fields, "is_directory", false),
    timestamp: stringField(fields, "timestamp", new Date().toISOString())
  };
}
