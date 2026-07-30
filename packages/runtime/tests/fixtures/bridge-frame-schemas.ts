/**
 * Re-export of the real Python bridge frame contract, now that it lives in
 * `@nodetool-ai/protocol` (task B3). Kept as a thin local module so the two
 * bridge fakes — `fake-python-stdio-worker.ts` (stdio transport) and
 * `python-websocket-bridge.test-helpers.ts` (WebSocket transport) — and this
 * fixture's own conformance test (`tests/bridge-frame-schemas.test.ts`) don't
 * need an import-path churn on top of the contract move.
 *
 * See RELIABILITY_TASKS.md Track E, E3 and RELIABILITY_ARCHITECTURE.md §8
 * point 5 ("Fakes derive from contracts") — the fakes validate their own
 * emissions against these schemas before writing them to the wire, so a fake
 * that emits an invalid frame fails its own package's tests. The dispatcher
 * in `src/python-bridge-base.ts` validates inbound frames against the same
 * schemas (behind `NODETOOL_VALIDATE_BRIDGE_FRAMES`).
 */

export {
  bridgeFrameSchemas,
  bridgeFrameSchema,
  assertValidBridgeFrame,
  validateBridgeFrame,
  getBridgeFrameSchema,
  type BridgeFrameType,
  type BridgeFrame,
  type BridgeFrameValidationResult
} from "@nodetool-ai/protocol";
