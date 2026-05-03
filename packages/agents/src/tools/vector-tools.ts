/**
 * Vector database search tools.
 *
 * Port of src/nodetool/agents/tools/chroma_tools.py
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type {
  VectorCollection,
  VectorMatch
} from "@nodetool-ai/vectorstore";
import { Tool } from "./base-tool.js";

/**
 * Re-exported here under the legacy name so external code that imports
 * `VecCollection` from `@nodetool-ai/agents` keeps compiling.
 */
export type VecCollection = VectorCollection;

function flattenMetadata(
  obj: Record<string, unknown>
): Record<string, string | number | boolean> {
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

function generateDocumentId(sourceId: string): string {
  return `${sourceId}-${createHash("md5").update(sourceId).digest("hex").slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// VecTextSearchTool
// ---------------------------------------------------------------------------

export class VecTextSearchTool extends Tool {
  readonly name = "vector_text_search";
  readonly description =
    "Search all vector database collections for similar text using semantic search";
  readonly inputSchema = {
    type: "object",
    properties: {
      text: { type: "string", description: "The text to search for" },
      n_results: {
        type: "integer",
        description: "Number of results to return",
        default: 10
      }
    },
    required: ["text"]
  };

  private collection: VectorCollection;

  constructor(collection: VectorCollection) {
    super();
    this.collection = collection;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<Record<string, string>> {
    const text = params.text as string;
    const nResults = (params.n_results as number) ?? 10;

    const matches = await this.collection.query({ text, topK: nResults });

    const out: Record<string, string> = {};
    for (const m of matches) {
      if (m.document != null) out[m.id] = m.document;
    }
    return out;
  }

  userMessage(params: Record<string, unknown>): string {
    const text = (params.text as string) ?? "something";
    const msg = `Performing semantic search for '${text}'...`;
    return msg.length > 80 ? "Performing semantic search..." : msg;
  }
}

// ---------------------------------------------------------------------------
// VecIndexTool
// ---------------------------------------------------------------------------

export class VecIndexTool extends Tool {
  readonly name = "vector_index";
  readonly description = "Index a text chunk into a vector database collection";
  readonly inputSchema = {
    type: "object",
    properties: {
      text: { type: "string", description: "The text content to index" },
      source_id: {
        type: "string",
        description: "Unique identifier for the source of the text"
      },
      metadata: {
        type: "object",
        description: "Metadata to associate with the text chunk",
        default: {}
      }
    },
    required: ["text", "source_id"]
  };

  private collection: VectorCollection;

  constructor(collection: VectorCollection) {
    super();
    this.collection = collection;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<Record<string, string>> {
    const text = params.text as string;
    const sourceId = params.source_id as string;
    const metadata = (params.metadata as Record<string, unknown>) ?? {};

    if (!sourceId.trim()) return { error: "The source ID cannot be empty" };

    const documentId = generateDocumentId(sourceId);

    await this.collection.upsert([
      {
        id: documentId,
        document: text,
        metadata:
          Object.keys(metadata).length > 0 ? flattenMetadata(metadata) : undefined
      }
    ]);

    return {
      status: "success",
      document_id: documentId,
      message: `Successfully indexed text chunk with ID ${documentId}`
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const sourceId = (params.source_id as string) ?? "a source";
    const msg = `Indexing text chunk from ${sourceId}...`;
    return msg.length > 80 ? "Indexing text chunk..." : msg;
  }
}

// ---------------------------------------------------------------------------
// VecHybridSearchTool
// ---------------------------------------------------------------------------

export class VecHybridSearchTool extends Tool {
  readonly name = "vector_hybrid_search";
  readonly description =
    "Search all vector database collections using both semantic and keyword-based search";
  readonly inputSchema = {
    type: "object",
    properties: {
      text: { type: "string", description: "The text to search for" },
      n_results: {
        type: "integer",
        description: "Number of results to return per collection",
        default: 5
      },
      k_constant: {
        type: "number",
        description: "Constant for reciprocal rank fusion",
        default: 60.0
      },
      min_keyword_length: {
        type: "integer",
        description: "Minimum length for keyword tokens",
        default: 3
      }
    },
    required: ["text"]
  };

  private collection: VectorCollection;

  constructor(collection: VectorCollection) {
    super();
    this.collection = collection;
  }

  private getKeywordFilter(
    text: string,
    minLength: number
  ): Record<string, unknown> | null {
    const tokens = text
      .toLowerCase()
      .split(/[ ,.!?\-_=|]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= minLength);

    if (tokens.length === 0) return null;
    if (tokens.length > 1) {
      return {
        $document: { $or: tokens.map((t) => ({ $contains: t })) }
      };
    }
    return { $document: { $contains: tokens[0] } };
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<Record<string, string>> {
    try {
      const text = params.text as string;
      if (!text.trim()) return { error: "Search text cannot be empty" };

      const nResults = (params.n_results as number) ?? 5;
      const kConstant = (params.k_constant as number) ?? 60.0;
      const minKeywordLength = (params.min_keyword_length as number) ?? 3;

      const semanticMatches = await this.collection.query({
        text,
        topK: nResults * 2
      });

      const keywordFilter = this.getKeywordFilter(text, minKeywordLength);
      let keywordMatches: VectorMatch[] = semanticMatches;
      if (keywordFilter) {
        keywordMatches = await this.collection.query({
          text,
          topK: nResults * 2,
          filter: keywordFilter
        });
      }

      const combined: Record<string, { doc: string; score: number }> = {};
      const fuse = (matches: VectorMatch[]) => {
        matches.forEach((m, rank) => {
          const score = 1 / (rank + kConstant);
          if (m.document == null) return;
          if (combined[m.id]) combined[m.id].score += score;
          else combined[m.id] = { doc: m.document, score };
        });
      };
      fuse(semanticMatches);
      fuse(keywordMatches);

      const sorted = Object.entries(combined)
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, nResults);

      const out: Record<string, string> = {};
      for (const [id, item] of sorted) out[id] = item.doc;
      return out;
    } catch (e: unknown) {
      return { error: String(e) };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const text = (params.text as string) ?? "something";
    const msg = `Performing hybrid search for '${text}'...`;
    return msg.length > 80 ? "Performing hybrid search..." : msg;
  }
}

// ---------------------------------------------------------------------------
// Native recursive text splitter (no langchain dependency)
// ---------------------------------------------------------------------------

interface TextChunk {
  text: string;
  sourceId: string;
  startIndex: number;
}

function splitTextRecursive(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number
): string[] {
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

// ---------------------------------------------------------------------------
// VecRecursiveSplitAndIndexTool
// ---------------------------------------------------------------------------

export class VecRecursiveSplitAndIndexTool extends Tool {
  readonly name = "vector_recursive_split_and_index";
  readonly description =
    "Split text into chunks recursively and index them into a vector database collection";
  readonly inputSchema = {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The text content to split and index"
      },
      document_id: {
        type: "string",
        description: "Base identifier for the source document"
      },
      chunk_size: {
        type: "integer",
        description: "Maximum size of each chunk in characters",
        default: 1000
      },
      chunk_overlap: {
        type: "integer",
        description: "Number of characters to overlap between chunks",
        default: 200
      },
      separators: {
        type: "array",
        items: { type: "string" },
        description: "List of separators for recursive splitting",
        default: ["\n\n", "\n", "."]
      },
      metadata: {
        type: "object",
        description: "Additional metadata to associate with all chunks",
        default: {}
      }
    },
    required: ["text", "document_id"]
  };

  private collection: VectorCollection;

  constructor(collection: VectorCollection) {
    super();
    this.collection = collection;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const text = params.text as string;
    const documentId = params.document_id as string;
    const baseMetadata = (params.metadata as Record<string, unknown>) ?? {};
    const chunkSize = (params.chunk_size as number) ?? 1000;
    const chunkOverlap = (params.chunk_overlap as number) ?? 200;
    let separators = (params.separators as string[]) ?? ["\n\n", "\n", "."];
    if (typeof separators === "string") separators = [separators];

    if (!text.trim()) return { error: "The text cannot be empty" };
    if (!documentId.trim()) return { error: "The document ID cannot be empty" };

    let rawChunks: string[];
    try {
      rawChunks = splitTextRecursive(text, separators, chunkSize, chunkOverlap);
    } catch (e: unknown) {
      return { error: `Text splitting failed: ${String(e)}` };
    }

    const indexedIds: string[] = [];
    try {
      for (let i = 0; i < rawChunks.length; i++) {
        const sourceId = `${documentId}:${i}`;
        const uniqueId = generateDocumentId(`${sourceId}:${i}`);
        const metadata = flattenMetadata({ ...baseMetadata, start_index: i });

        await this.collection.upsert([
          { id: uniqueId, document: rawChunks[i], metadata }
        ]);
        indexedIds.push(uniqueId);
      }
    } catch (e: unknown) {
      return {
        error: `Indexing failed: ${String(e)}`,
        indexed_count: indexedIds.length,
        total_chunks: rawChunks.length
      };
    }

    return {
      status: "success",
      indexed_count: indexedIds.length,
      document_id: documentId,
      message: `Successfully indexed ${indexedIds.length} chunks from document ${documentId}`
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const sourceId = (params.source_id as string) ?? "a source";
    const msg = `Recursively splitting and indexing text from ${sourceId}...`;
    return msg.length > 80 ? "Recursively splitting and indexing text..." : msg;
  }
}

// ---------------------------------------------------------------------------
// VecMarkdownSplitAndIndexTool
// ---------------------------------------------------------------------------

function splitMarkdownByHeaders(text: string): string[] {
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

export class VecMarkdownSplitAndIndexTool extends Tool {
  readonly name = "vector_markdown_split_and_index";
  readonly description =
    "Split markdown text into chunks based on headers and index them into a vector database collection";
  readonly inputSchema = {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "The path to the markdown file to split and index"
      },
      text: {
        type: "string",
        description: "Raw markdown content if no file_path provided"
      },
      chunk_size: {
        type: "integer",
        description: "Maximum size of each chunk in characters",
        default: 1000
      },
      chunk_overlap: {
        type: "integer",
        description: "Number of characters to overlap between chunks",
        default: 200
      }
    },
    required: []
  };

  private collection: VectorCollection;

  constructor(collection: VectorCollection) {
    super();
    this.collection = collection;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const filePath = params.file_path as string | undefined;
    let text: string | undefined;
    let docId: string;

    if (filePath) {
      docId = filePath;
      text = await readFile(filePath, "utf-8");
    } else {
      text = params.text as string | undefined;
      docId = crypto.randomUUID();
      if (!text) return { error: "Neither file_path nor text is provided" };
    }

    // Split by headers first
    const headerSections = splitMarkdownByHeaders(text);

    // Further split by chunk size
    const chunkSize = (params.chunk_size as number) ?? 1000;
    const chunkOverlap = (params.chunk_overlap as number) ?? 200;

    const allChunks: string[] = [];
    for (const section of headerSections) {
      if (section.length <= chunkSize) {
        allChunks.push(section);
      } else {
        const sub = splitTextRecursive(
          section,
          ["\n\n", "\n", "."],
          chunkSize,
          chunkOverlap
        );
        allChunks.push(...sub);
      }
    }

    const indexedIds: string[] = [];
    for (let i = 0; i < allChunks.length; i++) {
      const uniqueId = `${docId}:${i}`;
      await this.collection.upsert([
        { id: uniqueId, document: allChunks[i] }
      ]);
      indexedIds.push(uniqueId);
    }

    return {
      status: "success",
      indexed_ids: indexedIds,
      message: `Successfully indexed ${indexedIds.length} chunks`
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const sourceId = (params.source_id as string) ?? "a source";
    const msg = `Splitting and indexing Markdown from ${sourceId}...`;
    return msg.length > 80 ? "Splitting and indexing Markdown..." : msg;
  }
}

// ---------------------------------------------------------------------------
// VecBatchIndexTool
// ---------------------------------------------------------------------------

export class VecBatchIndexTool extends Tool {
  readonly name = "vector_batch_index";
  readonly description =
    "Index a batch of text chunks into a vector database collection";
  readonly inputSchema = {
    type: "object",
    properties: {
      chunks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            source_id: { type: "string" },
            metadata: { type: "object", default: {} }
          },
          required: ["text", "source_id"]
        },
        description: "List of text chunks to index"
      },
      base_metadata: {
        type: "object",
        description: "Base metadata to add to all chunks",
        default: {}
      }
    },
    required: ["chunks"]
  };

  private collection: VectorCollection;

  constructor(collection: VectorCollection) {
    super();
    this.collection = collection;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    let chunks = params.chunks as Array<{
      text?: string;
      source_id?: string;
      metadata?: Record<string, unknown>;
    }>;
    if (typeof chunks === "string")
      chunks = [chunks as unknown as (typeof chunks)[0]];
    const baseMetadata =
      (params.base_metadata as Record<string, unknown>) ?? {};

    if (!chunks || chunks.length === 0) return { error: "No chunks provided" };

    const records = chunks
      .filter((c) => c.text && c.source_id)
      .map((c) => ({
        id: generateDocumentId(c.source_id as string),
        document: c.text as string,
        metadata: flattenMetadata({ ...baseMetadata, ...(c.metadata ?? {}) })
      }));

    if (records.length === 0) return { error: "No valid chunks to index" };

    try {
      await this.collection.upsert(records);

      return {
        status: "success",
        indexed_count: records.length,
        message: `Successfully indexed ${records.length} chunks`
      };
    } catch (e: unknown) {
      return { error: `Indexing failed: ${String(e)}` };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    const chunks = (params.chunks as unknown[]) ?? [];
    return `Indexing a batch of ${chunks.length} text chunks...`;
  }
}
