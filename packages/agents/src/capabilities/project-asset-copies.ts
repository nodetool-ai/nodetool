/**
 * Documents reference only assets of their own project (PRD D10).
 *
 * An agent can hold the id of an asset from another project, Personal
 * included. A tool that stores such an id in a document copies the asset into
 * the document's project first and stores the copy's id, through the same
 * `copyAssetToProject` the asset pickers call. The copies are reported in the
 * tool result as `copied_assets`, so the agent learns the ids it should use.
 */
import type { AssetReferenceCopy } from "@nodetool-ai/asset-services/asset-references";
import type { CapabilityRun } from "./types.js";

export type { AssetReferenceCopy };

/**
 * `value` with every asset of another project replaced by its copy in
 * `projectId`, or an error to return from the tool. Nothing is stored when it
 * returns an error.
 */
export async function localizeProjectAssets<T>(
  run: CapabilityRun,
  projectId: string,
  value: T,
  extraKeys: readonly string[] = []
): Promise<{ value: T; copies: AssetReferenceCopy[] } | { error: string }> {
  const userId = run.context.userId;
  if (!userId) return { value, copies: [] };
  const { localizeAssetReferences } = await import(
    "@nodetool-ai/asset-services/asset-references"
  );
  try {
    return await localizeAssetReferences({ userId, projectId, value, extraKeys });
  } catch (error) {
    return {
      error:
        "An asset of another project could not be copied into this one, so " +
        `nothing was saved: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/** `result` with `copied_assets` added when the call made copies. */
export function withCopiedAssets<R extends Record<string, unknown>>(
  result: R,
  copies: readonly AssetReferenceCopy[]
): R {
  return copies.length > 0 ? { ...result, copied_assets: copies } : result;
}
