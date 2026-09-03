/**
 * Data-subject-rights endpoints — the HTTP door onto `@nodetool-ai/models`'
 * `exportPersonalData` / `erasePersonalData`.
 *
 *   GET    /api/account/export   → Art. 20 portability
 *   DELETE /api/account          → Art. 17 erasure
 *
 * The published privacy policy promises both in-product; this is what it
 * points at. Neither route decides policy: `PERSONAL_DATA_REGISTRY` says what
 * happens to each table and the library walks it.
 *
 * ## The subject is always the caller
 *
 * There is no admin path here and no way to name a subject. Both handlers get
 * their user id from `getUserId`, reading the request that `bridge` built —
 * and `bridge` deletes any client-supplied identity header before setting it
 * from `req.userId`, the id the server's own auth hook decided. No id is read
 * from the path, the query or the body: the erase body's schema declares
 * `confirm` and nothing else, and the routes carry no `:id` segment for one to
 * hide in. A caller wanting somebody else's data would have to change this
 * file, not the request. `req.userId == null` is refused with 401 rather than
 * falling back to `getUserId`'s default of user "1".
 *
 * ## The erasure contract
 *
 * `DELETE /api/account` is irreversible, so it is deliberate by construction:
 *
 * - The body must be `{"confirm": "DELETE MY ACCOUNT"}` — the exact string,
 *   case-sensitive. A bare `DELETE` with no body, an empty object, a typo, or
 *   any other value is `400` and nothing is touched. A stray or replayed
 *   `DELETE` therefore cannot erase anything.
 * - It is idempotent. The library re-runs the same sweep; a second call finds
 *   nothing left and reports zeros. Both calls answer `200`.
 * - It returns the per-table report — deleted/redacted/retained counts keyed
 *   by table — plus the `requestId` that ties the two audit rows together.
 * - Audit: this route writes `data_erasure_requested` *before* the sweep, so
 *   the request is on record even if the sweep then throws.
 *   `erasePersonalData` writes `data_erasure_completed` itself once it is
 *   given a `requestId`; this route does not write that event a second time.
 *   Both types are in `NEVER_PRUNED_USER_EVENT_TYPES`, so the sweep it runs
 *   leaves them behind as the evidence the request was answered.
 *
 * ## Bytes, not just rows
 *
 * `erasePersonalData` takes an {@link ErasureObjectStore} and reports
 * `objectKeysDeleted: null` without one — deleting the asset row and leaving
 * the object readable to anyone holding a URL. `assetErasureStore` below wires
 * the real `StorageAdapter`, so the report names the keys it removed.
 *
 * Two things that adapter does on purpose. It filters the listing to keys
 * under `<userId>/` rather than trusting the prefix scoping: `list()`
 * normalizes `"u1/"` to `"u1"`, and on the S3 and Supabase backends — which
 * match a prefix as a string, not as a directory — that would also match
 * `u10/…`. And it only ever deletes what that filter passes, so the blast
 * radius is one user's prefix whatever the backend does with the argument.
 * Objects stored before the owner prefix existed sit at a flat
 * `<assetId>.<ext>` and are not reachable by any per-user prefix; they are not
 * swept here.
 *
 * ## Why the body is validated with Zod rather than a Fastify `schema`
 *
 * These are bridged routes. The server installs an app-wide
 * `addContentTypeParser("*", { parseAs: "buffer" })`, so `req.body` reaches a
 * route as raw bytes and a JSON-schema `schema.body` would reject every
 * request as "not an object". Validation therefore happens where the bytes
 * are — one `safeParse` at the boundary, before anything reads a field —
 * which is the pattern the other bridged routes in this package use and what
 * `packages/AGENTS.md` means by "Zod is the canonical validator".
 */

import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import {
  UserEventType,
  erasePersonalData,
  exportPersonalData,
  recordUserEvent,
  type ErasureObjectStore
} from "@nodetool-ai/models";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { z } from "zod";

import { bridge } from "../lib/bridge.js";
import { getUserId, type HttpApiOptions } from "../http-api.js";
import { getAssetAdapter } from "../lib/storage.js";

interface RouteOptions {
  apiOptions: HttpApiOptions;
  /** Object store swept on erasure. Defaults to the asset adapter. */
  storage?: StorageAdapter;
}

/** The exact phrase `DELETE /api/account` requires in its body. */
export const ERASURE_CONFIRMATION = "DELETE MY ACCOUNT";

/**
 * The one field the erase body may carry.
 *
 * `z.literal` rather than a free string so the gate is the phrase itself, and
 * `strict()` so an unexpected field — `user_id`, `userId`, `subject` — is a
 * `400` rather than something a later reader might mistake for an instruction.
 */
export const erasureRequest = z
  .object({ confirm: z.literal(ERASURE_CONFIRMATION) })
  .strict();

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data ?? null), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

/** The parsed JSON body, or `null` when there is nothing parseable. */
async function readJsonBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text();
    return text.length > 0 ? JSON.parse(text) : null;
  } catch {
    // Unparseable bytes are "no body", answered by the schema below as a 400.
    return null;
  }
}

/**
 * A {@link ErasureObjectStore} over a `StorageAdapter` — the adapter shape the
 * doc comment on `ErasureObjectStore` sketches, with the prefix guard the
 * string-prefix backends need.
 */
export function assetErasureStore(
  adapter: StorageAdapter
): ErasureObjectStore {
  return {
    async deleteObjectsForUser(userId: string): Promise<readonly string[]> {
      const prefix = `${userId}/`;
      const { entries } = await adapter.list(prefix);
      const deleted: string[] = [];
      for (const entry of entries) {
        if (!entry.key.startsWith(prefix)) continue;
        if (await adapter.delete(entry.uri)) deleted.push(entry.key);
      }
      return deleted;
    }
  };
}

/** Filename a browser saves the export as. */
function exportFilename(generatedAt: string): string {
  const day = generatedAt.slice(0, 10);
  return `nodetool-personal-data-export-${day}.json`;
}

const accountRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { apiOptions } = opts;
  const userIdHeader = apiOptions.userIdHeader ?? "x-user-id";

  app.get("/api/account/export", async (req, reply) => {
    // No authenticated identity means no subject. `getUserId` would answer "1"
    // here, which is a real account on a local install.
    if (req.userId == null) {
      reply
        .code(401)
        .header("cache-control", "no-store")
        .send({ detail: "Authentication required" });
      return;
    }
    await bridge(
      req,
      reply,
      async (request) => {
        const userId = getUserId(request, userIdHeader);
        const data = await exportPersonalData(userId);
        await recordUserEvent({
          userId,
          eventType: UserEventType.DATA_EXPORT_REQUESTED,
          metadata: { request_id: randomUUID(), format: data.format }
        });
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "content-disposition": `attachment; filename="${exportFilename(
              data.generatedAt
            )}"`
          }
        });
      },
      userIdHeader
    );
  });

  app.delete("/api/account", async (req, reply) => {
    if (req.userId == null) {
      reply
        .code(401)
        .header("cache-control", "no-store")
        .send({ detail: "Authentication required" });
      return;
    }
    await bridge(
      req,
      reply,
      async (request) => {
        const parsed = erasureRequest.safeParse(await readJsonBody(request));
        if (!parsed.success) {
          return jsonResponse(
            {
              detail:
                "Erasure is irreversible. Send " +
                `{"confirm": "${ERASURE_CONFIRMATION}"} to confirm.`
            },
            400
          );
        }

        const userId = getUserId(request, userIdHeader);
        const requestId = randomUUID();
        // Before the sweep: this row is the record that the request arrived,
        // and it has to survive a sweep that then fails part-way.
        await recordUserEvent({
          userId,
          eventType: UserEventType.DATA_ERASURE_REQUESTED,
          metadata: { request_id: requestId }
        });

        const report = await erasePersonalData(userId, {
          objectStore: assetErasureStore(opts.storage ?? getAssetAdapter()),
          // `erasePersonalData` writes `data_erasure_completed` from this id.
          requestId
        });
        return jsonResponse({ requestId, report });
      },
      userIdHeader
    );
  });
};

export default accountRoutes;
