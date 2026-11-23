/**
 * The trail of blocks an outside write changed (document editor PRD R9).
 *
 * An agent edit applies at once. Each block it changed stays marked until
 * the user edits the block or dismisses the mark. A modified block can be
 * reverted to its content before the change, an inserted block removed, and
 * a deleted block restored.
 */
import type { MarkdownBlock, MarkdownBlockDocument } from "@nodetool-ai/protocol";

export type BlockChange =
  | { kind: "modified"; blockId: string; previous: string }
  | { kind: "inserted"; blockId: string }
  | {
      kind: "deleted";
      blockId: string;
      previous: MarkdownBlock;
      /** The block it followed, or null when it was first. */
      afterId: string | null;
    };

/** The changes that took `before` to `after`, in document order. */
export function diffBlockChanges(
  before: MarkdownBlockDocument,
  after: MarkdownBlockDocument
): BlockChange[] {
  const old = new Map(before.blocks.map((block) => [block.id, block]));
  const kept = new Set(after.blocks.map((block) => block.id));
  const changes: BlockChange[] = [];
  for (const block of after.blocks) {
    const previous = old.get(block.id);
    if (!previous) {
      changes.push({ kind: "inserted", blockId: block.id });
    } else if (previous.text !== block.text) {
      changes.push({ kind: "modified", blockId: block.id, previous: previous.text });
    }
  }
  before.blocks.forEach((block, index) => {
    if (!kept.has(block.id)) {
      changes.push({
        kind: "deleted",
        blockId: block.id,
        previous: block,
        afterId: index > 0 ? before.blocks[index - 1].id : null
      });
    }
  });
  return changes;
}

/**
 * Add `incoming` to the marks already shown. A block marked earlier keeps
 * its first content, so a revert goes back to the state before the first of
 * several writes. A block inserted and then changed stays inserted. A block
 * inserted and then deleted leaves no mark.
 */
export function mergeBlockChanges(
  existing: readonly BlockChange[],
  incoming: readonly BlockChange[]
): BlockChange[] {
  const byId = new Map(existing.map((change) => [change.blockId, change]));
  for (const change of incoming) {
    const earlier = byId.get(change.blockId);
    if (!earlier) {
      byId.set(change.blockId, change);
      continue;
    }
    if (earlier.kind === "inserted") {
      if (change.kind === "deleted") byId.delete(change.blockId);
      continue;
    }
    if (earlier.kind === "modified" && change.kind === "deleted") {
      byId.set(change.blockId, {
        ...change,
        previous: { ...change.previous, text: earlier.previous }
      });
    }
  }
  return [...byId.values()];
}

/**
 * Undo one change on `document`: a modified block gets its previous content,
 * an inserted block is removed, a deleted block comes back after the block
 * it followed (or first, when that block is gone too).
 */
export function revertBlockChange(
  document: MarkdownBlockDocument,
  change: BlockChange
): MarkdownBlockDocument {
  if (change.kind === "modified") {
    return {
      ...document,
      blocks: document.blocks.map((block) =>
        block.id === change.blockId ? { ...block, text: change.previous } : block
      )
    };
  }
  if (change.kind === "inserted") {
    return {
      ...document,
      blocks: document.blocks.filter((block) => block.id !== change.blockId)
    };
  }
  if (document.blocks.some((block) => block.id === change.blockId)) {
    return document;
  }
  const at =
    change.afterId === null
      ? 0
      : document.blocks.findIndex((block) => block.id === change.afterId) + 1;
  const blocks = [...document.blocks];
  const restored = { ...change.previous, gap: "\n\n" };
  if (at === blocks.length && at > 0) {
    // The last block's gap ends the file: the restored block takes it over.
    const last = blocks[at - 1];
    restored.gap = last.gap;
    blocks[at - 1] = { ...last, gap: "\n\n" };
  }
  blocks.splice(at, 0, restored);
  return { ...document, blocks };
}
