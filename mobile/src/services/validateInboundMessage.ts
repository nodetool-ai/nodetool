/**
 * Dev/test-only runtime validation for inbound WebSocket messages.
 *
 * Mirrors web/src/lib/websocket/validateInboundMessage.ts: parse a decoded
 * inbound message through the shared protocol schemas and, on a mismatch,
 * log a structured error without changing dispatch. Never throws, never
 * drops a message — B4 is about surfacing protocol drift early, not
 * rejecting traffic client-side.
 *
 * Gated on `__DEV__` (React Native's standard dev/prod constant, replaced
 * with a literal by the Expo/Metro build — see e.g.
 * `src/services/sentryReporter.ts`) rather than `NODE_ENV`, matching the rest
 * of this codebase; Jest's `@react-native/jest-preset` sets `__DEV__ = true`,
 * so validation is default-on under the test suite.
 *
 * `@nodetool-ai/protocol`'s runtime export pulls in `zod` (see
 * `mobile/metro.config.js`'s `SOURCE_MODULES` comment, which routes the
 * lightweight `triggers` subpath around the package root for exactly this
 * reason). This is the first place mobile imports a *runtime* value from the
 * full package rather than a type; the schemas only run in dev/test builds,
 * but Metro still bundles the module (and zod) into every build, including
 * release, since it has no reachability-based dead code elimination for a
 * plain `if (__DEV__)` guard. Accepted here as the cost of dev/test protocol
 * observability; revisit if release bundle size becomes a concern.
 */
import { processingMessageSchemas } from '@nodetool-ai/protocol';
import { isRecord, isString } from '../utils/typePredicates';

/** Jest's RN preset sets `__DEV__ = true`, so this is on under the test suite. */
export const VALIDATE_INBOUND_MESSAGES: boolean = __DEV__;

const schemasByType = processingMessageSchemas as Record<
  string,
  { safeParse: (value: unknown) => { success: boolean; error?: { issues: unknown } } }
>;

/**
 * Validate one inbound (already-decoded) message against the shared
 * protocol schemas, when its `type` matches a known `ProcessingMessage`
 * variant. Messages outside that union (`system_stats`, `reconnect_job`
 * acks, heartbeat frames, …) are not checked here.
 */
export function validateInboundMessage(message: unknown): void {
  if (!VALIDATE_INBOUND_MESSAGES) {
    return;
  }
  if (!isRecord(message)) {
    return;
  }

  const type = (message as { type?: unknown }).type;
  if (!isString(type)) {
    return;
  }

  const schema = schemasByType[type];
  if (!schema) {
    return;
  }

  const result = schema.safeParse(message);
  if (!result.success) {
    console.error(
      `[validateInboundMessage] inbound "${type}" message failed protocol validation`,
      { type, issues: result.error?.issues, message }
    );
  }
}
