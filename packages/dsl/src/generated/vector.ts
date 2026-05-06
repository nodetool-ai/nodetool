// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Collection — vector.Collection
export interface CollectionInputs {
  name?: Connectable<string>;
  embedding_model?: Connectable<unknown>;
}

export interface CollectionOutputs {
  output: unknown;
}

export function collection(inputs: CollectionInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CollectionOutputs, "output"> {
  return createNode("vector.Collection", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Count — vector.Count
export interface CountInputs {
  collection?: Connectable<unknown>;
}

export interface CountOutputs {
  output: number;
}

export function count(inputs: CountInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CountOutputs, "output"> {
  return createNode("vector.Count", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Get Documents — vector.GetDocuments
export interface GetDocumentsInputs {
  collection?: Connectable<unknown>;
  ids?: Connectable<string[]>;
  limit?: Connectable<number>;
  offset?: Connectable<number>;
}

export interface GetDocumentsOutputs {
  output: string[];
}

export function getDocuments(inputs: GetDocumentsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetDocumentsOutputs, "output"> {
  return createNode("vector.GetDocuments", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Peek — vector.Peek
export interface PeekInputs {
  collection?: Connectable<unknown>;
  limit?: Connectable<number>;
}

export interface PeekOutputs {
  output: string[];
}

export function peek(inputs: PeekInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PeekOutputs, "output"> {
  return createNode("vector.Peek", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Index Image — vector.IndexImage
export interface IndexImageInputs {
  collection?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  index_id?: Connectable<string>;
  metadata?: Connectable<Record<string, unknown>>;
  upsert?: Connectable<boolean>;
}

export interface IndexImageOutputs {
}

export function indexImage(inputs: IndexImageInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IndexImageOutputs> {
  return createNode("vector.IndexImage", inputs as Record<string, unknown>, { outputNames: [], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Index Embedding — vector.IndexEmbedding
export interface IndexEmbeddingInputs {
  collection?: Connectable<unknown>;
  embedding?: Connectable<unknown[]>;
  index_id?: Connectable<string | string[]>;
  metadata?: Connectable<Record<string, unknown> | Record<string, unknown>[]>;
}

export interface IndexEmbeddingOutputs {
}

export function indexEmbedding(inputs: IndexEmbeddingInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IndexEmbeddingOutputs> {
  return createNode("vector.IndexEmbedding", inputs as Record<string, unknown>, { outputNames: [], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Index Text Chunk — vector.IndexTextChunk
export interface IndexTextChunkInputs {
  collection?: Connectable<unknown>;
  document_id?: Connectable<string>;
  text?: Connectable<string>;
  metadata?: Connectable<Record<string, unknown>>;
}

export interface IndexTextChunkOutputs {
}

export function indexTextChunk(inputs: IndexTextChunkInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IndexTextChunkOutputs> {
  return createNode("vector.IndexTextChunk", inputs as Record<string, unknown>, { outputNames: [], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Index Aggregated Text — vector.IndexAggregatedText
export interface IndexAggregatedTextInputs {
  collection?: Connectable<unknown>;
  document?: Connectable<string>;
  document_id?: Connectable<string>;
  metadata?: Connectable<Record<string, unknown>>;
  text_chunks?: Connectable<(unknown | string)[]>;
  aggregation?: Connectable<"mean" | "max" | "min" | "sum">;
}

export interface IndexAggregatedTextOutputs {
}

export function indexAggregatedText(inputs: IndexAggregatedTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IndexAggregatedTextOutputs> {
  return createNode("vector.IndexAggregatedText", inputs as Record<string, unknown>, { outputNames: [], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Index String — vector.IndexString
export interface IndexStringInputs {
  collection?: Connectable<unknown>;
  text?: Connectable<string>;
  document_id?: Connectable<string>;
  metadata?: Connectable<Record<string, unknown>>;
}

export interface IndexStringOutputs {
}

export function indexString(inputs: IndexStringInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IndexStringOutputs> {
  return createNode("vector.IndexString", inputs as Record<string, unknown>, { outputNames: [], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Query Image — vector.QueryImage
export interface QueryImageInputs {
  collection?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  n_results?: Connectable<number>;
}

export interface QueryImageOutputs {
  ids: string[];
  documents: string[];
  metadatas: Record<string, unknown>[];
  distances: number[];
}

export function queryImage(inputs: QueryImageInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<QueryImageOutputs> {
  return createNode("vector.QueryImage", inputs as Record<string, unknown>, { outputNames: ["ids", "documents", "metadatas", "distances"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Query Text — vector.QueryText
export interface QueryTextInputs {
  collection?: Connectable<unknown>;
  text?: Connectable<string>;
  n_results?: Connectable<number>;
}

export interface QueryTextOutputs {
  ids: string[];
  documents: string[];
  metadatas: Record<string, unknown>[];
  distances: number[];
}

export function queryText(inputs: QueryTextInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<QueryTextOutputs> {
  return createNode("vector.QueryText", inputs as Record<string, unknown>, { outputNames: ["ids", "documents", "metadatas", "distances"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Remove Overlap — vector.RemoveOverlap
export interface RemoveOverlapInputs {
  documents?: Connectable<string[]>;
  min_overlap_words?: Connectable<number>;
}

export interface RemoveOverlapOutputs {
  documents: string[];
}

export function removeOverlap(inputs: RemoveOverlapInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RemoveOverlapOutputs, "documents"> {
  return createNode("vector.RemoveOverlap", inputs as Record<string, unknown>, { outputNames: ["documents"], defaultOutput: "documents", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Hybrid Search — vector.HybridSearch
export interface HybridSearchInputs {
  collection?: Connectable<unknown>;
  text?: Connectable<string>;
  n_results?: Connectable<number>;
  k_constant?: Connectable<number>;
  min_keyword_length?: Connectable<number>;
}

export interface HybridSearchOutputs {
  ids: string[];
  documents: string[];
  metadatas: Record<string, unknown>[];
  distances: number[];
  scores: number[];
}

export function hybridSearch(inputs: HybridSearchInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<HybridSearchOutputs> {
  return createNode("vector.HybridSearch", inputs as Record<string, unknown>, { outputNames: ["ids", "documents", "metadatas", "distances", "scores"], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
