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

    const results = await Promise.all(
      collections.map(async (info) => {
        const collection = await provider.getCollection({ name: info.name });
        const count = await collection.count();
        const metadata = normalizeMetadata(info.metadata);
        const workflowName = await resolveWorkflowName(
          typeof metadata.workflow === "string" ? metadata.workflow : undefined
        );
        return {
          name: info.name,
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
      const provider = getDefaultVectorProvider();
      try {
        const collection = await provider.getCollection({ name: input.name });
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
      return { message: `Collection ${input.name} deleted successfully` };
    }),

  query: protectedProcedure
    .input(queryInput)
    .output(queryOutput)
    .query(async ({ input }) => {
      const provider = getDefaultVectorProvider();
      let collection;
      try {
        collection = await provider.getCollection({ name: input.name });
      } catch (err) {
        rethrowAsTrpc(err);
      }

      const ids: string[][] = [];
      const documents: (string | null)[][] = [];
      const metadatas: (Record<string, unknown> | null)[][] = [];
      const distances: number[][] = [];

      for (const text of input.query_texts) {
        const matches = await collection.query({
          text,
          topK: input.n_results
        });
        ids.push(matches.map((m) => m.id));
        documents.push(matches.map((m) => m.document));
        metadatas.push(matches.map((m) => m.metadata));
        distances.push(matches.map((m) => m.distance));
      }

      return { ids, documents, metadatas, distances };
    })
});
