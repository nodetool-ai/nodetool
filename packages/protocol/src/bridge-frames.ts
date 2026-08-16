/**
 * Zod schemas for the Python worker bridge's wire frames.
 *
 * The bridge (`packages/runtime/src/python-bridge-base.ts` and its stdio /
 * WebSocket transports) exchanges msgpack-encoded `{type, request_id, data}`
 * frames with `python -m nodetool.worker --stdio` (or its WebSocket
 * equivalent). This module is the canonical, cross-package contract for
 * those frames:
 *
 *  - `python-bridge-base.ts`'s frame dispatcher validates every inbound
 *    frame against {@link bridgeFrameSchemas} before dispatch (behind
 *    `NODETOOL_VALIDATE_BRIDGE_FRAMES`, mirroring
 *    `NODETOOL_VALIDATE_OUTBOUND_WS` in `packages/websocket`).
 *  - The bridge test fakes (`fake-python-stdio-worker.ts`,
 *    `python-websocket-bridge.test-helpers.ts`) validate their own emissions
 *    against the same schemas via {@link assertValidBridgeFrame} before
 *    writing them to the wire, so a fake that emits an invalid frame fails
 *    its own package's tests.
 *  - The generated `dist/bridge-frames.schema.json` artifact (see
 *    `scripts/generate-processing-messages-schema.ts`) is the contract the
 *    Python worker repo's test suite validates against, so the two sides of
 *    the bridge can never silently drift apart.
 *
 * The dispatcher only ever switches on six frame `type`s — `discover`,
 * `result`, `error`, `chunk`, `progress`, and `comfy.event` — everything
 * else is either a request the JS side sends (`execute`, `worker.status`,
 * `provider.*`, `models.*`, `comfy.execute`, …) or silently ignored. Only the
 * six response types need a schema here.
 *
 * `result`/`chunk` payloads are polymorphic — their shape depends on which
 * request they answer (`execute` vs `worker.status` vs `provider.generate`
 * vs `models.list_cached` vs `comfy.execute`, …) and the dispatcher has no
 * way to know which request a `result` answers without consulting its own
 * pending-request bookkeeping first. Each schema below models the
 * best-known shapes as a union with a permissive record fallback, so a
 * `result`/`chunk` this module hasn't seen yet still passes (the envelope —
 * `type`/`request_id`/`data` being present and object-shaped — is what
 * actually gets enforced for those two types) while the common, well-known
 * shapes get real field-level checks.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/** Loosely-typed request id: present and non-empty on every real frame. */
const requestIdSchema = z.string().min(1);

/** `data` payload whose keys aren't modeled — accepted as-is. */
const genericDataSchema = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// discover
// ---------------------------------------------------------------------------

/**
 * One entry of `discover.data.nodes` — mirrors `PythonNodeMetadata`. Only
 * `node_type` is required: the JS side treats the rest as informational (test
 * fixtures and older workers routinely send a bare `{node_type}`), so
 * over-constraining the other fields here would reject frames the dispatcher
 * has always accepted.
 */
const pythonNodeMetadataSchema = z
  .object({
    node_type: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    properties: z.array(z.record(z.string(), z.unknown())).optional(),
    outputs: z.array(z.record(z.string(), z.unknown())).optional(),
    required_settings: z.array(z.string()).optional(),
    // Protocol v4: approximate VRAM the node's weights need, in GiB. The JS
    // side echoes it back on `execute` so the worker's reclaim pass has a
    // number to target instead of a percentage threshold.
    requires_vram_gb: z.number().optional()
  })
  .passthrough();

/**
 * One entry of `discover.data.load_errors` / `worker.status.data.load_errors`
 * — mirrors `PythonWorkerLoadError`. Only `error` is required, for the same
 * reason as {@link pythonNodeMetadataSchema}.
 */
const pythonWorkerLoadErrorSchema = z
  .object({
    error: z.string(),
    module: z.string().optional(),
    phase: z.string().optional(),
    error_type: z.string().optional()
  })
  .passthrough();

/**
 * `discover.data`. `protocol_version` is the bridge protocol negotiation
 * field the dispatcher compares against `BRIDGE_PROTOCOL_VERSION` /
 * `MIN_BRIDGE_PROTOCOL_VERSION` (see `@nodetool-ai/protocol/bridge-protocol`)
 * — optional because workers that pre-date the field are treated as v1.
 */
const discoverDataSchema = z
  .object({
    nodes: z.array(pythonNodeMetadataSchema),
    protocol_version: z.number().optional(),
    load_errors: z.array(pythonWorkerLoadErrorSchema).optional()
  })
  .passthrough();

export const discoverFrameSchema = z.object({
  type: z.literal("discover"),
  request_id: requestIdSchema,
  data: discoverDataSchema
});

// ---------------------------------------------------------------------------
// error
// ---------------------------------------------------------------------------

/** `error.data` — a terminal RPC failure, for any request type. */
const errorDataSchema = z
  .object({
    error: z.string(),
    traceback: z.string().optional()
  })
  .passthrough();

export const errorFrameSchema = z.object({
  type: z.literal("error"),
  request_id: requestIdSchema,
  data: errorDataSchema
});

// ---------------------------------------------------------------------------
// result / chunk — polymorphic per request type
// ---------------------------------------------------------------------------

/** `result.data` (and streamed `execute.stream` terminal) for `execute`. */
const executeResultDataSchema = z
  .object({
    outputs: z.record(z.string(), z.unknown()),
    blobs: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

/** `result.data` for `worker.status`. */
const workerStatusDataSchema = z
  .object({
    protocol_version: z.number(),
    node_count: z.number(),
    provider_count: z.number(),
    namespaces: z.array(z.string()),
    load_errors: z.array(pythonWorkerLoadErrorSchema),
    transport: z.string(),
    max_frame_size: z.number()
  })
  .passthrough();

/** `result.data` for `comfy.execute`. */
const comfyExecuteResultDataSchema = z
  .object({
    prompt_id: z.string().optional(),
    status: z.string().optional(),
    outputs: z.record(z.string(), z.unknown()).optional(),
    blobs: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

/** `data` shared by `result`/`chunk`: one of the known shapes, or any record. */
const resultOrChunkDataSchema = z.union([
  executeResultDataSchema,
  workerStatusDataSchema,
  comfyExecuteResultDataSchema,
  genericDataSchema
]);

export const resultFrameSchema = z.object({
  type: z.literal("result"),
  request_id: requestIdSchema,
  data: resultOrChunkDataSchema
});

export const chunkFrameSchema = z.object({
  type: z.literal("chunk"),
  request_id: requestIdSchema,
  data: resultOrChunkDataSchema
});

// ---------------------------------------------------------------------------
// progress
// ---------------------------------------------------------------------------

/** `progress.data` for a plain `execute`/`execute.stream` progress event. */
const executeProgressDataSchema = z
  .object({
    progress: z.number(),
    total: z.number()
  })
  .passthrough();

/**
 * `progress.data` for `models.download`/`comfy.models.download` — mirrors
 * `ModelDownloadUpdate`/`ComfyModelDownloadUpdate`.
 */
const downloadProgressDataSchema = z
  .object({
    status: z.enum([
      "start",
      "progress",
      "completed",
      "error",
      "cancelled",
      "exists"
    ]),
    downloaded_bytes: z.number(),
    total_bytes: z.number()
  })
  .passthrough();

const progressDataSchema = z.union([
  executeProgressDataSchema,
  downloadProgressDataSchema,
  genericDataSchema
]);

export const progressFrameSchema = z.object({
  type: z.literal("progress"),
  request_id: requestIdSchema,
  data: progressDataSchema
});

// ---------------------------------------------------------------------------
// comfy.event
// ---------------------------------------------------------------------------

/** `comfy.event.data` — mirrors `ComfyEvent`. `event` is the discriminator. */
const comfyEventDataSchema = z
  .object({
    event: z.enum([
      "queued",
      "queue",
      "started",
      "cached",
      "executing",
      "progress",
      "node_output",
      "preview",
      "completed",
      "cancelled"
    ])
  })
  .passthrough();

export const comfyEventFrameSchema = z.object({
  type: z.literal("comfy.event"),
  request_id: requestIdSchema,
  data: comfyEventDataSchema
});

// ---------------------------------------------------------------------------
// Aggregate lookup + discriminated union
// ---------------------------------------------------------------------------

/**
 * One schema per bridge frame `type` the dispatcher handles, keyed by that
 * type's discriminator — the full set switched on by
 * `PythonBridgeBase._handleMessage`.
 */
export const bridgeFrameSchemas = {
  discover: discoverFrameSchema,
  result: resultFrameSchema,
  error: errorFrameSchema,
  chunk: chunkFrameSchema,
  progress: progressFrameSchema,
  "comfy.event": comfyEventFrameSchema
} as const;

export type BridgeFrameType = keyof typeof bridgeFrameSchemas;

/** Discriminated union of every known bridge frame, for the generated JSON Schema. */
export const bridgeFrameSchema = z.discriminatedUnion("type", [
  discoverFrameSchema,
  resultFrameSchema,
  errorFrameSchema,
  chunkFrameSchema,
  progressFrameSchema,
  comfyEventFrameSchema
]);

export type BridgeFrame = z.infer<typeof bridgeFrameSchema>;

/**
 * Look up the schema for a frame's `type`, or `undefined` for an
 * unrecognized/missing type (request frames like `execute`, and anything the
 * dispatcher doesn't switch on, are intentionally not modeled here).
 */
export function getBridgeFrameSchema(
  type: string | undefined
): z.ZodTypeAny | undefined {
  if (!type) return undefined;
  return (bridgeFrameSchemas as Record<string, z.ZodTypeAny>)[type];
}

export interface BridgeFrameValidationResult {
  success: boolean;
  error?: string;
}

/**
 * Safe-parse an inbound frame against its envelope schema. Never throws —
 * callers on the hot dispatch path use this to decide whether to reject just
 * the affected request (see `python-bridge-base.ts`'s
 * `NODETOOL_VALIDATE_BRIDGE_FRAMES` gate) rather than tearing down the whole
 * connection.
 */
export function validateBridgeFrame(
  frame: Record<string, unknown>
): BridgeFrameValidationResult {
  const type = typeof frame["type"] === "string" ? frame["type"] : undefined;
  const schema = getBridgeFrameSchema(type);
  if (!schema) {
    // Unrecognized/absent type: not this module's concern — the dispatcher
    // already silently ignores frame types it doesn't switch on.
    return { success: true };
  }
  const result = schema.safeParse(frame);
  if (result.success) return { success: true };
  return {
    success: false,
    error: result.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ")
  };
}

/**
 * Validate a frame a bridge fake is about to send against its envelope
 * schema. Throws a descriptive `Error` — never returns a result to check —
 * so a non-conforming fake fails loudly and immediately at the emission
 * site, inside the fake's own test run. Used only by the bridge test fakes
 * (`fake-python-stdio-worker.ts`, `python-websocket-bridge.test-helpers.ts`).
 */
export function assertValidBridgeFrame(frame: Record<string, unknown>): void {
  const type = frame["type"] as string | undefined;
  const schema = getBridgeFrameSchema(type);
  if (!schema) {
    throw new Error(
      `[bridge fake] emitted a frame with an unknown/missing type ${JSON.stringify(
        type
      )}: ${JSON.stringify(frame)}`
    );
  }
  const result = schema.safeParse(frame);
  if (!result.success) {
    throw new Error(
      `[bridge fake] emitted a frame that fails its own envelope contract (type=${type}): ${result.error.message}\n` +
        `Frame: ${JSON.stringify(frame)}`
    );
  }
}
