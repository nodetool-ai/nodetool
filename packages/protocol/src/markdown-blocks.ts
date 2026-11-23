/**
 * The block model of a Markdown document (document editor PRD, R4 and R20 to
 * R22).
 *
 * A document is a Markdown file. Its blocks are its top-level elements: a
 * heading, paragraph, list, table, code block, quote, image, rule or raw
 * section. Blocks are the unit for byte-stable saves, block ids, merges and,
 * later, change marks and reverts.
 *
 * - {@link splitMarkdownBlocks} cuts a file into blocks. Each block keeps the
 *   exact bytes it was cut from, so joining the blocks gives the file back.
 * - {@link identifyBlocks} gives each block a stable id by matching it with a
 *   previous version: content hash first, then position and text similarity.
 * - {@link diffBlocks} and {@link applyBlockOps} are the one operation set the
 *   editor, the agent tools and the file reconcile share: create, delete, move
 *   and set content, each with its author.
 * - {@link convertOutsideWrite} turns a write that did not come through the
 *   editor into block operations against the content NodeTool last saved.
 * - {@link mergeBlockDocuments} merges an outside write into a dirty draft per
 *   block. The draft wins where both changed a block (ADR 0001).
 *
 * Pure and dependency-free, so the web editor, the server tools and the tests
 * read a document the same way.
 */

/** What a block is, as far as splitting can tell from its first line. */
export type MarkdownBlockKind =
  | "front_matter"
  | "fence"
  | "heading"
  | "rule"
  | "list"
  | "html"
  | "indented_code"
  | "definition"
  | "table"
  | "quote"
  | "paragraph";

/** One block as cut from the file. */
export interface MarkdownBlockSource {
  /** The block's bytes, without the line break that ends it. */
  text: string;
  /** The line break after the block and any blank lines after that. */
  gap: string;
  kind: MarkdownBlockKind;
}

/** A block with its stable id. */
export interface MarkdownBlock extends MarkdownBlockSource {
  id: string;
}

/** A Markdown file as blocks. `leading` is the blank space before the first. */
export interface MarkdownBlockDocument {
  leading: string;
  blocks: MarkdownBlock[];
}

const LINE = /[^\n]*\n|[^\n]+$/g;
const BLANK = /^[ \t]*\r?\n?$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const ATX_HEADING = /^ {0,3}#{1,6}(?:[ \t]|\r?\n|$)/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*\r?\n?$/;
const LIST_ITEM = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|\r?\n|$)/;
const INDENTED = /^(?: {4}|\t)/;
const CONTINUATION = /^(?: {2,}|\t)/;
const HTML_START = /^ {0,3}<(?:!--|[a-zA-Z/!?])/;
const DEFINITION = /^ {0,3}\[[^\]]+\]:[ \t]*\S/;
const TABLE_ROW = /^ {0,3}\|/;
const QUOTE = /^ {0,3}>/;

const isBlank = (line: string): boolean => BLANK.test(line);

const closesFence = (line: string, open: string): boolean => {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*\r?\n?$/.exec(line);
  return match !== null && match[1][0] === open[0] && match[1].length >= open.length;
};

/** The line break at the end of `line`, if any. */
const lineBreak = (line: string): string =>
  line.endsWith("\r\n") ? "\r\n" : line.endsWith("\n") ? "\n" : "";

/** Index of the first non-blank line at or after `from`, or `lines.length`. */
const nextNonBlank = (lines: readonly string[], from: number): number => {
  let index = from;
  while (index < lines.length && isBlank(lines[index])) index++;
  return index;
};

/** Index past the last line of the block starting at `start`, and its kind. */
function blockEnd(
  lines: readonly string[],
  start: number
): { end: number; kind: MarkdownBlockKind } {
  const first = lines[start];
  const fence = FENCE_OPEN.exec(first);
  if (fence) {
    let index = start + 1;
    while (index < lines.length && !closesFence(lines[index], fence[1])) index++;
    return { end: Math.min(index + 1, lines.length), kind: "fence" };
  }
  if (ATX_HEADING.test(first)) return { end: start + 1, kind: "heading" };
  if (RULE.test(first)) return { end: start + 1, kind: "rule" };
  if (INDENTED.test(first)) {
    let index = start + 1;
    while (index < lines.length) {
      if (isBlank(lines[index])) {
        const next = nextNonBlank(lines, index);
        if (next >= lines.length || !INDENTED.test(lines[next])) break;
        index = next;
        continue;
      }
      if (!INDENTED.test(lines[index])) break;
      index++;
    }
    return { end: index, kind: "indented_code" };
  }
  if (LIST_ITEM.test(first)) {
    let index = start + 1;
    while (index < lines.length) {
      const line = lines[index];
      if (isBlank(line)) {
        // A loose list continues across blank lines when the next line is
        // another item or indented content of the current one.
        const next = nextNonBlank(lines, index);
        if (
          next >= lines.length ||
          !(LIST_ITEM.test(lines[next]) || CONTINUATION.test(lines[next]))
        ) {
          break;
        }
        index = next;
        continue;
      }
      if (
        !CONTINUATION.test(line) &&
        !LIST_ITEM.test(line) &&
        (ATX_HEADING.test(line) || FENCE_OPEN.test(line) || RULE.test(line))
      ) {
        break;
      }
      // A fence inside an item may hold blank lines; keep it whole.
      const innerFence = FENCE_OPEN.exec(line.replace(/^\s*(?:[-*+]|\d{1,9}[.)])?\s*/, ""));
      if (innerFence) {
        index++;
        while (index < lines.length) {
          const inner = lines[index].replace(/^\s+/, "");
          index++;
          if (closesFence(inner, innerFence[1])) break;
        }
        continue;
      }
      index++;
    }
    return { end: index, kind: "list" };
  }
  if (/^ {0,3}<!--/.test(first)) {
    let index = start;
    while (index < lines.length && !lines[index].includes("-->")) index++;
    return { end: Math.min(index + 1, lines.length), kind: "html" };
  }
  let kind: MarkdownBlockKind = "paragraph";
  if (HTML_START.test(first)) kind = "html";
  else if (DEFINITION.test(first)) kind = "definition";
  else if (TABLE_ROW.test(first) || (start + 1 < lines.length && /^ {0,3}\|?[ \t]*:?-{3,}/.test(lines[start + 1]) && first.includes("|"))) kind = "table";
  else if (QUOTE.test(first)) kind = "quote";
  let index = start + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (isBlank(line)) break;
    if (kind !== "html" && (FENCE_OPEN.test(line) || ATX_HEADING.test(line))) break;
    index++;
  }
  if (kind === "definition") {
    for (let line = start; line < index; line++) {
      if (!DEFINITION.test(lines[line]) && !CONTINUATION.test(lines[line])) {
        kind = "paragraph";
        break;
      }
    }
  }
  return { end: index, kind };
}

/**
 * Cut a Markdown file into blocks. Joining the result with
 * {@link joinMarkdownBlocks} returns `source` byte for byte.
 */
export function splitMarkdownBlocks(source: string): {
  leading: string;
  blocks: MarkdownBlockSource[];
} {
  const lines = source.match(LINE) ?? [];
  const firstContent = nextNonBlank(lines, 0);
  const leading = lines.slice(0, firstContent).join("");
  const blocks: MarkdownBlockSource[] = [];
  let index = firstContent;

  // YAML front matter is only front matter on the file's first line.
  if (index === 0 && lines.length > 0 && /^---[ \t]*\r?\n$/.test(lines[0] ?? "")) {
    let close = 1;
    while (close < lines.length && !/^(?:---|\.\.\.)[ \t]*\r?\n?$/.test(lines[close])) close++;
    if (close < lines.length) {
      index = pushBlock(lines, 0, close + 1, "front_matter", blocks);
    }
  }

  while (index < lines.length) {
    const { end, kind } = blockEnd(lines, index);
    index = pushBlock(lines, index, Math.max(end, index + 1), kind, blocks);
  }
  return { leading, blocks };
}

/** Append lines `[start, end)` as one block plus its gap; return the next start. */
function pushBlock(
  lines: readonly string[],
  start: number,
  end: number,
  kind: MarkdownBlockKind,
  blocks: MarkdownBlockSource[]
): number {
  const body = lines.slice(start, end).join("");
  const last = lines[end - 1];
  const breakChars = lineBreak(last);
  const after = nextNonBlank(lines, end);
  blocks.push({
    text: body.slice(0, body.length - breakChars.length),
    gap: breakChars + lines.slice(end, after).join(""),
    kind
  });
  return after;
}

/** Join blocks back into a file. */
export function joinMarkdownBlocks(
  leading: string,
  blocks: readonly Pick<MarkdownBlockSource, "text" | "gap">[]
): string {
  let out = leading;
  for (const block of blocks) out += block.text + block.gap;
  return out;
}

/** The file a block document stands for. */
export function serializeMarkdownBlocks(document: MarkdownBlockDocument): string {
  return joinMarkdownBlocks(document.leading, document.blocks);
}

/**
 * A 53-bit content hash of a block's text, as 14 hex digits. Not for security:
 * it only has to tell blocks apart when ids are matched.
 */
export function hashMarkdownBlock(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(14, "0");
}

/** What a stored block id cache holds per block. `text` enables similarity. */
export interface KnownMarkdownBlock {
  id: string;
  hash?: string;
  text?: string;
}

const words = (text: string): Set<string> =>
  new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

/** Dice coefficient of the two texts' word sets, from 0 to 1. */
export function markdownBlockSimilarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (left.size === 0 && right.size === 0) return a.trim() === b.trim() ? 1 : 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return (2 * shared) / (left.size + right.size);
}

/** Similarity a positional match needs when both texts are known. */
const SIMILAR = 0.5;
/** Above this many cells the exact LCS gives way to a greedy hash match. */
const LCS_CELL_LIMIT = 4_000_000;

/** Index pairs of a longest common subsequence of two hash lists. */
function commonSubsequence(
  left: readonly string[],
  right: readonly string[]
): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) {
    pairs.push([start, start]);
    start++;
  }
  let leftEnd = left.length;
  let rightEnd = right.length;
  const tail: Array<[number, number]> = [];
  while (leftEnd > start && rightEnd > start && left[leftEnd - 1] === right[rightEnd - 1]) {
    leftEnd--;
    rightEnd--;
    tail.push([leftEnd, rightEnd]);
  }
  const rows = leftEnd - start;
  const cols = rightEnd - start;
  if (rows > 0 && cols > 0) {
    if (rows * cols <= LCS_CELL_LIMIT) {
      const width = cols + 1;
      const table = new Uint32Array((rows + 1) * width);
      for (let i = rows - 1; i >= 0; i--) {
        for (let j = cols - 1; j >= 0; j--) {
          table[i * width + j] =
            left[start + i] === right[start + j]
              ? table[(i + 1) * width + j + 1] + 1
              : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
        }
      }
      let i = 0;
      let j = 0;
      while (i < rows && j < cols) {
        if (left[start + i] === right[start + j]) {
          pairs.push([start + i, start + j]);
          i++;
          j++;
        } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
          i++;
        } else {
          j++;
        }
      }
    } else {
      // Too large for the table: take in-order matches of unique hashes.
      const counts = new Map<string, number>();
      for (let i = start; i < leftEnd; i++) counts.set(left[i], (counts.get(left[i]) ?? 0) + 1);
      const position = new Map<string, number>();
      for (let i = start; i < leftEnd; i++) if (counts.get(left[i]) === 1) position.set(left[i], i);
      let last = start - 1;
      for (let j = start; j < rightEnd; j++) {
        const i = position.get(right[j]);
        if (i !== undefined && i > last) {
          pairs.push([i, j]);
          last = i;
        }
      }
    }
  }
  return pairs.concat(tail.reverse());
}

/**
 * Give each block of `next` an id (R20). A block keeps the id of the
 * previous block with the same content hash, preferring matches that keep the
 * order; then a block takes the id of the previous block in the same position
 * between two matched blocks when their texts are similar (or, when the
 * previous texts are unknown, when both sides of that gap have the same
 * number of blocks). Every other block is new.
 */
export function identifyBlocks(
  previous: readonly KnownMarkdownBlock[],
  next: readonly MarkdownBlockSource[],
  newId: () => string
): MarkdownBlock[] {
  const previousHashes = previous.map((block) =>
    block.hash ?? hashMarkdownBlock(block.text ?? "")
  );
  const nextHashes = next.map((block) => hashMarkdownBlock(block.text));
  const assigned: Array<string | null> = next.map(() => null);
  const used = new Set<number>();

  const anchors = commonSubsequence(previousHashes, nextHashes);
  for (const [i, j] of anchors) {
    assigned[j] = previous[i].id;
    used.add(i);
  }

  // Moved blocks: the same content elsewhere keeps its id.
  const freeByHash = new Map<string, number[]>();
  previousHashes.forEach((hash, i) => {
    if (used.has(i)) return;
    const list = freeByHash.get(hash) ?? [];
    list.push(i);
    freeByHash.set(hash, list);
  });
  nextHashes.forEach((hash, j) => {
    if (assigned[j] !== null) return;
    const list = freeByHash.get(hash);
    const i = list?.shift();
    if (i === undefined) return;
    assigned[j] = previous[i].id;
    used.add(i);
  });

  // Edited blocks: pair by position inside each gap between anchors.
  const bounds: Array<[number, number]> = [[-1, -1], ...anchors, [previous.length, next.length]];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const left = [];
    for (let i = bounds[k][0] + 1; i < bounds[k + 1][0]; i++) if (!used.has(i)) left.push(i);
    const right = [];
    for (let j = bounds[k][1] + 1; j < bounds[k + 1][1]; j++) if (assigned[j] === null) right.push(j);
    const textsKnown = left.every((i) => previous[i].text !== undefined);
    if (!textsKnown && left.length !== right.length) continue;
    let cursor = 0;
    for (const j of right) {
      while (cursor < left.length) {
        const i = left[cursor];
        const text = previous[i].text;
        if (
          text === undefined ||
          next[j].kind === "rule" ||
          markdownBlockSimilarity(text, next[j].text) >= SIMILAR
        ) {
          if (text === undefined && next[j].kind === "rule") break;
          assigned[j] = previous[i].id;
          used.add(i);
          cursor++;
          break;
        }
        // The previous block may have been deleted; try the next one, but
        // never pair against order.
        if (textsKnown && cursor + 1 < left.length && markdownBlockSimilarity(previous[left[cursor + 1]].text ?? "", next[j].text) >= SIMILAR) {
          cursor++;
          continue;
        }
        break;
      }
    }
  }

  const seen = new Set<string>();
  return next.map((block, j) => {
    let id = assigned[j];
    if (id === null || seen.has(id)) id = newId();
    seen.add(id);
    return { ...block, id };
  });
}

/** Who made a block operation (R21). */
export interface MarkdownBlockAuthor {
  kind: "person" | "agent" | "workflow" | "outside";
  /** Agent turn id, job id or user id, when the writer has one. */
  id?: string;
}

/**
 * One block operation (R21). Position is given by `after`, the id of the
 * block the operated block follows, or null for the first position. Anchors
 * survive concurrent edits elsewhere, where indexes do not.
 */
export type MarkdownBlockOp =
  | {
      op: "create";
      id: string;
      after: string | null;
      text: string;
      gap: string;
      kind: MarkdownBlockKind;
      author: MarkdownBlockAuthor;
    }
  | { op: "delete"; id: string; author: MarkdownBlockAuthor }
  | { op: "move"; id: string; after: string | null; author: MarkdownBlockAuthor }
  | {
      op: "set_content";
      id: string;
      text: string;
      gap: string;
      kind: MarkdownBlockKind;
      author: MarkdownBlockAuthor;
    };

/** Indexes (into `values`) of a longest increasing subsequence. */
function increasingSubsequence(values: readonly number[]): Set<number> {
  const tails: number[] = [];
  const parent: number[] = new Array(values.length).fill(-1);
  for (let index = 0; index < values.length; index++) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (values[tails[mid]] < values[index]) low = mid + 1;
      else high = mid;
    }
    if (low > 0) parent[index] = tails[low - 1];
    tails[low] = index;
  }
  const kept = new Set<number>();
  let cursor = tails.length > 0 ? tails[tails.length - 1] : -1;
  while (cursor !== -1) {
    kept.add(cursor);
    cursor = parent[cursor];
  }
  return kept;
}

/** The operations that turn `base` into `next`, matched by block id. */
export function diffBlocks(
  base: readonly MarkdownBlock[],
  next: readonly MarkdownBlock[],
  author: MarkdownBlockAuthor
): MarkdownBlockOp[] {
  const baseIndex = new Map(base.map((block, index) => [block.id, index]));
  const nextIds = new Set(next.map((block) => block.id));
  const ops: MarkdownBlockOp[] = [];
  for (const block of base) {
    if (!nextIds.has(block.id)) ops.push({ op: "delete", id: block.id, author });
  }
  const common = next.filter((block) => baseIndex.has(block.id));
  const order = common.map((block) => baseIndex.get(block.id) ?? 0);
  const stay = increasingSubsequence(order);
  const staying = new Set(common.filter((_, index) => stay.has(index)).map((block) => block.id));
  next.forEach((block, index) => {
    const after = index === 0 ? null : next[index - 1].id;
    const before = baseIndex.get(block.id);
    if (before === undefined) {
      ops.push({ op: "create", id: block.id, after, text: block.text, gap: block.gap, kind: block.kind, author });
      return;
    }
    if (!staying.has(block.id)) ops.push({ op: "move", id: block.id, after, author });
    const old = base[before];
    if (old.text !== block.text || old.gap !== block.gap) {
      ops.push({ op: "set_content", id: block.id, text: block.text, gap: block.gap, kind: block.kind, author });
    }
  });
  return ops;
}

/**
 * Apply operations in order. An operation on a block that is not there is
 * skipped; an anchor that is not there places the block first.
 */
export function applyBlockOps(
  blocks: readonly MarkdownBlock[],
  ops: readonly MarkdownBlockOp[]
): MarkdownBlock[] {
  const list = [...blocks];
  const indexOf = (id: string): number => list.findIndex((block) => block.id === id);
  const insertAfter = (block: MarkdownBlock, after: string | null): void => {
    const anchor = after === null ? -1 : indexOf(after);
    list.splice(anchor + 1, 0, block);
  };
  for (const op of ops) {
    const at = indexOf(op.id);
    switch (op.op) {
      case "create":
        if (at !== -1) break;
        insertAfter({ id: op.id, text: op.text, gap: op.gap, kind: op.kind }, op.after);
        break;
      case "delete":
        if (at !== -1) list.splice(at, 1);
        break;
      case "move": {
        if (at === -1) break;
        const [block] = list.splice(at, 1);
        insertAfter(block, op.after);
        break;
      }
      case "set_content":
        if (at !== -1) list[at] = { ...list[at], text: op.text, gap: op.gap, kind: op.kind };
        break;
    }
  }
  return list;
}

/**
 * Turn a write that did not come through the editor into block operations
 * (R22). `source` is compared with `base`, the content NodeTool last saved; an
 * unchanged block produces no operation and keeps its id.
 */
export function convertOutsideWrite(
  base: MarkdownBlockDocument,
  source: string,
  author: MarkdownBlockAuthor,
  newId: () => string
): { document: MarkdownBlockDocument; ops: MarkdownBlockOp[] } {
  const split = splitMarkdownBlocks(source);
  const blocks = identifyBlocks(base.blocks, split.blocks, newId);
  return {
    document: { leading: split.leading, blocks },
    ops: diffBlocks(base.blocks, blocks, author)
  };
}

/** A block both sides changed. The draft's value was kept. */
export interface MarkdownBlockConflict {
  blockId: string;
  /** "modified": both changed the content. "deleted": one side deleted it. */
  reason: "modified" | "deleted";
  /** The draft's text, or null when the draft deleted the block. */
  local: string | null;
  /** The refused outside text, or null when the outside write deleted it. */
  external: string | null;
}

const sameContent = (a: MarkdownBlock | undefined, b: MarkdownBlock | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && a.text === b.text && a.gap === b.gap);

/**
 * Three-way merge of an outside write into a draft, per block (R5, ADR 0001).
 * A block only one side changed takes that side's value. A block both sides
 * changed keeps the draft's value and is listed as a conflict. Blocks the
 * outside write created are placed after their predecessor there.
 *
 * `nextBase` is the outside document, except that a refused block keeps the
 * base value it had, so the next outside write still reads it as changed.
 */
export function mergeBlockDocuments(
  base: MarkdownBlockDocument,
  local: MarkdownBlockDocument,
  remote: MarkdownBlockDocument
): {
  document: MarkdownBlockDocument;
  conflicts: MarkdownBlockConflict[];
  nextBase: MarkdownBlockDocument;
} {
  const baseById = new Map(base.blocks.map((block) => [block.id, block]));
  const localById = new Map(local.blocks.map((block) => [block.id, block]));
  const remoteById = new Map(remote.blocks.map((block) => [block.id, block]));
  const conflicts: MarkdownBlockConflict[] = [];
  const refused = new Set<string>();

  const result: MarkdownBlock[] = [];
  for (const block of local.blocks) {
    const before = baseById.get(block.id);
    const outside = remoteById.get(block.id);
    if (!before) {
      result.push(block);
      continue;
    }
    const localChanged = !sameContent(before, block);
    if (!outside) {
      // The outside write deleted it.
      if (localChanged) {
        conflicts.push({ blockId: block.id, reason: "deleted", local: block.text, external: null });
        refused.add(block.id);
        result.push(block);
      }
      continue;
    }
    const remoteChanged = !sameContent(before, outside);
    if (!remoteChanged || sameContent(block, outside)) {
      result.push(block);
    } else if (!localChanged) {
      result.push({ ...outside, id: block.id });
    } else {
      conflicts.push({ blockId: block.id, reason: "modified", local: block.text, external: outside.text });
      refused.add(block.id);
      result.push(block);
    }
  }
  // Blocks the draft deleted: an outside change to one is refused.
  for (const block of base.blocks) {
    if (localById.has(block.id)) continue;
    const outside = remoteById.get(block.id);
    if (outside && !sameContent(block, outside)) {
      conflicts.push({ blockId: block.id, reason: "deleted", local: null, external: outside.text });
      refused.add(block.id);
    }
  }
  // Blocks the outside write created, after their nearest predecessor there.
  remote.blocks.forEach((block, index) => {
    if (baseById.has(block.id) || localById.has(block.id)) return;
    let anchor = -1;
    for (let k = index - 1; k >= 0; k--) {
      const at = result.findIndex((candidate) => candidate.id === remote.blocks[k].id);
      if (at !== -1) {
        anchor = at;
        break;
      }
    }
    result.splice(anchor + 1, 0, block);
  });

  const leading = local.leading !== base.leading ? local.leading : remote.leading;
  const nextBaseBlocks: MarkdownBlock[] = [];
  for (const block of remote.blocks) {
    if (refused.has(block.id)) {
      const before = baseById.get(block.id);
      if (before) nextBaseBlocks.push(before);
    } else {
      nextBaseBlocks.push(block);
    }
  }
  for (const block of base.blocks) {
    if (refused.has(block.id) && !remoteById.has(block.id)) nextBaseBlocks.push(block);
  }
  return {
    document: { leading, blocks: result },
    conflicts,
    nextBase: { leading: remote.leading, blocks: nextBaseBlocks }
  };
}
