/**
 * Collections router — migrated from REST `/api/collections*`.
 *
 * NOTE: the file-upload endpoint `POST /api/collections/:name/index` remains
 * on REST because its multipart/form-data body is not a natural fit for tRPC's
 * JSON link. The other CRUD + query endpoints move here.
 */

import { Workflow } from "@nodetool/models";
import {
  getVecStore,
  VecNotFoundError,
  type CollectionMetadata
} from "@nodetool/vectorstore";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import {
  listOutput,
  getInput,
  collectionResponse,
  createInput,
  updateInput,
  deleteInput,
  deleteOutput,
  queryInput,
  queryOutput
} from "@nodetool/protocol/api-schemas/collections.js";

/**
 * Normalize a CollectionMetadata (may contain `undefined` values per the
 * vectorstore type) to the wire schema (string | number | boolean only).
 */
function normalizeMetadata(
  metadata: CollectionMetadata | undefined
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (!metadata) return result;
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) result[key] = value;
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

/** Map VecNotFoundError → tRPC NOT_FOUND. Re-throws anything else. */
function rethrowAsTrpc(err: unknown): never {
  if (err instanceof VecNotFoundError) {
    throwApiError(ApiErrorCode.NOT_FOUND, "Collection not found");
  }
  throw err;
}

export const collectionsRouter = router({
  list: protectedProcedure.output(listOutput).query(async () => {
    const store = await getVecStore();
    const collections = await store.listCollections();

    const results = await Promise.all(
      collections.map(async (col) => {
        const count = await col.count();
        const metadata = normalizeMetadata(col.metadata);
        const workflowName = await resolveWorkflowName(
          typeof metadata.workflow === "string" ? metadata.workflow : undefined
        );
        return {
          name: col.name,
          count,
          metadata,
          workflow_name: workflowName
        };
      })
    );

    return { collections: results, count: results.length };
  }),

  get: protectedProcedure
    .input(getInput)
    .output(collectionResponse)
    .query(async ({ input }) => {
      const store = await getVecStore();
      try {
        const collection = await store.getCollection({ name: input.name });
        const count = await collection.count();
        return {
          name: collection.name,
          metadata: normalizeMetadata(collection.metadata),
          count
        };
      } catch (err) {
        rethrowAsTrpc(err);
      }
    }),

  create: protectedProcedure
    .input(createInput)
    .output(collectionResponse)
    .mutation(async ({ input }) => {
      const store = await getVecStore();
      const metadata: Record<string, string> = {};
      if (input.embedding_model) {
        metadata.embedding_model = input.embedding_model;
      }
      if (input.embedding_provider) {
        metadata.embedding_provider = input.embedding_provider;
      }

      const collection = await store.createCollection({
        name: input.name,
        metadata
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
      const store = await getVecStore();
      let collection;
      try {
        collection = await store.getCollection({ name: input.name });
      } catch (err) {
        rethrowAsTrpc(err);
      }

      const existing = normalizeMetadata(collection.metadata);
      const merged = { ...existing };
      if (input.metadata) {
        Object.assign(merged, input.metadata);
      }

      const newName = input.rename ?? collection.name;
      await collection.modify({ name: newName, metadata: merged });

      const count = await collection.count();
      return {
        name: newName,
        metadata: merged,
        count
      };
    }),

  delete: protectedProcedure
    .input(deleteInput)
    .output(deleteOutput)
    .mutation(async ({ input }) => {
      const store = await getVecStore();
      try {
        await store.deleteCollection({ name: input.name });
      } catch (err) {
        rethrowAsTrpc(err);
      }
      return { message: `Collection ${input.name} deleted successfully` };
    }),

  query: protectedProcedure
    .input(queryInput)
    .output(queryOutput)
    .query(async ({ input }) => {
      const store = await getVecStore();
      let collection;
      try {
        collection = await store.getCollection({ name: input.name });
      } catch (err) {
        rethrowAsTrpc(err);
      }
      const results = await collection.query({
        queryTexts: input.query_texts,
        nResults: input.n_results
      });
      return results;
    })
});
