/**
 * `PUT /api/transfers/:id/files/:hash`: stages the bytes of one file of an
 * open transfer (WP2.4). The body is the raw bytes. The rest of the transfer
 * API is the tRPC `transfers` router.
 *
 * Answers 201 when the bytes were stored, 200 when the store held them
 * already, and 400 with `HASH_MISMATCH` when the bytes do not have the
 * declared hash and size.
 */
import type { FastifyPluginAsync } from "fastify";
import { BlobStageError } from "@nodetool-ai/asset-services/blob-store";
import { stageTransferFile, TransferRequestError } from "@nodetool-ai/project-services/cloud-transfer";
import { bridge } from "../lib/bridge.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
import { transferHost } from "../lib/transfer-host.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

/** The largest file one request stages. */
export const MAX_TRANSFER_FILE_BYTES = 512 * 1024 * 1024;

const STATUS_BY_TRANSFER_CODE: Record<TransferRequestError["code"], number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID: 400,
  ATTEMPT_CONTENT_MISMATCH: 409,
  NEEDS_POSTGRES: 503
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const transferRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  app.put<{ Params: { id: string; hash: string } }>(
    "/api/transfers/:id/files/:hash",
    { bodyLimit: MAX_TRANSFER_FILE_BYTES },
    async (req, reply) => {
      const { id, hash } = req.params;
      await bridge(req, reply, async (request) => {
        const userId = getUserId(request, opts.apiOptions.userIdHeader ?? "x-user-id");
        if (!/^[0-9a-f]{32}$/.test(id)) return json(400, { code: "INVALID_INPUT", detail: "Invalid transfer id" });
        const bytes = new Uint8Array(await request.arrayBuffer());
        try {
          const outcome = await stageTransferFile(transferHost(), userId, {
            transfer_id: id,
            hash,
            size: bytes.byteLength,
            bytes
          });
          return json(outcome === "stored" ? 201 : 200, { outcome });
        } catch (error) {
          if (error instanceof BlobStageError) {
            return json(400, { code: error.code, detail: error.message, received_hash: error.receivedHash });
          }
          if (error instanceof TransferRequestError) {
            return json(STATUS_BY_TRANSFER_CODE[error.code], { code: error.code, detail: error.message });
          }
          throw error;
        }
      });
      return reply;
    }
  );
};

export default transferRoutes;
