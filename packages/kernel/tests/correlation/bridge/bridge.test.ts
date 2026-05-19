/**
 * Python stdio bridge — correlation readiness.
 *
 * Section 10 of the conformance matrix. The actual round-trip tests
 * (msgpack envelope serialization, LineageDone/LineageScopeClosed wire
 * format, protocol version mismatch) live with the bridge code in
 * `packages/runtime/` once PR 4a/4b lands. This file documents the
 * surface that needs coverage so it isn't dropped from the matrix.
 *
 * Current state:
 *  - PR 4a (TS): not started. Protocol handshake needs a
 *    `{ protocol_version: 2, capabilities: ["correlation"] }` hello.
 *  - PR 4a (Python): not started. `BaseNode.input_mode` and
 *    `BaseNode.output_correlation` metadata + stdio msgpack envelopes
 *    carrying `correlation_lineage` and `source_edge_id`.
 *  - PR 4b: `LineageDone` / `LineageScopeClosed` over stdio behind the
 *    negotiated capability; Python worker tests for iteration, chunk,
 *    forward, aggregate, dropped keys.
 *
 * Until those land, `NODETOOL_USE_CORRELATION=1` is opt-in only. PR 5
 * (default flip) is gated on PR 4b.
 */

import { describe, it } from "vitest";

describe("bridge — Python stdio correlation (blocked on PR 4a/4b)", () => {
  it.todo("msgpack envelope carries correlation_lineage and source_edge_id");
  it.todo("LineageDone serializes/deserializes round-trip");
  it.todo("LineageScopeClosed serializes/deserializes round-trip");
  it.todo("worker handshake advertises protocol_version + capabilities");
  it.todo("protocol version mismatch fails with a clear diagnostic");
  it.todo("workers without the correlation capability run legacy scheduler only");
});
