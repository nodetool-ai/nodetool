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
): Record<string, string | number | boolean> {
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

export const collectionsRouter = router({
  list: protectedProcedure.output(listOutput).query(async () => {
    const provider = getDefaultVectorProvider();
    const collections = await provider.listCollections();

    // Resolve each collection independently: a single failing/racing entry
    // (e.g. one deleted between listCollections() and getCollection(), raising
    // CollectionNotFoundError) must not 500 the whole listing and hide every
    // healthy collection. Skip the failures instead.
    const settled = await Promise.all(
      collections.map(async (info) => {
        try {
          const collection = await provider.getCollection({ name: info.name });
          const count = await collection.count();
          const metadata = normalizeMetadata(info.metadata);
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
    .mutation(async ({ input }) => {
      const provider = getDefaultVectorProvider();
      const metadata: ProviderCollectionMetadata = {};
      if (input.embedding_model) {
        metadata.embedding_model = input.embedding_model;
      }
      if (input.embedding_provider) {
        metadata.embedding_provider = input.embedding_provider;
      }

      const collection = await provider.createCollection({
        name: input.name,
        metadata
      });

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
    .mutation(async ({ input }) => {
      const provider = getDefaultVectorProvider();
      let collection;
      try {
        collection = await provider.getCollection({ name: input.name });
      } catch (err) {
        rethrowAsTrpc(err);
      }

      const existing = normalizeMetadata(collection.metadata);
      const merged: ProviderCollectionMetadata = { ...existing };
      if (input.metadata) {
        Object.assign(merged, input.metadata);
      }

      const newName = input.rename ?? collection.name;
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
    .mutation(async ({ input }) => {
      const provider = getDefaultVectorProvider();
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
