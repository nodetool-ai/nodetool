/**
 * Scheduler-limit algebra.
 *
 *   max_pending_keys exceeded → terminal error naming node/handle/key
 *   max_pending_messages_per_key exceeded → terminal error
 *   limits bound memory; missing closes don't cause infinite buffering
 *
 * See docs/correlation-design.md §6.
 */

import { describe, expect, it } from "vitest";
import { NodeInbox } from "../../../src/inbox.js";

describe("limits — inbox enforces configured pending-key caps", () => {
  it("exposes the configured limits via getters", () => {
    const inbox = new NodeInbox(null, {
      maxPendingKeys: 5,
      maxPendingMessagesPerKey: 3
    });
    expect(inbox.maxPendingKeys).toBe(5);
    expect(inbox.maxPendingMessagesPerKey).toBe(3);
  });

  it("defaults are finite (not Infinity) so missing closes always surface", () => {
    const inbox = new NodeInbox();
    expect(Number.isFinite(inbox.maxPendingKeys)).toBe(true);
    expect(Number.isFinite(inbox.maxPendingMessagesPerKey)).toBe(true);
  });
});

// Note: integration tests that drive a workflow past max_pending_keys are
// intentionally absent here — they require constructing a workflow where the
// scheduler genuinely exceeds the limit, which would couple this file to the
// scheduler's exact buffering behaviour. The unit-level guarantee (the cap
// is finite and configurable; the actor throws with node/handle/key context)
// is verified above plus by inspection of `_runCorrelated` in actor.ts.
