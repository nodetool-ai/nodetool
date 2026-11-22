/**
 * Text documents router: the stored versions of a Markdown document
 * (docs/document-editor/prd.md, R11). The editor lists them, saves one on
 * "Save version" and at an interval while the user edits, and restores one.
 * Reads and writes go through `@nodetool-ai/asset-services/text-documents`,
 * the service the `text-documents` agent capabilities call.
 */

import { TextDocumentVersion, textDocumentContentHash } from "@nodetool-ai/models";
import {
  TextDocumentError,
  readTextDocument,
  recordTextDocumentVersion,
  requireTextDocument,
  restoreTextDocumentVersion
} from "@nodetool-ai/asset-services/text-documents";
import {
  createTextDocumentVersionInput,
  createTextDocumentVersionOutput,
  getTextDocumentVersionInput,
  getTextDocumentVersionOutput,
  listTextDocumentVersionsOutput,
  restoreTextDocumentVersionInput,
  restoreTextDocumentVersionOutput,
  textDocumentRef
} from "@nodetool-ai/protocol/api-schemas/text-documents.js";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

function versionResponse(version: TextDocumentVersion) {
  return {
    version: version.version,
    name: version.name,
    save_type: version.save_type,
    cause_id: version.cause_id,
    created_at: version.created_at,
    content_hash: version.content_hash
  };
}

async function loadDocument(userId: string, assetId: string) {
  try {
    return await requireTextDocument(userId, assetId);
  } catch (error) {
    if (error instanceof TextDocumentError) {
      throwApiError(ApiErrorCode.NOT_FOUND, error.message);
    }
    throw error;
  }
}

export const textDocumentsRouter = router({
  versions: protectedProcedure
    .input(textDocumentRef)
    .output(listTextDocumentVersionsOutput)
    .query(async ({ ctx, input }) => {
      const asset = await loadDocument(ctx.userId, input.asset_id);
      const versions = await TextDocumentVersion.listForAsset(asset.id);
      return { versions: versions.map(versionResponse) };
    }),

  version: protectedProcedure
    .input(getTextDocumentVersionInput)
    .output(getTextDocumentVersionOutput)
    .query(async ({ ctx, input }) => {
      const asset = await loadDocument(ctx.userId, input.asset_id);
      const version = await TextDocumentVersion.findByVersion(asset.id, input.version);
      if (!version) {
        throwApiError(ApiErrorCode.NOT_FOUND, `Version ${input.version} not found`);
      }
      return { ...versionResponse(version), content: version.content };
    }),

  createVersion: protectedProcedure
    .input(createTextDocumentVersionInput)
    .output(createTextDocumentVersionOutput)
    .mutation(async ({ ctx, input }) => {
      const asset = await loadDocument(ctx.userId, input.asset_id);
      const content = await readTextDocument(asset);
      if (input.save_type === "autosave") {
        // An interval version of unchanged content would only fill the list.
        const [newest] = await TextDocumentVersion.listForAsset(asset.id);
        if (newest?.content_hash === textDocumentContentHash(content)) {
          return { version: null };
        }
      }
      const version = await recordTextDocumentVersion(
        asset,
        content,
        { saveType: input.save_type },
        input.name ?? null
      );
      return { version: versionResponse(version) };
    }),

  restore: protectedProcedure
    .input(restoreTextDocumentVersionInput)
    .output(restoreTextDocumentVersionOutput)
    .mutation(async ({ ctx, input }) => {
      const asset = await loadDocument(ctx.userId, input.asset_id);
      try {
        const { asset: saved, restored } = await restoreTextDocumentVersion(
          asset,
          input.version
        );
        return { restored_version: restored.version, updated_at: saved.updated_at };
      } catch (error) {
        if (error instanceof TextDocumentError) {
          throwApiError(ApiErrorCode.NOT_FOUND, error.message);
        }
        throw error;
      }
    })
});
