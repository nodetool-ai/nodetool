// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";

// Create Index Flat L2 — vector.faiss.CreateIndexFlatL2
export interface CreateIndexFlatL2Inputs {
  dim?: Connectable<number>;
}

export function createIndexFlatL2(inputs: CreateIndexFlatL2Inputs): DslNode<SingleOutput<unknown>> {
  return createNode("vector.faiss.CreateIndexFlatL2", inputs as Record<string, unknown>);
}

// Create Index Flat IP — vector.faiss.CreateIndexFlatIP
export interface CreateIndexFlatIPInputs {
  dim?: Connectable<number>;
}

export function createIndexFlatIP(inputs: CreateIndexFlatIPInputs): DslNode<SingleOutput<unknown>> {
  return createNode("vector.faiss.CreateIndexFlatIP", inputs as Record<string, unknown>);
}

// Create Index IVFFlat — vector.faiss.CreateIndexIVFFlat
export interface CreateIndexIVFFlatInputs {
  dim?: Connectable<number>;
  nlist?: Connectable<number>;
  metric?: Connectable<unknown>;
}

export function createIndexIVFFlat(inputs: CreateIndexIVFFlatInputs): DslNode<SingleOutput<unknown>> {
  return createNode("vector.faiss.CreateIndexIVFFlat", inputs as Record<string, unknown>);
}

// Train Index — vector.faiss.TrainIndex
export interface TrainIndexInputs {
  index?: Connectable<unknown>;
  vectors?: Connectable<unknown>;
}

export function trainIndex(inputs: TrainIndexInputs): DslNode<SingleOutput<unknown>> {
  return createNode("vector.faiss.TrainIndex", inputs as Record<string, unknown>);
}

// Add Vectors — vector.faiss.AddVectors
export interface AddVectorsInputs {
  index?: Connectable<unknown>;
  vectors?: Connectable<unknown>;
}

export function addVectors(inputs: AddVectorsInputs): DslNode<SingleOutput<unknown>> {
  return createNode("vector.faiss.AddVectors", inputs as Record<string, unknown>);
}

// Add With Ids — vector.faiss.AddWithIds
export interface AddWithIdsInputs {
  index?: Connectable<unknown>;
  vectors?: Connectable<unknown>;
  ids?: Connectable<unknown>;
}

export function addWithIds(inputs: AddWithIdsInputs): DslNode<SingleOutput<unknown>> {
  return createNode("vector.faiss.AddWithIds", inputs as Record<string, unknown>);
}

// Search — vector.faiss.Search
export interface SearchInputs {
  index?: Connectable<unknown>;
  query?: Connectable<unknown>;
  k?: Connectable<number>;
  nprobe?: Connectable<number>;
}

export interface SearchOutputs {
  distances: OutputHandle<unknown>;
  indices: OutputHandle<unknown>;
}

export function search(inputs: SearchInputs): DslNode<SearchOutputs> {
  return createNode("vector.faiss.Search", inputs as Record<string, unknown>, { multiOutput: true });
}
