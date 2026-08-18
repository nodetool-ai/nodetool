// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Collection — vector.Collection
export type CollectionInputs = {
  name?: string;
  embedding_model?: unknown;
};

export interface CollectionOutputs {
  output: unknown;
}

export function collection(inputs: CollectionInputs): Promise<CollectionOutputs> {
  return callNode<CollectionOutputs>("vector.Collection", inputs);
}

// Count Documents — vector.Count
export type CountInputs = {
  collection?: unknown;
};

export interface CountOutputs {
  output: number;
}

export function count(inputs: CountInputs): Promise<CountOutputs> {
  return callNode<CountOutputs>("vector.Count", inputs);
}

// Get Documents — vector.GetDocuments
export type GetDocumentsInputs = {
  collection?: unknown;
  ids?: string[];
  limit?: number;
  offset?: number;
};

export interface GetDocumentsOutputs {
  output: string[];
}

export function getDocuments(inputs: GetDocumentsInputs): Promise<GetDocumentsOutputs> {
  return callNode<GetDocumentsOutputs>("vector.GetDocuments", inputs);
}

// Peek — vector.Peek
export type PeekInputs = {
  collection?: unknown;
  limit?: number;
};

export interface PeekOutputs {
  output: string[];
}

export function peek(inputs: PeekInputs): Promise<PeekOutputs> {
  return callNode<PeekOutputs>("vector.Peek", inputs);
}

// Index Image — vector.IndexImage
export type IndexImageInputs = {
  collection?: unknown;
  image?: ImageRef;
  index_id?: string;
  metadata?: Record<string, unknown>;
  upsert?: boolean;
};

export interface IndexImageOutputs {
}

export function indexImage(inputs: IndexImageInputs): Promise<IndexImageOutputs> {
  return callNode<IndexImageOutputs>("vector.IndexImage", inputs);
}

// Index Embedding — vector.IndexEmbedding
export type IndexEmbeddingInputs = {
  collection?: unknown;
  embedding?: unknown[];
  index_id?: string | string[];
  metadata?: Record<string, unknown> | Record<string, unknown>[];
};

export interface IndexEmbeddingOutputs {
}

export function indexEmbedding(inputs: IndexEmbeddingInputs): Promise<IndexEmbeddingOutputs> {
  return callNode<IndexEmbeddingOutputs>("vector.IndexEmbedding", inputs);
}

// Index Text Chunk — vector.IndexTextChunk
export type IndexTextChunkInputs = {
  collection?: unknown;
  document_id?: string;
  text?: string;
  metadata?: Record<string, unknown>;
};

export interface IndexTextChunkOutputs {
}

export function indexTextChunk(inputs: IndexTextChunkInputs): Promise<IndexTextChunkOutputs> {
  return callNode<IndexTextChunkOutputs>("vector.IndexTextChunk", inputs);
}

// Index Aggregated Text — vector.IndexAggregatedText
export type IndexAggregatedTextInputs = {
  collection?: unknown;
  document?: string;
  document_id?: string;
  metadata?: Record<string, unknown>;
  text_chunks?: (unknown | string)[];
  aggregation?: "mean" | "max" | "min" | "sum";
};

export interface IndexAggregatedTextOutputs {
}

export function indexAggregatedText(inputs: IndexAggregatedTextInputs): Promise<IndexAggregatedTextOutputs> {
  return callNode<IndexAggregatedTextOutputs>("vector.IndexAggregatedText", inputs);
}

// Index String — vector.IndexString
export type IndexStringInputs = {
  collection?: unknown;
  text?: string;
  document_id?: string;
  metadata?: Record<string, unknown>;
};

export interface IndexStringOutputs {
}

export function indexString(inputs: IndexStringInputs): Promise<IndexStringOutputs> {
  return callNode<IndexStringOutputs>("vector.IndexString", inputs);
}

// Query Image — vector.QueryImage
export type QueryImageInputs = {
  collection?: unknown;
  image?: ImageRef;
  n_results?: number;
};

export interface QueryImageOutputs {
  ids: string[];
  documents: string[];
  metadatas: Record<string, unknown>[];
  distances: number[];
}

export function queryImage(inputs: QueryImageInputs): Promise<QueryImageOutputs> {
  return callNode<QueryImageOutputs>("vector.QueryImage", inputs);
}

// Query Text — vector.QueryText
export type QueryTextInputs = {
  collection?: unknown;
  text?: string;
  n_results?: number;
};

export interface QueryTextOutputs {
  ids: string[];
  documents: string[];
  metadatas: Record<string, unknown>[];
  distances: number[];
}

export function queryText(inputs: QueryTextInputs): Promise<QueryTextOutputs> {
  return callNode<QueryTextOutputs>("vector.QueryText", inputs);
}

// Remove Overlap — vector.RemoveOverlap
export type RemoveOverlapInputs = {
  documents?: string[];
  min_overlap_words?: number;
};

export interface RemoveOverlapOutputs {
  documents: string[];
}

export function removeOverlap(inputs: RemoveOverlapInputs): Promise<RemoveOverlapOutputs> {
  return callNode<RemoveOverlapOutputs>("vector.RemoveOverlap", inputs);
}

// Hybrid Search — vector.HybridSearch
export type HybridSearchInputs = {
  collection?: unknown;
  text?: string;
  n_results?: number;
  k_constant?: number;
  min_keyword_length?: number;
};

export interface HybridSearchOutputs {
  ids: string[];
  documents: string[];
  metadatas: Record<string, unknown>[];
  distances: number[];
  scores: number[];
}

export function hybridSearch(inputs: HybridSearchInputs): Promise<HybridSearchOutputs> {
  return callNode<HybridSearchOutputs>("vector.HybridSearch", inputs);
}
