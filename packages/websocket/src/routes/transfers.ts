/**
 * `PUT /api/transfers/:id/files/:hash`: stages the bytes of one file of an
 * open transfer (WP2.4). The body is the raw bytes. The rest of the transfer
 * API is the tRPC `transfers` router.
 *
 * Answers 201 when the bytes were stored, 200 when the owner already held
 * them in a committed project, and 400 with `HASH_MISMATCH` when the bytes
 * do not have the declared hash and size. Before the body is read, the
 * request must name a file the transfer's manifest lists, with a
 * `content-length` no larger than its declared size.
 */
import type { FastifyPluginAsync } from "fastify";
import { BlobStageError } from "@nodetool-ai/asset-services/blob-store";
import {
  declaredFileSize,
  stageTransferFile,
  TransferRequestError
} from "@nodetool-ai/project-services/cloud-transfer";
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
  NEEDS_POSTGRES: 503,
  STORAGE_EXCEEDED: 403
};

const TRANSFER_ID = /^[0-9a-f]{32}$/;

/** An error Fastify answers with `statusCode` and a body carrying `code`. */
function refusal(statusCode: number, code: string, message: string): Error {
  return Object.assign(new Error(message), { statusCode, code });
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const transferRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  app.put<{ Params: { id: string; hash: string } }>(
    "/api/transfers/:id/files/:hash",
    {
      bodyLimit: MAX_TRANSFER_FILE_BYTES,
      // Runs after authentication and before the body is read, so a request
      // larger than the file its manifest declares is refused without
      // buffering it (review F4).
      async preParsing(req, _reply, payload) {
        const { id, hash } = req.params;
        if (!TRANSFER_ID.test(id)) throw refusal(400, "INVALID_INPUT", "Invalid transfer id");
        let declared: number;
        try {
          // The bridge reads the same user: the authenticated one, or the local user.
          declared = await declaredFileSize(req.userId ?? "1", id, hash);
        } catch (error) {
          if (!(error instanceof TransferRequestError)) throw error;
          throw refusal(STATUS_BY_TRANSFER_CODE[error.code], error.code, error.message);
        }
        const header = req.headers["content-length"];
        if (header === undefined) {
          throw refusal(411, "INVALID_INPUT", "A staged file needs a content-length");
        }
        const length = Number(header);
        if (!Number.isSafeInteger(length) || length < 0) {
          throw refusal(400, "INVALID_INPUT", "Invalid content-length");
        }
        if (length > declared) {
          throw refusal(413, "FILE_TOO_LARGE", "The body is larger than the file the manifest declares");
        }
        return payload;
      }
    },
    async (req, reply) => {
      const { id, hash } = req.params;
      await bridge(req, reply, async (request) => {
        const userId = getUserId(request, opts.apiOptions.userIdHeader ?? "x-user-id");
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
