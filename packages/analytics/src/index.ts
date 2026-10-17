/**
 * @nodetool-ai/analytics — opt-in, anonymous product analytics.
 *
 * Importing this module has no side effects: it starts no timer, reads no
 * storage and sends nothing. A client exists only once a surface calls
 * `createAnalyticsClient`, and it sends only after consent is granted.
 * See docs/analytics.md.
 */
export * from "./schema/clients.js";
export * from "./schema/properties.js";
export * from "./schema/events.js";
export * from "./schema/envelope.js";
export * from "./privacy/forbidden-fields.js";
export * from "./privacy/bucketing.js";
export * from "./privacy/validation.js";
export * from "./consent/types.js";
export * from "./identity/anonymous-id.js";
export * from "./core/store.js";
export * from "./core/transport.js";
export * from "./core/env.js";
export * from "./core/analytics-client.js";
export * from "./adapters/web-storage.js";
