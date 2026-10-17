import {
  ANALYTICS_PLATFORMS,
  isAnalyticsClientType
} from "../schema/clients.js";
import {
  ANALYTICS_EVENTS,
  isAnalyticsEventName,
  type AnalyticsEventDefinition
} from "../schema/events.js";
import {
  ANALYTICS_SCHEMA_VERSION,
  ENVELOPE_KEYS,
  MAX_BATCH_EVENTS,
  type AnalyticsBatch,
  type AnalyticsEnvelope
} from "../schema/envelope.js";
import { findForbiddenField } from "./forbidden-fields.js";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** `major.minor.patch` with an optional short prerelease tag. */
const APP_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,6}(-[0-9A-Za-z.]{1,24})?$/;

const HOUR_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/;

const HOUR_MS = 3_600_000;

export interface ValidateOptions {
  /**
   * When set, reject timestamps more than an hour ahead of this time or older
   * than `maxAgeMs`. The server passes its clock; clients omit it.
   */
  now?: Date;
  maxAgeMs?: number;
}

const fail = (reason: string): { ok: false; reason: string } => ({
  ok: false,
  reason
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}

function validateProperties(
  definition: AnalyticsEventDefinition,
  properties: unknown
): string | null {
  if (!isPlainObject(properties)) return "properties_not_object";
  const allowed = Object.keys(definition.properties);
  if (!hasExactKeys(properties, allowed)) return "properties_keys_mismatch";
  for (const key of allowed) {
    const value = properties[key];
    const values = definition.properties[key] ?? [];
    if (typeof value !== "string" || !values.includes(value)) {
      return `property_value_not_allowed:${key}`;
    }
  }
  return null;
}

/**
 * Check one envelope against the schema. Strict: the exact envelope keys, a
 * known event, a client allowed to emit it, the exact property keys and only
 * enum values. Shared by every client and by the ingestion route.
 */
export function validateEnvelope(
  value: unknown,
  options: ValidateOptions = {}
): ValidationResult<AnalyticsEnvelope> {
  if (!isPlainObject(value)) return fail("envelope_not_object");
  const forbidden = findForbiddenField(value);
  if (forbidden) return fail(`forbidden_field:${forbidden}`);
  if (!hasExactKeys(value, ENVELOPE_KEYS)) return fail("envelope_keys_mismatch");
  if (value["schemaVersion"] !== ANALYTICS_SCHEMA_VERSION) {
    return fail("schema_version_unsupported");
  }

  const event = value["event"];
  if (!isAnalyticsEventName(event)) return fail("event_unknown");
  const definition: AnalyticsEventDefinition = ANALYTICS_EVENTS[event];

  const clientType = value["clientType"];
  if (!isAnalyticsClientType(clientType)) return fail("client_type_unknown");
  if (!definition.clients.includes(clientType)) {
    return fail("event_not_allowed_for_client");
  }

  const anonymousId = value["anonymousId"];
  const sessionId = value["sessionId"];
  if (clientType === "cloud_backend") {
    // The backend has no analytics identity, and must not manufacture one.
    if (anonymousId !== null || sessionId !== null) {
      return fail("backend_identity_not_allowed");
    }
  } else {
    if (typeof anonymousId !== "string" || !UUID_V4.test(anonymousId)) {
      return fail("anonymous_id_invalid");
    }
    if (typeof sessionId !== "string" || !UUID_V4.test(sessionId)) {
      return fail("session_id_invalid");
    }
  }

  const timestamp = value["timestamp"];
  if (typeof timestamp !== "string" || !HOUR_TIMESTAMP.test(timestamp)) {
    return fail("timestamp_invalid");
  }
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return fail("timestamp_invalid");
  if (options.now) {
    const now = options.now.getTime();
    if (time > now + HOUR_MS) return fail("timestamp_in_future");
    if (options.maxAgeMs !== undefined && time < now - options.maxAgeMs) {
      return fail("timestamp_too_old");
    }
  }

  const appVersion = value["appVersion"];
  if (typeof appVersion !== "string" || !APP_VERSION.test(appVersion)) {
    return fail("app_version_invalid");
  }
  const platform = value["platform"];
  if (!(ANALYTICS_PLATFORMS as readonly unknown[]).includes(platform)) {
    return fail("platform_unknown");
  }

  const propertyError = validateProperties(definition, value["properties"]);
  if (propertyError) return fail(propertyError);

  return { ok: true, value: value as unknown as AnalyticsEnvelope };
}

/** Check a whole batch. One invalid event rejects the batch. */
export function validateBatch(
  value: unknown,
  options: ValidateOptions = {}
): ValidationResult<AnalyticsBatch> {
  if (!isPlainObject(value)) return fail("batch_not_object");
  if (!hasExactKeys(value, ["schemaVersion", "events"])) {
    return fail("batch_keys_mismatch");
  }
  if (value["schemaVersion"] !== ANALYTICS_SCHEMA_VERSION) {
    return fail("schema_version_unsupported");
  }
  const events = value["events"];
  if (!Array.isArray(events) || events.length === 0) {
    return fail("batch_empty");
  }
  if (events.length > MAX_BATCH_EVENTS) return fail("batch_too_large");
  for (const [index, event] of events.entries()) {
    const result = validateEnvelope(event, options);
    if (!result.ok) return fail(`event_${index}:${result.reason}`);
  }
  return { ok: true, value: value as unknown as AnalyticsBatch };
}

/**
 * Rebuild an envelope with its keys in canonical order. Applied after
 * validation so the stored and relayed form never depends on the order a
 * client chose.
 */
export function canonicalEnvelope(envelope: AnalyticsEnvelope): AnalyticsEnvelope {
  const properties: Record<string, string> = {};
  for (const key of Object.keys(ANALYTICS_EVENTS[envelope.event].properties)) {
    const value = envelope.properties[key];
    if (value !== undefined) properties[key] = value;
  }
  return {
    schemaVersion: envelope.schemaVersion,
    event: envelope.event,
    clientType: envelope.clientType,
    anonymousId: envelope.anonymousId,
    sessionId: envelope.sessionId,
    timestamp: envelope.timestamp,
    appVersion: envelope.appVersion,
    platform: envelope.platform,
    properties
  };
}

/** Reduce any version string to the accepted shape, or `0.0.0`. */
export function normalizeAppVersion(version: string | null | undefined): string {
  const trimmed = (version ?? "").trim().replace(/^v/, "");
  return APP_VERSION.test(trimmed) ? trimmed : "0.0.0";
}
