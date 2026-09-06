/**
 * Browser-safe model-bytes resolution (inline data → storage → uri fetch).
 *
 * Moved here from `packages/video-nodes/src/nodes/model3d/render.ts` so the
 * Blender nodes and `RenderToImage` share it. Stays browser-safe: no
 * `node:path` at module scope — the one Node-only read (`file://`) loads
 * `node:fs/promises` and `node:url` through a dynamic import that only runs
 * when `IS_NODE` is set.
 */

import { IS_NODE } from "@nodetool-ai/config";
import { isNonEmptyString } from "@nodetool-ai/protocol";
import { fetchExternalMedia } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { base64ToBytes } from "./base64.js";

/**
 * The fields of a model ref this resolution reads. Mirrors
 * `Model3DRefLike` in video-nodes; node props arrive as `any`, so anything
 * outside this shape is a runtime edge the null checks below absorb.
 */
export interface ModelBytesRefLike {
  data?: Uint8Array | string;
  uri?: string;
}

/** Browser-safe model-bytes resolution (inline data → storage → uri fetch). */
export async function resolveModelBytes(
  model: ModelBytesRefLike | null | undefined,
  context?: ProcessingContext
): Promise<Uint8Array> {
  if (model === null || model === undefined) return new Uint8Array();
  const ref = model;

  if (ref.data instanceof Uint8Array && ref.data.length > 0) {
    return ref.data;
  }
  if (ref.data !== undefined && isNonEmptyString(ref.data)) {
    return base64ToBytes(ref.data);
  }

  const uri = ref.uri ?? "";
  if (uri === "") return new Uint8Array();

  if (uri.startsWith("data:")) {
    const comma = uri.indexOf(",");
    if (comma === -1) throw new Error(`Malformed data URI: ${uri.slice(0, 32)}…`);
    return base64ToBytes(uri.slice(comma + 1));
  }

  if (context?.storage) {
    const stored = await context.storage.retrieve(uri);
    if (stored && stored.length > 0) return new Uint8Array(stored);
  }

  if (uri.startsWith("file://") && IS_NODE) {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return new Uint8Array(await readFile(fileURLToPath(uri)));
  }

  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    // Caller-supplied media uri — the media-ref egress policy decides.
    const res = await fetchExternalMedia(uri);
    if (!res.ok) {
      throw new Error(`Failed to fetch model (${res.status}): ${uri}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  return new Uint8Array();
}
