/**
 * `GET /api/receive/:set_id/files/:hash`: the bytes of one file of a
 * revision set (WP2.5), after authorizing the caller again on a document
 * that needs it. The rest of the receive API is the tRPC `receive` router.
 *
 * Answers 200 with the bytes, 404 when the set names no such file the
 * caller may read, 409 with `REVISION_SET_EXPIRED` when the set expired or
 * was released, and 410 with `ERASED` when an owner's action freed the
 * bytes. After 409 or 410 the client captures a new set (Y7).
 */
import type { FastifyPluginAsync } from "fastify";
import { ERASED, receiveFile, ReceiveRequestError } from "@nodetool-ai/project-services/cloud-receive";
import { bridge } from "../lib/bridge.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
import { receiveHost } from "../lib/receive-host.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
}

const FULL_ID = /^[0-9a-f]{32}$/;
const HASH = /^[0-9a-f]{64}$/;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const receiveRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  app.get<{ Params: { setId: string; hash: string } }>(
    "/api/receive/:setId/files/:hash",
    async (req, reply) => {
      const { setId, hash } = req.params;
      await bridge(req, reply, async (request) => {
        const userId = getUserId(request, opts.apiOptions.userIdHeader ?? "x-user-id");
        if (!FULL_ID.test(setId) || !HASH.test(hash)) {
          return json(400, { code: "INVALID_INPUT", detail: "Invalid set id or hash" });
        }
        try {
          const bytes = await receiveFile(receiveHost(), userId, { set_id: setId, hash });
          if (bytes === ERASED) {
            return json(410, { code: ERASED, detail: "The owner freed this file. Capture a new revision set." });
          }
          return new Response(new Blob([new Uint8Array(bytes)]), {
            status: 200,
            headers: { "content-type": "application/octet-stream", "content-length": String(bytes.byteLength) }
          });
        } catch (error) {
          if (error instanceof ReceiveRequestError) {
            return error.code === "NOT_FOUND"
              ? json(404, { code: "NOT_FOUND", detail: error.message })
              : json(409, { code: "REVISION_SET_EXPIRED", detail: error.message });
          }
          throw error;
        }
      });
      return reply;
    }
  );
};

export default receiveRoutes;
