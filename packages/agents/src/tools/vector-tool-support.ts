/**
 * Pure helpers behind the vector capabilities: metadata flattening, the
 * document-id derivation, and the two text splitters.
 *
 * They used to be module-private inside `vector-tools.ts` (`splitTextRecursive`
 * exported for its regression test). The `collections` capability module
 * (`../capabilities/collections.ts`) needs the same functions, and a capability
 * module must not import the tool module it replaces, so they live here and
 * both sides import them.
 */

import { createHash } from "node:crypto";

export function flattenMetadata(
  obj: Record<string, unknown>
) {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (v !== null && v !== undefined) {
      out[k] = String(v);
    }
  }
  return out;
}

export function generateDocumentId(sourceId: string): string {
  return `${sourceId}-${createHash("md5").update(sourceId).digest("hex").slice(0, 8)}`;
}

export function splitTextRecursive(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number
): string[] {
  // Clamp params so the sliding window always advances. chunk_size/overlap come
  // straight from model-supplied args; if overlap >= size the stride
  // `chunkSize - chunkOverlap` is <= 0 and the while-loops below spin forever
  // (event-loop hang + unbounded chunks[] → OOM). Guarantee 1 <= size and
  // 0 <= overlap < size.
  chunkSize = Math.max(1, Math.floor(chunkSize));
  chunkOverlap = Math.min(Math.max(0, Math.floor(chunkOverlap)), chunkSize - 1);
  if (text.length <= chunkSize) return [text];

  // Find first separator that appears in text
  let sep: string | null = null;
  for (const s of separators) {
    if (text.includes(s)) {
      sep = s;
      break;
    }
  }

  // If no separator found, split by chunk size
  if (sep === null) {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      chunks.push(text.slice(start, start + chunkSize));
      start += chunkSize - chunkOverlap;
      if (start + chunkOverlap >= text.length && start < text.length) {
        chunks.push(text.slice(start));
        break;
      }
    }
    return chunks;
  }

  const splits = text.split(sep).filter((s) => s.length > 0);
  const remainingSeparators = separators.slice(separators.indexOf(sep) + 1);

  // Merge splits into chunks
  const chunks: string[] = [];
  let current = "";

  for (const split of splits) {
    const candidate = current ? current + sep + split : split;
    if (candidate.length <= chunkSize) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      if (split.length > chunkSize && remainingSeparators.length > 0) {
        const subChunks = splitTextRecursive(
          split,
          remainingSeparators,
          chunkSize,
          chunkOverlap
        );
        chunks.push(...subChunks);
        current = "";
      } else if (split.length > chunkSize) {
        // No more separators, force-split
        let start = 0;
        while (start < split.length) {
          chunks.push(split.slice(start, start + chunkSize));
          start += chunkSize - chunkOverlap;
          if (start + chunkOverlap >= split.length && start < split.length) {
            chunks.push(split.slice(start));
            break;
          }
        }
        current = "";
      } else {
        current = split;
      }
    }
  }
  if (current) chunks.push(current);

  // Apply overlap between merged chunks
  if (chunkOverlap > 0 && chunks.length > 1) {
    const overlapped: string[] = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const overlapText = prev.slice(Math.max(0, prev.length - chunkOverlap));
      const merged = overlapText + sep + chunks[i];
      if (merged.length <= chunkSize) {
        overlapped.push(merged);
      } else {
        overlapped.push(chunks[i]);
      }
    }
    return overlapped;
  }

  return chunks;
}

export function splitMarkdownByHeaders(text: string): string[] {
  const headerRegex = /^(#{1,3})\s+/m;
  const sections: string[] = [];
  let current = "";

  for (const line of text.split("\n")) {
    if (headerRegex.test(line) && current.trim()) {
      sections.push(current.trim());
      current = line + "\n";
    } else {
      current += line + "\n";
    }
  }
  if (current.trim()) sections.push(current.trim());

  return sections;
}
