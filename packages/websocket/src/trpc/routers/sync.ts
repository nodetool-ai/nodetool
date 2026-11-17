/**
 * Sync router: what a client that keeps its own copy of a cloud document must
 * know before it saves. See `sync.ts` in the protocol package for the rules.
 *
 *   capabilities (query) — protocol versions, and per document kind the
 *                          schema versions this server reads and writes.
 *
 * A client that has not signed in reads the same answer from the anonymous
 * `GET /api/sync/capabilities` route, because the server's auth hook runs
 * before any tRPC procedure.
 */
import * as sync from "@nodetool-ai/protocol/api-schemas/sync.js";
import { router, publicProcedure } from "../index.js";

function kind(version: number): sync.KindCapabilities {
  return { read: [version], write: [version], modes: ["whole"] };
}

/** The capabilities this server offers. It names no user data. */
export function syncCapabilities(): sync.CapabilitiesOutput {
  return {
    protocol_version: sync.SYNC_PROTOCOL_VERSION,
    min_client_protocol_version: sync.MIN_CLIENT_PROTOCOL_VERSION,
    kinds: {
      workflow: kind(sync.DOCUMENT_SCHEMA_VERSIONS.workflow),
      timeline: kind(sync.DOCUMENT_SCHEMA_VERSIONS.timeline)
    }
  };
}

export const syncRouter = router({
  capabilities: publicProcedure
    .output(sync.capabilitiesOutput)
    .query(() => syncCapabilities())
});
