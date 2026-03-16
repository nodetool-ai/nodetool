// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { ImageRef } from "../types.js";

// Collection — vector.Collection
export interface CollectionInputs {
  name?: Connectable<string>;
  embedding_model?: Connectable<unknown>;
}

export function collection(inputs: CollectionInputs): DslNode<SingleOutput<unknown>> {
  return createNode("vector.Collection", inputs as Record<string, unknown>);
}

// Count — vector.Count
export interface CountInputs {
  collection?: Connectable<unknown>;
}

export function count(inputs: CountInputs): DslNode<SingleOutput<number>> {
  return createNode("vector.Count", inputs as Record<string, unknown>);
}

// Get Documents — vector.GetDocuments
export interface GetDocumentsInputs {
  collection?: Connectable<unknown>;
  ids?: Connectable<string[]>;
  limit?: Connectable<number>;
  offset?: Connectable<number>;
}

export function getDocuments(inputs: GetDocumentsInputs): DslNode<SingleOutput<string[]>> {
  return createNode("vector.GetDocuments", inputs as Record<string, unknown>);
}

// Peek — vector.Peek
export interface PeekInputs {
  collection?: Connectable<unknown>;
  limit?: Connectable<number>;
}

export function peek(inputs: PeekInputs): DslNode<SingleOutput<string[]>> {
  return createNode("vector.Peek", inputs as Record<string, unknown>);
}

// Index Image — vector.IndexImage
export interface IndexImageInputs {
  collection?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  index_id?: Connectable<string>;
  metadata?: Connectable<Record<string, unknown>>;
  upsert?: Connectable<boolean>;
}

export function indexImage(inputs: IndexImageInputs): DslNode<SingleOutput<unknown>> {
  return createNode("vector.IndexImage", inputs as Record<string, unknown>);
}

// Index Embedding — vector.IndexEmbedding
export interface IndexEmbeddingInputs {
  collection?: Connectable<unknown>;
  embedding?: Connectable<unknown>;
  index_id?: Connectable<string | string[]>;
  metadata?: Connectable<Record<string, unknown> | Record<string, unknown>[]>;
}

export function indexEmbedding(inputs: IndexEmbeddingInputs): DslNode<SingleOutput<unknown>> {
  return createNode("vector.IndexEmbedding", inputs as Record<string, unknown>);
}

// Index Text Chunk — vector.IndexTextChunk
export interface IndexTextChunkInputs {
  collection?: Connectable<unknown>;
  document_id?: Connectable<string>;
  text?: Connectable<string>;
  metadata?: Connectable<Record<string, unknown>>;
}

export function indexTextChunk(inputs: IndexTextChunkInputs): DslNode<SingleOutput<unknown>> {
  return createNode("vector.IndexTextChunk", inputs as Record<string, unknown>);
}

// Index Aggregated Text — vector.IndexAggregatedText
export interface IndexAggregatedTextInputs {
  collection?: Connectable<unknown>;
  document?: Connectable<string>;
  document_id?: Connectable<string>;
  metadata?: Connectable<Record<string, unknown>>;
  text_chunks?: Connectable<(unknown | string)[]>;
  aggregation?: Connectable<unknown>;
}

export function indexAggregatedText(inputs: IndexAggregatedTextInputs): DslNode<SingleOutput<unknown>> {
  return createNode("vector.IndexAggregatedText", inputs as Record<string, unknown>);
}

// Index String — vector.IndexString
export interface IndexStringInputs {
  collection?: Connectable<unknown>;
  text?: Connectable<string>;
  document_id?: Connectable<string>;
  metadata?: Connectable<Record<string, unknown>>;
}

export function indexString(inputs: IndexStringInputs): DslNode<SingleOutput<unknown>> {
  return createNode("vector.IndexString", inputs as Record<string, unknown>);
}

// Query Image — vector.QueryImage
export interface QueryImageInputs {
  collection?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  n_results?: Connectable<number>;
}

export interface QueryImageOutputs {
  ids: OutputHandle<string[]>;
  documents: OutputHandle<string[]>;
  metadatas: OutputHandle<Record<string, unknown>[]>;
  distances: OutputHandle<number[]>;
}

export function queryImage(inputs: QueryImageInputs): DslNode<QueryImageOutputs> {
  return createNode("vector.QueryImage", inputs as Record<string, unknown>, { multiOutput: true });
}

// Query Text — vector.QueryText
export interface QueryTextInputs {
  collection?: Connectable<unknown>;
  text?: Connectable<string>;
  n_results?: Connectable<number>;
}

export interface QueryTextOutputs {
  ids: OutputHandle<string[]>;
  documents: OutputHandle<string[]>;
  metadatas: OutputHandle<Record<string, unknown>[]>;
  distances: OutputHandle<number[]>;
}

export function queryText(inputs: QueryTextInputs): DslNode<QueryTextOutputs> {
  return createNode("vector.QueryText", inputs as Record<string, unknown>, { multiOutput: true });
}

// Remove Overlap — vector.RemoveOverlap
export interface RemoveOverlapInputs {
  documents?: Connectable<string[]>;
  min_overlap_words?: Connectable<number>;
}

export interface RemoveOverlapOutputs {
  documents: OutputHandle<string[]>;
}

export function removeOverlap(inputs: RemoveOverlapInputs): DslNode<RemoveOverlapOutputs> {
  return createNode("vector.RemoveOverlap", inputs as Record<string, unknown>, { multiOutput: true });
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
  ids: OutputHandle<string[]>;
  documents: OutputHandle<string[]>;
  metadatas: OutputHandle<Record<string, unknown>[]>;
  distances: OutputHandle<number[]>;
  scores: OutputHandle<number[]>;
}

export function hybridSearch(inputs: HybridSearchInputs): DslNode<HybridSearchOutputs> {
  return createNode("vector.HybridSearch", inputs as Record<string, unknown>, { multiOutput: true });
}
