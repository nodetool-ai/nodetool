/**
 * Library search over tRPC (docs/plans/library-search.md, D23): the command
 * palette and the search status and setup surfaces call these. Every
 * procedure runs the one query of `@nodetool-ai/search-services`.
 */

import {
  DEFAULT_LOCAL_EMBEDDING,
  libraryIndexStatus,
  readLibraryPassage,
  rebuildLibraryIndex,
  searchLibrary,
  setupLibrarySemanticSearch,
  type LibrarySearchRequest
} from "@nodetool-ai/search-services";
import {
  queryInput,
  queryOutput,
  readInput,
  readOutput,
  rebuildInput,
  rebuildOutput,
  setupInput,
  setupOutput,
  statusOutput
} from "@nodetool-ai/protocol/api-schemas/search.js";
import { ApiErrorCode } from "../../error-codes.js";
import { isCloudProfile } from "../../lib/cloud-profile.js";
import { throwApiError } from "../error-formatter.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

export const searchRouter = router({
  query: protectedProcedure
    .input(queryInput)
    .output(queryOutput)
    .query(async ({ ctx, input }) => {
      const request: LibrarySearchRequest = {
        userId: ctx.userId,
        query: input.query,
        mode: input.mode,
        limit: input.limit,
        cursor: input.cursor ?? null
      };
      if (input.kinds) request.kinds = input.kinds;
      if (input.project_id !== undefined) request.projectId = input.project_id;
      if (input.filter) request.filter = input.filter;
      const result = await searchLibrary(request);
      return {
        hits: result.hits.map((hit) => ({
          item_id: hit.itemId,
          resource_type: hit.resourceType,
          resource_id: hit.resourceId,
          kind: hit.kind,
          title: hit.title,
          project_id: hit.projectId,
          folder_path: hit.folderPath,
          content_type: hit.contentType,
          created_at: hit.createdAt,
          updated_at: hit.updatedAt,
          matches: hit.matches
        })),
        next_cursor: result.nextCursor,
        total: result.total,
        index: result.index
      };
    }),

  read: protectedProcedure
    .input(readInput)
    .output(readOutput)
    .query(async ({ ctx, input }) => {
      const result = await readLibraryPassage({
        userId: ctx.userId,
        id: input.id,
        locator: input.locator ?? undefined,
        before: input.before,
        after: input.after
      });
      if (!result.ok) throwApiError(ApiErrorCode.NOT_FOUND, result.error);
      return {
        item: {
          item_id: result.item.itemId,
          resource_type: result.item.resourceType,
          resource_id: result.item.resourceId,
          kind: result.item.kind,
          title: result.item.title
        },
        passages: result.passages,
        matched: result.matched,
        total: result.total
      };
    }),

  status: protectedProcedure.output(statusOutput).query(async ({ ctx }) => {
    const status = await libraryIndexStatus(ctx.userId);
    return {
      items: status.items,
      chunks: status.chunks,
      semantic: status.semantic,
      failures: status.failures.map((failure) => ({
        item_id: failure.itemId,
        title: failure.title,
        error: failure.error
      })),
      can_set_up: !isCloudProfile(),
      local_model: {
        provider: DEFAULT_LOCAL_EMBEDDING.provider,
        model: DEFAULT_LOCAL_EMBEDDING.model,
        download_megabytes: DEFAULT_LOCAL_EMBEDDING.downloadMegabytes
      }
    };
  }),

  rebuild: protectedProcedure
    .input(rebuildInput)
    .output(rebuildOutput)
    .mutation(({ ctx, input }) => rebuildLibraryIndex(ctx.userId, input.scope)),

  /**
   * Turn search by meaning on with one model, or off (D25). The choice is
   * the server's, so the cloud profile refuses it: the operator sets it there.
   */
  setup: protectedProcedure
    .input(setupInput)
    .output(setupOutput)
    .mutation(async ({ input }) => {
      if (isCloudProfile()) {
        throwApiError(ApiErrorCode.FORBIDDEN, "Search by meaning is set up by the operator of this server.");
      }
      await setupLibrarySemanticSearch(input.model);
      return { space: input.model ? `${input.model.provider}:${input.model.model}` : null };
    })
});
