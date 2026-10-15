/**
 * Browser-safe model-bytes resolution (inline data → asset → storage → uri).
 *
 * Moved here from `packages/video-nodes/src/nodes/model3d/render.ts` so the
 * Blender nodes and `RenderToImage` share it. It delegates to the runtime's
 * shared `loadMediaRefBytes`, which resolves `asset://<id>` and asset-id-only
 * refs (the shape the Model 3D constant stores), and keeps one difference: a
 * failed HTTP fetch throws with its status instead of reading as empty bytes.
 */

import { fetchExternalMedia, loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/**
 * The fields of a model ref this resolution reads. Mirrors
 * `Model3DRefLike` in video-nodes; node props arrive as `any`, so anything
 * outside this shape is a runtime edge the null checks below absorb.
 */
export interface ModelBytesRefLike {
  data?: Uint8Array | string;
  uri?: string;
  asset_id?: string | null;
}

/** Browser-safe model-bytes resolution (inline data → asset → storage → uri). */
export async function resolveModelBytes(
  model: ModelBytesRefLike | null | undefined,
  context?: ProcessingContext
): Promise<Uint8Array> {
  if (model === null || model === undefined) return new Uint8Array();

  const bytes = await loadMediaRefBytes(
    { data: model.data, uri: model.uri, asset_id: model.asset_id, type: "model3d" },
    context,
    {
      fetchHttp: async (uri) => {
        // Caller-supplied media uri — the media-ref egress policy decides.
        const res = await fetchExternalMedia(uri);
        if (!res.ok) {
          throw new Error(`Failed to fetch model (${res.status}): ${uri}`);
        }
        return new Uint8Array(await res.arrayBuffer());
      }
    }
  );
  return bytes ?? new Uint8Array();
}
