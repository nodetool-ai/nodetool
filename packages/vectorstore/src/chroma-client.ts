/**
 * Document splitting utilities.
 *
 * Kept from the original ChromaDB client module. The ChromaDB client
 * has been replaced by sqlite-vec-store.ts.
 */

// ---------------------------------------------------------------------------
// Document splitting
// ---------------------------------------------------------------------------

export interface TextChunk {
  text: string;
  source_id: string;
  start_index: number;
}

const DEFAULT_SEPARATORS = ["\n\n", "\n", "."];

/**
 * Split text into chunks using a recursive character text splitter.
 *
 * This is a pure-TS implementation that mirrors LangChain's
 * `RecursiveCharacterTextSplitter` behaviour used in the Python codebase.
 *
 * @param text        The text to split.
 * @param sourceId    An identifier for the source document.
 * @param chunkSize   Maximum chunk size in characters (default 2000).
 * @param chunkOverlap Overlap between consecutive chunks (default 1000).
 * @param separators  Ordered list of separators to try.
 */
export function splitDocument(
  text: string,
  sourceId: string,
  chunkSize = 2000,
  chunkOverlap = 1000,
  separators: string[] = DEFAULT_SEPARATORS
): TextChunk[] {
  if (!text || !text.trim()) return [];

  const chunks = recursiveSplit(text, separators, chunkSize, chunkOverlap);

  return chunks.map((chunk) => ({
    text: chunk.text,
    source_id: sourceId,
    start_index: chunk.start
  }));
}

interface RawChunk {
  text: string;
  start: number;
}

/**
 * Recursive text splitting — tries each separator in order, falling back
 * to character-level splitting when no separator produces small enough chunks.
 */
function recursiveSplit(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number
): RawChunk[] {
  if (text.length <= chunkSize) {
    return [{ text, start: 0 }];
  }

  // Try each separator
  for (let i = 0; i < separators.length; i++) {
    const sep = separators[i];
    if (!text.includes(sep)) continue;

    const parts = splitBySeparator(text, sep);
    const merged = mergeSplits(parts, sep, chunkSize, chunkOverlap);

    // Check if all chunks are within the size limit
    const allFit = merged.every((c) => c.text.length <= chunkSize);
    if (allFit) return merged;

    // Some chunks are still too large — recursively split them with remaining separators
    const remainingSeparators = separators.slice(i + 1);
    const result: RawChunk[] = [];
    for (const chunk of merged) {
      if (chunk.text.length <= chunkSize) {
        result.push(chunk);
      } else {
        const subChunks = recursiveSplit(
          chunk.text,
          remainingSeparators,
          chunkSize,
          chunkOverlap
        );
        for (const sub of subChunks) {
          result.push({ text: sub.text, start: chunk.start + sub.start });
        }
      }
    }
    return result;
  }

  // No separator worked — split by character boundaries
  return splitByCharacters(text, chunkSize, chunkOverlap);
}

interface SplitPart {
  text: string;
  offset: number;
}

function splitBySeparator(text: string, sep: string): SplitPart[] {
  const parts: SplitPart[] = [];
  let pos = 0;

  while (true) {
    const next = text.indexOf(sep, pos);
    if (next === -1) {
      const remaining = text.slice(pos);
      if (remaining.length > 0) {
        parts.push({ text: remaining, offset: pos });
      }
      break;
    }

    const segment = text.slice(pos, next + sep.length);
    if (segment.length > 0) {
      parts.push({ text: segment, offset: pos });
    }
    pos = next + sep.length;
  }

  return parts;
}

function mergeSplits(
  parts: SplitPart[],
  _sep: string,
  chunkSize: number,
  chunkOverlap: number
): RawChunk[] {
  const chunks: RawChunk[] = [];
  let current = "";
  let currentStart = 0;

  for (const part of parts) {
    const candidate = current.length === 0 ? part.text : current + part.text;

    if (candidate.length > chunkSize && current.length > 0) {
      // Emit current chunk
      chunks.push({ text: current.trimEnd(), start: currentStart });

      // Compute overlap: keep the tail of the current chunk
      if (chunkOverlap > 0 && current.length > chunkOverlap) {
        const overlapText = current.slice(current.length - chunkOverlap);
        current = overlapText + part.text;
        currentStart = part.offset - overlapText.length;
      } else {
        current = part.text;
        currentStart = part.offset;
      }
    } else {
      if (current.length === 0) currentStart = part.offset;
      current = candidate;
    }
  }

  if (current.trim().length > 0) {
    chunks.push({ text: current.trimEnd(), start: currentStart });
  }

  return chunks;
}

function splitByCharacters(
  text: string,
  chunkSize: number,
  chunkOverlap: number
): RawChunk[] {
  const chunks: RawChunk[] = [];
  const step = Math.max(1, chunkSize - chunkOverlap);
  let pos = 0;
  while (pos < text.length) {
    const end = Math.min(pos + chunkSize, text.length);
    chunks.push({ text: text.slice(pos, end), start: pos });
    pos += step;
  }
  return chunks;
}
