/**
 * Dev/test-only runtime validation for inbound WebSocket messages.
 *
 * Production builds skip this entirely — `VALIDATE_INBOUND_MESSAGES` folds to
 * a literal `false` (Vite replaces `process.env.NODE_ENV` at build time, same
 * as e.g. `src/contexts/NodeContext.tsx`'s dev-only check), so the branch
 * below is dead code and the bundler strips it along with the
 * `processingMessageSchemas` import.
 *
 * This is observe-only: a message that fails validation is logged and still
 * dispatched exactly as before. B4 is about surfacing protocol drift early
 * (in dev/test), not about rejecting traffic client-side.
 */
import {
  outboundControlMessageSchemas,
  processingMessageSchemas
} from "@nodetool-ai/protocol";
import { isObjectLike, isString } from "../../utils/typePredicates";

/**
 * On (dev and test) unless explicitly built for production — Jest sets
 * `NODE_ENV=test`, so this is default-on under the test suite, matching B4's
 * done-when ("both clients' test suites run with validation on").
 */
export const VALIDATE_INBOUND_MESSAGES: boolean =
  process.env.NODE_ENV !== "production";

const schemasByType = {
  ...processingMessageSchemas,
  ...outboundControlMessageSchemas
} as Record<
  string,
  { safeParse: (value: unknown) => { success: boolean; error?: { issues: unknown } } }
>;

/**
 * Validate one inbound (already msgpack-decoded) message against the shared
 * protocol schemas, when its `type` matches a known processing or outbound
 * control message. Other message types are not checked here.
 *
 * Never throws and never changes control flow: callers dispatch the message
 * exactly as they would have without calling this.
 */
export function validateInboundMessage(message: unknown): void {
  if (!VALIDATE_INBOUND_MESSAGES) {
    return;
  }
  if (!message || !isObjectLike(message)) {
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
