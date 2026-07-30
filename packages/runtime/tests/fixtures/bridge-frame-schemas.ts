/**
 * Minimal Zod envelope schemas for the Python bridge wire frames
 * (discover/result/error/chunk/progress/comfy.event).
 *
 * Used ONLY by the two bridge fakes — `fake-python-stdio-worker.ts` (stdio
 * transport) and `python-websocket-bridge.test-helpers.ts` (WebSocket
 * transport) — to validate their own emissions before writing them to the
 * wire, so an invalid-frame-emitting fake fails its own package's tests.
 * See RELIABILITY_TASKS.md Track E, E3 and RELIABILITY_ARCHITECTURE.md §8
 * point 5 ("Fakes derive from contracts").
 *
 * TODO(B3): the bridge frame envelope has no real contract yet — B1 only
 * covers `ProcessingMessage` (`packages/protocol/src/messages.ts`). These
 * schemas are a deliberately minimal, local stand-in scoped to what the two
 * fakes actually emit. Once B3 lands a real, fully-modeled envelope schema in
 * `packages/protocol`, delete this file and import that instead.
 */

import { z } from "zod";

const discoverDataSchema = z.object({
  nodes: z.array(z.record(z.string(), z.unknown())),
  protocol_version: z.number(),
  load_errors: z.array(z.unknown())
});

const errorDataSchema = z
  .object({
    error: z.string(),
    traceback: z.string().optional()
  })
  .passthrough();

const comfyEventDataSchema = z
  .object({
    event: z.string()
  })
  .passthrough();

/** `result` and `chunk` frames carry a payload shaped by the request type
 *  (worker.status, execute, execute.stream, provider.stream, models.*,
 *  comfy.*, …), so only the envelope itself — not the payload's internal
 *  shape — is worth modeling here. */
const genericDataSchema = z.record(z.string(), z.unknown());

/** One schema per known bridge frame `type`, each validating the full frame
 *  (envelope + data), keyed by that type's discriminator. */
export const bridgeFrameSchemas = {
  discover: z.object({
    type: z.literal("discover"),
    request_id: z.string(),
    data: discoverDataSchema
  }),
  result: z.object({
    type: z.literal("result"),
    request_id: z.string(),
    data: genericDataSchema
  }),
  error: z.object({
    type: z.literal("error"),
    request_id: z.string(),
    data: errorDataSchema
  }),
  chunk: z.object({
    type: z.literal("chunk"),
    request_id: z.string(),
    data: genericDataSchema
  }),
  progress: z.object({
    type: z.literal("progress"),
    request_id: z.string(),
    data: genericDataSchema
  }),
  "comfy.event": z.object({
    type: z.literal("comfy.event"),
    request_id: z.string(),
    data: comfyEventDataSchema
  })
} as const;

export type BridgeFrameType = keyof typeof bridgeFrameSchemas;

/**
 * Validate a frame a bridge fake is about to send against its envelope
 * schema. Throws a descriptive `Error` — never returns a result to check —
 * so a non-conforming fake fails loudly and immediately at the emission
 * site, inside the fake's own test run.
 */
export function assertValidBridgeFrame(frame: Record<string, unknown>): void {
  const type = frame.type as string | undefined;
  const schema = type
    ? (bridgeFrameSchemas as Record<string, z.ZodTypeAny>)[type]
    : undefined;
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
