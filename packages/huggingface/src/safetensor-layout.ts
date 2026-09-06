/**
 * Safetensors layout inspection helpers.
 *
 * Inspects only safetensors headers (8-byte LE length prefix + JSON blob) and
 * extracts tensor shapes from the header metadata. Never loads full weight
 * payloads. Classifies whether multiple files represent shards of the same
 * model or independent variants.
 */

import { readSafetensorsHeader } from "./safetensors-inspector.js";

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
  const header = readSafetensorsHeader(filePath);
  const allKeys = Object.keys(header);
  const sampled: Record<string, number[]> = {};

  for (const key of allKeys.slice(0, sampleLimit)) {
    const shape = header[key]?.shape;
    if (shape) {
      sampled[key] = shape;
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
