// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Create Index Flat L2 — vector.faiss.CreateIndexFlatL2
export interface CreateIndexFlatL2Inputs {
  dim?: Connectable<number>;
}

export interface CreateIndexFlatL2Outputs {
  output: unknown;
}

export function createIndexFlatL2(
  inputs: CreateIndexFlatL2Inputs
): DslNode<CreateIndexFlatL2Outputs, "output"> {
  return createNode(
    "vector.faiss.CreateIndexFlatL2",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Create Index Flat IP — vector.faiss.CreateIndexFlatIP
export interface CreateIndexFlatIPInputs {
  dim?: Connectable<number>;
}

export interface CreateIndexFlatIPOutputs {
  output: unknown;
}

export function createIndexFlatIP(
  inputs: CreateIndexFlatIPInputs
): DslNode<CreateIndexFlatIPOutputs, "output"> {
  return createNode(
    "vector.faiss.CreateIndexFlatIP",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Create Index IVFFlat — vector.faiss.CreateIndexIVFFlat
export interface CreateIndexIVFFlatInputs {
  dim?: Connectable<number>;
  nlist?: Connectable<number>;
  metric?: Connectable<unknown>;
}

export interface CreateIndexIVFFlatOutputs {
  output: unknown;
}

export function createIndexIVFFlat(
  inputs: CreateIndexIVFFlatInputs
): DslNode<CreateIndexIVFFlatOutputs, "output"> {
  return createNode(
    "vector.faiss.CreateIndexIVFFlat",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Train Index — vector.faiss.TrainIndex
export interface TrainIndexInputs {
  index?: Connectable<unknown>;
  vectors?: Connectable<unknown>;
}

export interface TrainIndexOutputs {
  output: unknown;
}

export function trainIndex(
  inputs: TrainIndexInputs
): DslNode<TrainIndexOutputs, "output"> {
  return createNode(
    "vector.faiss.TrainIndex",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Add Vectors — vector.faiss.AddVectors
export interface AddVectorsInputs {
  index?: Connectable<unknown>;
  vectors?: Connectable<unknown>;
}

export interface AddVectorsOutputs {
  output: unknown;
}

export function addVectors(
  inputs: AddVectorsInputs
): DslNode<AddVectorsOutputs, "output"> {
  return createNode(
    "vector.faiss.AddVectors",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Add With Ids — vector.faiss.AddWithIds
export interface AddWithIdsInputs {
  index?: Connectable<unknown>;
  vectors?: Connectable<unknown>;
  ids?: Connectable<unknown>;
}

export interface AddWithIdsOutputs {
  output: unknown;
}

export function addWithIds(
  inputs: AddWithIdsInputs
): DslNode<AddWithIdsOutputs, "output"> {
  return createNode(
    "vector.faiss.AddWithIds",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Search — vector.faiss.Search
export interface SearchInputs {
  index?: Connectable<unknown>;
  query?: Connectable<unknown>;
  k?: Connectable<number>;
  nprobe?: Connectable<number>;
}

export interface SearchOutputs {
  distances: unknown;
  indices: unknown;
}

export function search(inputs: SearchInputs): DslNode<SearchOutputs> {
  return createNode("vector.faiss.Search", inputs as Record<string, unknown>, {
    outputNames: ["distances", "indices"]
  });
}
