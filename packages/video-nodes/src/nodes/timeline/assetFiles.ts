/**
 * Local files for the assets a timeline render reads.
 *
 * A clip's `currentAssetId` is an asset id, but it can also be a URI: a shipped
 * example references its stills as `package://<pkg>/<path>`, which resolves
 * for every user without a per-user asset row. The file written for it is
 * named by a hash of the reference, never the reference itself — a URI's
 * slashes would name directories that do not exist in the work dir.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ProcessingContext } from "@nodetool-ai/runtime";

type AssetContext = Pick<ProcessingContext, "localPath" | "resolveAssetBytes">;

/** A file name for an asset reference: a hash, plus the reference's extension. */
export function assetFileName(assetId: string): string {
  const hash = createHash("sha256").update(assetId).digest("hex").slice(0, 24);
  const ext = /\.([a-z0-9]{1,5})$/i.exec(assetId.split(/[?#]/)[0] ?? "")?.[1];
  return ext ? `asset_${hash}.${ext.toLowerCase()}` : `asset_${hash}`;
}

/**
 * Resolve each asset once to a local file. A file the asset store already
 * keeps on this host is used in place, so a large source is never read into
 * memory; anything else is written into `workDir`.
 */
export class AssetFiles {
  private readonly files = new Map<string, Promise<string | null>>();

  constructor(
    private readonly workDir: string,
    private readonly context: AssetContext
  ) {}

  path(assetId: string): Promise<string | null> {
    let pending = this.files.get(assetId);
    if (!pending) {
      pending = this.write(assetId);
      this.files.set(assetId, pending);
    }
    return pending;
  }

  private async write(assetId: string): Promise<string | null> {
    const local = await this.context.localPath(assetId);
    if (local) return local;
    const { bytes } = await this.context.resolveAssetBytes(assetId);
    if (!bytes) return null;
    const file = path.join(this.workDir, assetFileName(assetId));
    await fs.writeFile(file, bytes);
    return file;
  }
}
