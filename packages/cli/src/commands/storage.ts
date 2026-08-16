/**
 * `nodetool storage migrate-keys` — move asset objects from the flat
 * `<assetId>.<ext>` layout under their owner's prefix, `<userId>/<assetId>.<ext>`.
 *
 * The owner prefix is what makes the tenant boundary enforceable outside the
 * server process (a Supabase Storage RLS policy or an S3 bucket policy can
 * match on it), so a deployment on a cloud backend needs this to have run.
 * The local file backend keeps working without it — `/api/storage` falls back
 * to the legacy path — but should be migrated too so the layouts agree.
 *
 * Safe to re-run: an object already at its prefixed key is left alone, and
 * the legacy object is only removed once the new one reads back.
 */
import { Asset } from "@nodetool-ai/models";
import { loadAssetStorageConfig } from "@nodetool-ai/config";
import {
  assetObjectKey,
  createStorageAdapter,
  type StorageAdapter
} from "@nodetool-ai/storage";
import { getAssetFileName } from "@nodetool-ai/websocket";

export interface MigrateKeysOptions {
  dryRun?: boolean;
  /** Migrate only this user's objects. */
  userId?: string;
  json?: boolean;
}

export interface MigrateKeysReport {
  scanned: number;
  moved: number;
  alreadyMigrated: number;
  missing: number;
  failed: number;
  entries: Array<{
    assetId: string;
    from: string;
    to: string;
    status: "moved" | "already" | "missing" | "failed";
    error?: string;
  }>;
}

/** Every object belonging to an asset: the bytes plus its thumbnail. */
function fileNamesFor(assetId: string, contentType: string): string[] {
  return [getAssetFileName(assetId, contentType), `${assetId}_thumb.jpg`];
}

async function migrateOne(
  adapter: StorageAdapter,
  userId: string,
  fileName: string,
  dryRun: boolean
): Promise<"moved" | "already" | "missing" | "failed"> {
  const target = assetObjectKey(userId, fileName);
  if (await adapter.exists(adapter.uriForKey(target))) return "already";
  if (!(await adapter.exists(adapter.uriForKey(fileName)))) return "missing";
  if (dryRun) return "moved";

  const bytes = await adapter.retrieve(adapter.uriForKey(fileName));
  if (!bytes) return "missing";
  await adapter.store(target, bytes);
  // Only drop the original once the copy reads back, so an interrupted run
  // leaves the asset readable at one key or the other, never neither.
  if (!(await adapter.exists(adapter.uriForKey(target)))) return "failed";
  await adapter.delete(adapter.uriForKey(fileName));
  return "moved";
}

export async function migrateStorageKeys(
  opts: MigrateKeysOptions = {}
): Promise<MigrateKeysReport> {
  const adapter = createStorageAdapter(loadAssetStorageConfig());
  const dryRun = opts.dryRun ?? false;
  const report: MigrateKeysReport = {
    scanned: 0,
    moved: 0,
    alreadyMigrated: 0,
    missing: 0,
    failed: 0,
    entries: []
  };

  const assets = await Asset.allForMigration(opts.userId);
  for (const asset of assets) {
    if (asset.content_type === "folder") continue;
    for (const fileName of fileNamesFor(asset.id, asset.content_type)) {
      report.scanned += 1;
      const to = assetObjectKey(asset.user_id, fileName);
      let status: "moved" | "already" | "missing" | "failed";
      let error: string | undefined;
      try {
        status = await migrateOne(adapter, asset.user_id, fileName, dryRun);
      } catch (err) {
        status = "failed";
        error = err instanceof Error ? err.message : String(err);
      }

      if (status === "moved") report.moved += 1;
      else if (status === "already") report.alreadyMigrated += 1;
      else if (status === "missing") report.missing += 1;
      else report.failed += 1;

      // A thumbnail that was never generated is the common "missing" case and
      // is not worth a line of output.
      if (status !== "missing") {
        const entry: (typeof report.entries)[number] = {
          assetId: asset.id,
          from: fileName,
          to,
          status
        };
        if (error) {
          entry.error = error;
        }
        report.entries.push(entry);
      }
    }
  }

  return report;
}

export function formatMigrateKeysReport(
  report: MigrateKeysReport,
  dryRun: boolean
): string {
  const lines: string[] = [];
  for (const entry of report.entries) {
    if (entry.status === "failed") {
      lines.push(`FAILED  ${entry.from} -> ${entry.to}: ${entry.error ?? ""}`);
    } else if (entry.status === "moved") {
      lines.push(
        `${dryRun ? "would move" : "moved"}  ${entry.from} -> ${entry.to}`
      );
    }
  }
  lines.push("");
  lines.push(
    `scanned ${report.scanned}, ${dryRun ? "would move" : "moved"} ${report.moved}, ` +
      `already migrated ${report.alreadyMigrated}, absent ${report.missing}, failed ${report.failed}`
  );
  if (dryRun) {
    lines.push("Dry run — nothing was written. Re-run without --dry-run.");
  }
  return lines.join("\n");
}
