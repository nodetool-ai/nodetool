/**
 * Safetensors layout inspection helpers.
 *
 * Inspects only safetensors headers (8-byte LE length prefix + JSON blob) and
 * extracts tensor shapes from the header metadata. Never loads full weight
 * payloads. Classifies whether multiple files represent shards of the same
 * model or independent variants.
 */

import * as fs from "fs";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export enum SafetensorLayoutHint {
  EMPTY = "empty",
  SINGLE = "single",
  SHARDED_BUNDLE = "sharded_bundle",
  DISJOINT = "disjoint",
  MIXED = "mixed"
}

export interface SafetensorSummary {
  path: string;
  keyCount: number;
  /** Map from tensor key name to its shape (from header metadata). */
  sampledShapes: Record<string, number[]>;
}

// ---------------------------------------------------------------------------
// Internal: header reading
// ---------------------------------------------------------------------------

interface TensorHeaderEntry {
  dtype: string;
  shape: number[];
  data_offsets: [number, number];
}

/**
 * Read the JSON header from a .safetensors file.
 * Format: 8-byte LE uint64 header length, then UTF-8 JSON.
 */
function readHeader(filePath: string): Record<string, TensorHeaderEntry> {
  const fd = fs.openSync(filePath, "r");
  try {
    const lenBuf = Buffer.alloc(8);
    fs.readSync(fd, lenBuf, 0, 8, 0);
    const headerLen = Number(lenBuf.readBigUInt64LE(0));

    const headerBuf = Buffer.alloc(headerLen);
    fs.readSync(fd, headerBuf, 0, headerLen, 8);
    const parsed = JSON.parse(headerBuf.toString("utf-8"));

    const result: Record<string, TensorHeaderEntry> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key === "__metadata__") continue;
      result[key] = value as TensorHeaderEntry;
    }
    return result;
  } finally {
    fs.closeSync(fd);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read only the safetensors header and extract key count and sampled shapes.
 *
 * @param filePath - Path to a `.safetensors` file.
 * @param sampleLimit - Maximum number of keys to sample for shapes.
 * @returns Summary containing key count and sampled shapes.
 */
export function summarizeSafetensor(
  filePath: string,
  sampleLimit: number = 32
): SafetensorSummary {
  const header = readHeader(filePath);
  const allKeys = Object.keys(header);
  const sampled: Record<string, number[]> = {};

  for (const key of allKeys.slice(0, sampleLimit)) {
    const entry = header[key];
    if (entry && entry.shape) {
      sampled[key] = entry.shape;
    }
  }

  return {
    path: filePath,
    keyCount: allKeys.length,
    sampledShapes: sampled
  };
}

/**
 * Classify a set of safetensors files as shards or disjoint variants.
 *
 * Strategy (header-only):
 * - 0 files -> EMPTY
 * - 1 file  -> SINGLE
 * - Sampled key sets intersect & shapes match -> SHARDED_BUNDLE
 * - No intersection of sampled keys -> DISJOINT
 * - Otherwise -> MIXED
 *
 * @param paths - safetensors file paths to inspect.
 * @param sampleLimit - Number of keys to sample per file for shape comparison.
 * @returns Layout hint describing the relationship.
 */
export function classifySafetensorSet(
  paths: string[],
  sampleLimit: number = 32
): SafetensorLayoutHint {
  if (paths.length === 0) return SafetensorLayoutHint.EMPTY;
  if (paths.length === 1) return SafetensorLayoutHint.SINGLE;

  const summaries = paths.map((p) => summarizeSafetensor(p, sampleLimit));
  const sampledKeySets = summaries.map(
    (s) => new Set(Object.keys(s.sampledShapes))
  );
  const intersection = intersectSets(sampledKeySets);

  if (intersection.size > 0 && shapesAlign(summaries, intersection)) {
    return SafetensorLayoutHint.SHARDED_BUNDLE;
  }

  if (intersection.size === 0) {
    return SafetensorLayoutHint.DISJOINT;
  }

  return SafetensorLayoutHint.MIXED;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function intersectSets(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  const result = new Set(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    for (const item of result) {
      if (!sets[i].has(item)) {
        result.delete(item);
      }
    }
  }
  return result;
}

function shapesAlign(
  summaries: SafetensorSummary[],
  keys: Set<string>
): boolean {
  for (const key of keys) {
    const shapes = summaries.map((s) => s.sampledShapes[key]);
    if (shapes.some((s) => s === undefined)) return false;
    const first = JSON.stringify(shapes[0]);
    if (!shapes.every((s) => JSON.stringify(s) === first)) return false;
  }
  return true;
}
