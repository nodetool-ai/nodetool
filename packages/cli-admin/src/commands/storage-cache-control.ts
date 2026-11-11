/**
 * `nodetool storage refresh-cache-control` — give existing asset objects the
 * `Cache-Control` new uploads carry.
 *
 * Supabase Storage stored `no-cache` on every object uploaded before uploads
 * set the header, and a signed URL cannot be revalidated, so browsers
 * downloaded those objects in full on every mount. The backend keeps the
 * header with the object, and neither Supabase nor S3 changes it without
 * rewriting the bytes, so each stale object is read and written back under the
 * same key with its content type.
 *
 * Safe to re-run: an object that already carries the header is skipped.
 */
import { Asset } from "@nodetool-ai/models";
import { loadAssetStorageConfig } from "@nodetool-ai/config";
import {
  assetObjectKey,
  createStorageAdapter,
  objectCacheControl,
  type StorageAdapter
} from "@nodetool-ai/storage";
import { getAssetFileName } from "@nodetool-ai/protocol";

interface RefreshCacheControlOptions {
  dryRun?: boolean;
  /** Refresh only this user's objects. */
  userId?: string;
  /** Objects rewritten at once. */
  concurrency?: number;
}

type RefreshStatus = "refreshed" | "current" | "missing" | "failed";

export interface RefreshCacheControlReport {
  scanned: number;
  refreshed: number;
  current: number;
  missing: number;
  failed: number;
  /** Bytes read back and written again (or that would be, on a dry run). */
  bytes: number;
  failures: Array<{ key: string; error: string }>;
}

const DEFAULT_CONCURRENCY = 8;

async function refreshOne(
  adapter: StorageAdapter,
  key: string,
  dryRun: boolean
): Promise<{ status: RefreshStatus; bytes: number }> {
  const uri = adapter.uriForKey(key);
  const stat = await adapter.stat(uri);
  if (!stat) return { status: "missing", bytes: 0 };
  if (stat.cacheControl === objectCacheControl()) {
    return { status: "current", bytes: 0 };
  }
  if (dryRun) return { status: "refreshed", bytes: stat.size };
  const data = await adapter.retrieve(uri);
  if (!data) return { status: "missing", bytes: 0 };
  await adapter.store(key, data, stat.contentType);
  return { status: "refreshed", bytes: data.byteLength };
}

export async function refreshStorageCacheControl(
  opts: RefreshCacheControlOptions = {}
): Promise<RefreshCacheControlReport> {
  const adapter = createStorageAdapter(loadAssetStorageConfig());
  const dryRun = opts.dryRun ?? false;
  const report: RefreshCacheControlReport = {
    scanned: 0,
    refreshed: 0,
    current: 0,
    missing: 0,
    failed: 0,
    bytes: 0,
    failures: []
  };

  // Each asset's bytes and its thumbnail. A thumbnail that was never
  // generated counts as missing.
  const keys: string[] = [];
  for (const asset of await Asset.allForMigration(opts.userId)) {
    if (asset.content_type === "folder") continue;
    keys.push(
      assetObjectKey(
        asset.user_id,
        getAssetFileName(asset.id, asset.content_type)
      ),
      assetObjectKey(asset.user_id, `${asset.id}_thumb.jpg`)
    );
  }

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < keys.length) {
      const key = keys[next++];
      report.scanned += 1;
      try {
        const { status, bytes } = await refreshOne(adapter, key, dryRun);
        report[status] += 1;
        report.bytes += bytes;
      } catch (err) {
        report.failed += 1;
        report.failures.push({
          key,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  };
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  await Promise.all(Array.from({ length: concurrency }, worker));
  return report;
}

export function formatRefreshCacheControlReport(
  report: RefreshCacheControlReport,
  dryRun: boolean
): string {
  const lines = report.failures.map(
    (failure) => `FAILED  ${failure.key}: ${failure.error}`
  );
  const megabytes = (report.bytes / (1024 * 1024)).toFixed(1);
  lines.push(
    `scanned ${report.scanned}, ${dryRun ? "would refresh" : "refreshed"} ` +
      `${report.refreshed} (${megabytes} MB), already current ${report.current}, ` +
      `absent ${report.missing}, failed ${report.failed}`
  );
  if (dryRun) {
    lines.push("Dry run. Nothing was written. Re-run without --dry-run.");
  }
  return lines.join("\n");
}
