/**
 * Capability negotiation for clients that keep their own copy of a cloud
 * document, such as the native apps.
 *
 * A client reads `sync.capabilities` once per server, and sends its protocol
 * version in the {@link SYNC_PROTOCOL_HEADER} header on every request. A
 * client below {@link MIN_CLIENT_PROTOCOL_VERSION} may still list and read,
 * and its writes are refused with `CLIENT_TOO_OLD`. A request without the
 * header comes from a client that ships with this server, such as the web
 * app, and is not checked.
 *
 * Each document records the schema version it was written in. A save in a
 * lower version is refused with `SCHEMA_DOWNGRADE`, so a client that cannot
 * write a document's schema can never replace it with a reduced copy. A save
 * without a version is written in {@link DOCUMENT_SCHEMA_VERSIONS}, which
 * again is what clients shipped with this server write.
 */
import { z } from "zod";

/** Request header that carries the client's protocol version. */
export const SYNC_PROTOCOL_HEADER = "x-nodetool-protocol";

/** The protocol version this server speaks. */
export const SYNC_PROTOCOL_VERSION = 1;

/** The lowest client protocol version whose writes this server accepts. */
export const MIN_CLIENT_PROTOCOL_VERSION = 1;

export const syncDocumentKind = z.enum(["workflow", "timeline"]);
export type SyncDocumentKind = z.infer<typeof syncDocumentKind>;

/** The schema version this server writes, per document kind. */
export const DOCUMENT_SCHEMA_VERSIONS: Readonly<
  Record<SyncDocumentKind, number>
> = { workflow: 1, timeline: 1 };

/**
 * An editing instance id: 128 random bits as 32 lowercase hex characters. A
 * client draws a new one each time it opens a document, and sends it with
 * every save of that document.
 */
export const editingInstanceId = z
  .string()
  .regex(/^[0-9a-f]{32}$/, "An editing instance id is 32 lowercase hex characters");

/** A document schema version a save says it was written in. */
export const documentSchemaVersion = z.number().int().min(1);

export const kindCapabilities = z.object({
  /** Schema versions the server reads. */
  read: z.array(documentSchemaVersion),
  /** Schema versions the server writes. */
  write: z.array(documentSchemaVersion),
  /** How a client sends changes: `whole` is the full document per save. */
  modes: z.array(z.literal("whole"))
});
export type KindCapabilities = z.infer<typeof kindCapabilities>;

export const capabilitiesOutput = z.object({
  protocol_version: z.number().int(),
  min_client_protocol_version: z.number().int(),
  kinds: z.object({
    workflow: kindCapabilities,
    timeline: kindCapabilities
  })
});
export type CapabilitiesOutput = z.infer<typeof capabilitiesOutput>;

/**
 * The protocol version a request header names, or null when the header is
 * absent. A value that is not a positive integer counts as version 0, which
 * is below every minimum.
 */
export function clientProtocolVersion(
  header: string | readonly string[] | undefined
): number | null {
  if (header === undefined) {
    return null;
  }
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined) {
    return null;
  }
  return /^[1-9][0-9]{0,8}$/.test(value.trim()) ? Number(value.trim()) : 0;
}
