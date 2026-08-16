/**
 * Collections router — migrated from REST `/api/collections*`.
 *
 * NOTE: the file-upload endpoint `POST /api/collections/:name/index` remains
 * on REST because its multipart/form-data body is not a natural fit for tRPC's
 * JSON link. The other CRUD + query endpoints move here.
 */

import { Workflow } from "@nodetool-ai/models";
import {
  getDefaultVectorProvider,
  CollectionNotFoundError,
  type ProviderCollectionMetadata
} from "@nodetool-ai/vectorstore";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { notifyResourceChange } from "../../resource-events.js";
import {
  OWNER_METADATA_KEY,
  canAccessCollection,
  stripReservedMetadata,
  validateCollectionName
} from "../../lib/collection-access.js";
import {
  listOutput,
  collectionResponse,
  createInput,
  updateInput,
  deleteInput,
  deleteOutput
} from "@nodetool-ai/protocol/api-schemas/collections.js";

/**
 * Normalize a CollectionMetadata (may contain `undefined`/`null`) to the wire
 * schema (string | number | boolean only).
 */
function normalizeMetadata(
  metadata: ProviderCollectionMetadata | undefined
) {
  const result: Record<string, string | number | boolean> = {};
  if (!metadata) return result;
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null) result[key] = value;
  }
  return result;
}

/**
 * Helper: resolve a workflow's name from an id. Returns `null` on any
 * lookup failure. Mirrors the REST handler's forgiving behaviour.
 */
async function resolveWorkflowName(
  workflowId: string | undefined
): Promise<string | null> {
  if (!workflowId) return null;
  try {
    const workflow = (await Workflow.get(workflowId)) as
      | { name?: string }
      | null;
    return workflow?.name ?? null;
  } catch {
    return null;
  }
}

/** Map CollectionNotFoundError → tRPC NOT_FOUND. Re-throws anything else. */
function rethrowAsTrpc(err: unknown): never {
  if (err instanceof CollectionNotFoundError) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Collection not found");
  }
  throw err;
}

/**
 * Load a collection the caller is allowed to touch.
 *
 * A collection owned by someone else answers NOT_FOUND rather than FORBIDDEN:
 * FORBIDDEN would confirm the name exists, turning this into an oracle for
 * enumerating other users' collection names.
 */
async function loadAccessibleCollection(name: string, userId: string) {
  const provider = getDefaultVectorProvider();
  let collection;
  try {
    collection = await provider.getCollection({ name });
  } catch (err) {
    rethrowAsTrpc(err);
  }
  if (!canAccessCollection(normalizeMetadata(collection.metadata), userId)) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Collection not found");
  }
  return collection;
}

/** Whether a collection with this name is present, regardless of owner. */
async function collectionExists(
  provider: ReturnType<typeof getDefaultVectorProvider>,
  name: string
): Promise<boolean> {
  try {
    await provider.getCollection({ name });
    return true;
  } catch {
    return false;
  }
}

/** Reject a name that is malformed, before it reaches the provider. */
function assertValidName(name: string): void {
  const error = validateCollectionName(name);
  if (error) {
    throwApiError(ApiErrorCode.INVALID_INPUT, error);
  }
}

export const collectionsRouter = router({
  list: protectedProcedure.output(listOutput).query(async ({ ctx }) => {
    const provider = getDefaultVectorProvider();
    const collections = await provider.listCollections();

    // Resolve each collection independently: a single failing/racing entry
    // (e.g. one deleted between listCollections() and getCollection(), raising
    // CollectionNotFoundError) must not 500 the whole listing and hide every
    // healthy collection. Skip the failures instead.
    const settled = await Promise.all(
      collections.map(async (info) => {
        try {
          const metadata = normalizeMetadata(info.metadata);
          // Filter before counting: another user's collection must not even
          // leak its size through this listing.
          if (!canAccessCollection(metadata, ctx.userId)) return null;
          const collection = await provider.getCollection({ name: info.name });
          const count = await collection.count();
          const workflowName = await resolveWorkflowName(
            typeof metadata.workflow === "string"
              ? metadata.workflow
              : undefined
          );
          return { name: info.name, count, metadata, workflow_name: workflowName };
        } catch {
          return null;
        }
      })
    );
    const results = settled.filter((r): r is NonNullable<typeof r> => r !== null);

    return { collections: results, count: results.length };
  }),

  create: protectedProcedure
    .input(createInput)
    .output(collectionResponse)
    .mutation(async ({ ctx, input }) => {
      assertValidName(input.name);
      const provider = getDefaultVectorProvider();
      const metadata: ProviderCollectionMetadata = {
        [OWNER_METADATA_KEY]: ctx.userId
      };
      if (input.embedding_model) {
        metadata.embedding_model = input.embedding_model;
      }
      if (input.embedding_provider) {
        metadata.embedding_provider = input.embedding_provider;
      }

      // Names are globally unique in the store (`vec_collections.name` carries
      // a UNIQUE constraint), so a duplicate surfaces as a driver-level
      // constraint error. Answer ALREADY_EXISTS rather than letting the raw
      // SQL message reach the client.
      let collection;
      try {
        collection = await provider.createCollection({
          name: input.name,
          metadata
        });
      } catch (err) {
        if (await collectionExists(provider, input.name)) {
          throwApiError(
            ApiErrorCode.ALREADY_EXISTS,
            `Collection ${input.name} already exists`
          );
        }
        throw err;
      }

      notifyResourceChange({
        event: "created",
        resource_type: "collection",
        resource: { id: collection.name }
      });

      return {
        name: collection.name,
        metadata: normalizeMetadata(collection.metadata),
        count: 0
      };
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(collectionResponse)
    .mutation(async ({ ctx, input }) => {
      const provider = getDefaultVectorProvider();
      const collection = await loadAccessibleCollection(
        input.name,
        ctx.userId
      );

      const existing = normalizeMetadata(collection.metadata);
      // Client metadata is merged with the server-owned keys stripped, then
      // ownership is restored from server state — otherwise a caller could
      // rewrite `owner_user_id` and take over (or give away) a collection.
      // An unowned legacy collection stays unowned: stamping the first user to
      // edit it as the owner would silently lock every other user out of a
      // collection they had been sharing.
      const merged: ProviderCollectionMetadata = {
        ...existing,
        ...stripReservedMetadata(input.metadata)
      };
      const owner = existing[OWNER_METADATA_KEY];
      if (typeof owner === "string" && owner) {
        merged[OWNER_METADATA_KEY] = owner;
      } else {
        delete merged[OWNER_METADATA_KEY];
      }

      const newName = input.rename ?? collection.name;
      if (newName !== collection.name) {
        assertValidName(newName);
        // Renaming onto a name already in use would hit the store's UNIQUE
        // constraint; check first so the caller gets ALREADY_EXISTS instead of
        // a driver error, and so a rename cannot be used to probe for another
        // user's collection names by error type.
        if (await collectionExists(provider, newName)) {
          throwApiError(
            ApiErrorCode.ALREADY_EXISTS,
            `Collection ${newName} already exists`
          );
        }
      }
      await collection.modify({ name: newName, metadata: merged });

      notifyResourceChange({
        event: "updated",
        resource_type: "collection",
        resource: { id: newName }
      });

      const count = await collection.count();
      return {
        name: newName,
        metadata: normalizeMetadata(merged),
        count
      };
    }),

  delete: protectedProcedure
    .input(deleteInput)
    .output(deleteOutput)
    .mutation(async ({ ctx, input }) => {
      const provider = getDefaultVectorProvider();
      // Ownership is checked before the delete, not after — deleteCollection
      // is irreversible.
      await loadAccessibleCollection(input.name, ctx.userId);
      try {
        await provider.deleteCollection(input.name);
      } catch (err) {
        rethrowAsTrpc(err);
      }
      notifyResourceChange({
        event: "deleted",
        resource_type: "collection",
        resource: { id: input.name }
      });
      return { message: `Collection ${input.name} deleted successfully` };
    })
});
