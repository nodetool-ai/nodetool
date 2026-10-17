/**
 * Openverse router — search Creative Commons and public-domain media and
 * import results as assets.
 *
 * `search` proxies the Openverse API so the optional client credentials stay
 * on the server. `import` looks each id up again, downloads the file through
 * `safeFetch`, and stores it with the license record under
 * `metadata.openverse`, so the asset keeps its attribution wherever it is used.
 */

import { Asset, Project } from "@nodetool-ai/models";
import { getMaxUploadBytes } from "@nodetool-ai/storage";
import {
  importInput,
  importOutput,
  searchInput,
  searchOutput,
  type OpenverseLicenseRecord
} from "@nodetool-ai/protocol/api-schemas/openverse.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { createAssetModelInterface } from "../../lib/asset-model-interface.js";
import { toAssetResponse } from "../../lib/asset-response.js";
import {
  OpenverseError,
  downloadOpenverseFile,
  getOpenverseItem,
  openverseAssetName,
  searchOpenverse
} from "../../lib/openverse.js";

function failure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const openverseRouter = router({
  search: protectedProcedure
    .input(searchInput)
    .output(searchOutput)
    .query(async ({ ctx, input }) => {
      try {
        return await searchOpenverse(ctx.userId, {
          mediaType: input.media_type,
          q: input.q,
          licenseType: input.license_type,
          category: input.category,
          page: input.page
        });
      } catch (error) {
        throwApiError(
          error instanceof OpenverseError
            ? ApiErrorCode.SERVICE_UNAVAILABLE
            : ApiErrorCode.INTERNAL_ERROR,
          failure(error)
        );
      }
    }),

  import: protectedProcedure
    .input(importInput)
    .output(importOutput)
    .mutation(async ({ ctx, input }) => {
      if (input.project_id && input.project_id !== "default") {
        if (!(await Project.findOwned(ctx.userId, input.project_id))) {
          throwApiError(ApiErrorCode.INVALID_INPUT, "Project not found");
        }
      }
      let parentId = ctx.userId;
      if (input.parent_id && input.parent_id !== ctx.userId) {
        const parent = await Asset.find(ctx.userId, input.parent_id);
        if (!parent || parent.content_type !== "folder") {
          throwApiError(ApiErrorCode.INVALID_INPUT, "Folder not found");
        }
        parentId = parent.id;
      }
      const maxBytes = getMaxUploadBytes();
      const assets = [];
      const failed: Array<{ id: string; error: string }> = [];
      for (const id of new Set(input.ids)) {
        try {
          const item = await getOpenverseItem(ctx.userId, input.media_type, id);
          const { bytes, contentType } = await downloadOpenverseFile(
            item,
            maxBytes
          );
          const record: OpenverseLicenseRecord = {
            id: item.id,
            media_type: item.media_type,
            title: item.title,
            creator: item.creator,
            creator_url: item.creator_url,
            license: item.license,
            license_version: item.license_version,
            license_url: item.license_url,
            attribution: item.attribution,
            landing_url: item.landing_url,
            source: item.source
          };
          const asset = await createAssetModelInterface({
            userId: ctx.userId,
            name: openverseAssetName(item, contentType),
            contentType,
            content: bytes,
            parentId,
            projectId: input.project_id ?? "default",
            metadata: { openverse: record }
          });
          assets.push(await toAssetResponse(asset));
        } catch (error) {
          failed.push({ id, error: failure(error) });
        }
      }
      return { assets, failed };
    })
});
