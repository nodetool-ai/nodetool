import { createHash } from "node:crypto";
import type { Outcome } from "./model.js";

export interface MutationShard {
  readonly index: number;
  readonly count: number;
}

export interface MutationObserver {
  selection(file: string, selectedIds: string[]): void;
  completed(id: string, outcome: Outcome): void;
}

/** Assign IDs independently of traversal order or the number of other sites. */
export function belongsToShard(mutationId: string, shard: MutationShard): boolean {
  const hash = createHash("sha256").update(mutationId).digest().readUInt32BE(0);
  return hash % shard.count === shard.index - 1;
}
