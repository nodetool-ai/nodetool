/**
 * Snapshot of the FAL Platform catalog + OpenAPI schemas.
 * Write with `--save-models-snapshot`, read with `--from-models-snapshot` to run codegen offline.
 */

import { readFile, writeFile } from "node:fs/promises";
import type { FalModelListItem } from "./platform-models.js";

export interface FalModelsSnapshotFile {
  schemaVersion: 1;
  /** ISO-8601 when the snapshot was written */
  writtenAt: string;
  /** Active catalog entries (inference + training) */
  catalog: FalModelListItem[];
  /** endpoint_id → OpenAPI 3.0 schema */
  openapi: Record<string, Record<string, unknown>>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export async function writeFalModelsSnapshot(
  absPath: string,
  catalog: FalModelListItem[],
  openapi: Map<string, Record<string, unknown>>,
): Promise<void> {
  const openapiObj: Record<string, Record<string, unknown>> = {};
  for (const [id, schema] of [...openapi.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    openapiObj[id] = schema;
  }
  const body: FalModelsSnapshotFile = {
    schemaVersion: 1,
    writtenAt: new Date().toISOString(),
    catalog,
    openapi: openapiObj,
  };
  await writeFile(absPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

export async function readFalModelsSnapshot(absPath: string): Promise<{
  catalog: FalModelListItem[];
  openapi: Map<string, Record<string, unknown>>;
}> {
  const text = await readFile(absPath, "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Invalid models snapshot (not an object): ${absPath}`);
  }
  if (parsed.schemaVersion !== 1) {
    throw new Error(
      `Invalid models snapshot schemaVersion (expected 1): ${absPath}`,
    );
  }
  const catalog = parsed.catalog;
  if (!Array.isArray(catalog)) {
    throw new Error(`Invalid models snapshot (catalog not an array): ${absPath}`);
  }
  const openapiRaw = parsed.openapi;
  if (!isRecord(openapiRaw)) {
    throw new Error(`Invalid models snapshot (openapi not an object): ${absPath}`);
  }
  const openapi = new Map<string, Record<string, unknown>>();
  for (const [id, schema] of Object.entries(openapiRaw)) {
    if (isRecord(schema)) {
      openapi.set(id, schema);
    }
  }
  return { catalog: catalog as FalModelListItem[], openapi };
}
