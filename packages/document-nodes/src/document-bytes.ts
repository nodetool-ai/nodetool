/**
 * One byte resolver for every document node.
 *
 * Document refs arrive with whatever URI the surface that produced them uses:
 * `asset://<id>` from the asset library and the chat composer, an
 * `/api/storage/<key>` URL from the editor's dropzone, an https signed URL on
 * S3/Supabase deployments, a `data:` URI, a `package://` example asset, or a
 * plain file path. `loadMediaRefBytes` already knows all of them — routing
 * every node through it keeps a PDF that opens in the editor from failing at
 * run time.
 */
import { loadMediaRefBytes, type MediaRefValue } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export type DocumentRefLike = MediaRefValue & {
  data?: Uint8Array | string | null;
};

function expandUser(p: string): string {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * Resolve a document ref to bytes, or null when nothing behind it can be read.
 * Falls back to the filesystem for relative and `~`-prefixed paths, which
 * `loadMediaRefBytes` deliberately does not touch.
 */
export async function resolveDocumentBytes(
  ref: DocumentRefLike,
  context?: ProcessingContext
): Promise<Buffer | null> {
  const bytes = await loadMediaRefBytes(ref, context);
  if (bytes) {
    return Buffer.from(bytes);
  }

  const uri = typeof ref.uri === "string" ? ref.uri : "";
  if (uri && !/^[a-z][a-z0-9+.-]*:\/\//i.test(uri) && !uri.startsWith("data:")) {
    try {
      return await fs.readFile(expandUser(uri));
    } catch {
      return null;
    }
  }

  return null;
}

/** Same as {@link resolveDocumentBytes}, but throws with the ref named. */
export async function requireDocumentBytes(
  ref: DocumentRefLike,
  context: ProcessingContext | undefined,
  label: string
): Promise<Buffer> {
  const bytes = await resolveDocumentBytes(ref, context);
  if (!bytes) {
    const where = ref?.uri || ref?.asset_id;
    throw new Error(
      where
        ? `Could not read ${label} from "${where}"`
        : `No ${label} data or URI provided`
    );
  }
  return bytes;
}
