/**
 * FAISS vector search nodes for NodeTool.
 *
 * Uses faiss-node (v0.5.1) for native FAISS bindings when available.
 * Falls back to a pure-TypeScript brute-force implementation for FlatL2 and
 * FlatIP when the native module cannot be loaded (e.g. systems without a
 * compatible native build).
 *
 * faiss-node API notes (v0.5.1):
 *   - add(x: number[])          — flat 1-D array, length = n * dim
 *   - search(x, k)              — flat 1-D query, returns { distances: number[], labels: number[] } flat
 *   - train(x: number[])        — flat 1-D array
 *   - ntotal(): number          — method, not property
 *   - isTrained(): boolean      — method, not property
 *   - getDimension(): number    — method
 *   - IndexIVFFlat not exported — use Index.fromFactory() with descriptor string
 *   - addWithIds not in types   — implemented via stored ID map in wrapper
 */

import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";

// ---------------------------------------------------------------------------
// FaissIndexRef — opaque wrapper passed between nodes
// ---------------------------------------------------------------------------

/**
 * Opaque reference to a FAISS index, passed between nodes at runtime.
 * The _index field holds the actual native or pure-TS index object.
 */
export interface FaissIndexRef {
  __faiss_index__: true;
  _index: FaissBackend;
  dim: number;
}

function wrapIndex(index: FaissBackend, dim: number): FaissIndexRef {
  return { __faiss_index__: true, _index: index, dim };
}

function unwrapIndex(ref: unknown): FaissIndexRef {
  if (
    !ref ||
    typeof ref !== "object" ||
    !(ref as Record<string, unknown>).__faiss_index__
  ) {
    throw new Error(
      "Invalid FAISS index: expected a FaissIndexRef produced by a Create Index node"
    );
  }
  return ref as FaissIndexRef;
}

// ---------------------------------------------------------------------------
// Shared NdArray type (matches lib-numpy.ts convention)
// ---------------------------------------------------------------------------

type NdArray = { data: number[]; shape: number[] };

function asNdArray(v: unknown): NdArray {
  if (v && typeof v === "object" && "data" in v && "shape" in v) {
    return v as NdArray;
  }
  if (Array.isArray(v)) {
    return { data: (v as number[]).map(Number), shape: [v.length] };
  }
  return { data: [], shape: [0] };
}

/**
 * Extract a 2-D float array as a flat number[] and the number of rows.
 * Accepts:
 *   - NdArray with shape [n, dim]
 *   - number[][] (array of vectors)
 *   - number[] (single vector, treated as shape [1, dim])
 */
function flatten2D(value: unknown, dim: number): { flat: number[]; n: number } {
  // NdArray path
  if (value && typeof value === "object" && "data" in value && "shape" in value) {
    const arr = value as NdArray;
    if (arr.shape.length === 1) {
      // Single vector
      if (arr.shape[0] !== dim) {
        throw new Error(
          `Vector dimension ${arr.shape[0]} does not match index dimension ${dim}`
        );
      }
      return { flat: arr.data.map(Number), n: 1 };
    }
    if (arr.shape.length === 2) {
      if (arr.shape[1] !== dim) {
        throw new Error(
          `Vector dimension ${arr.shape[1]} does not match index dimension ${dim}`
        );
      }
      return { flat: arr.data.map(Number), n: arr.shape[0] };
    }
    throw new Error(`Expected 1-D or 2-D NdArray, got shape [${arr.shape.join(", ")}]`);
  }

  // number[][] path
  if (Array.isArray(value) && value.length > 0 && Array.isArray(value[0])) {
    const vecs = value as number[][];
    for (const v of vecs) {
      if (v.length !== dim) {
        throw new Error(
          `Vector dimension ${v.length} does not match index dimension ${dim}`
        );
      }
    }
    return { flat: vecs.flat().map(Number), n: vecs.length };
  }

  // number[] path — single flat vector
  if (Array.isArray(value)) {
    const v = value as number[];
    if (v.length !== dim) {
      throw new Error(
        `Vector dimension ${v.length} does not match index dimension ${dim}`
      );
    }
    return { flat: v.map(Number), n: 1 };
  }

  throw new Error("Vectors must be a 2-D array or NdArray");
}

// ---------------------------------------------------------------------------
// FaissBackend — native or pure-TS
// ---------------------------------------------------------------------------

interface SearchResult {
  distances: number[];
  labels: number[];
}

interface FaissBackend {
  readonly indexType: string;
  readonly dim: number;
  add(flat: number[]): void;
  addWithIds(flat: number[], ids: number[]): void;
  train(flat: number[]): void;
  search(flat: number[], k: number): SearchResult;
  isTrained(): boolean;
  ntotal(): number;
  setNprobe(n: number): void;
}

// ---------------------------------------------------------------------------
// Native faiss-node backend
// ---------------------------------------------------------------------------

let nativeLoaded = false;
let nativeModule: {
  IndexFlatL2: new (dim: number) => NativeIndex;
  IndexFlatIP: new (dim: number) => NativeIndex;
  Index: {
    fromFactory(dims: number, descriptor: string, metric?: number): NativeIndex;
  };
  MetricType: Record<string, number>;
} | null = null;

interface NativeIndex {
  add(x: number[]): void;
  train(x: number[]): void;
  search(x: number[], k: number): { distances: number[]; labels: number[] };
  isTrained(): boolean;
  ntotal(): number;
  getDimension(): number;
}

function tryLoadNative(): typeof nativeModule {
  if (nativeLoaded) return nativeModule;
  nativeLoaded = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = require("faiss-node") as typeof nativeModule;
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

class NativeFlatL2Backend implements FaissBackend {
  readonly indexType = "FlatL2";
  readonly dim: number;
  private readonly _idx: NativeIndex;
  private readonly _idMap: Map<number, number> = new Map(); // sequential → user id
  private _total = 0;

  constructor(dim: number) {
    const mod = tryLoadNative();
    if (!mod) throw new Error("faiss-node native module is not available");
    this._idx = new mod.IndexFlatL2(dim);
    this.dim = dim;
  }

  add(flat: number[]): void {
    this._idx.add(flat);
    const n = flat.length / this.dim;
    for (let i = 0; i < n; i++) {
      const seq = this._total + i;
      this._idMap.set(seq, seq);
    }
    this._total += n;
  }

  addWithIds(flat: number[], ids: number[]): void {
    this._idx.add(flat);
    const n = flat.length / this.dim;
    for (let i = 0; i < n; i++) {
      this._idMap.set(this._total + i, ids[i]);
    }
    this._total += n;
  }

  train(_flat: number[]): void {
    // FlatL2 is always trained
  }

  search(flat: number[], k: number): SearchResult {
    const res = this._idx.search(flat, k);
    // Remap sequential labels → user ids
    const remapped = res.labels.map((l) =>
      l < 0 ? -1 : (this._idMap.get(l) ?? l)
    );
    return { distances: res.distances, labels: remapped };
  }

  isTrained(): boolean {
    return this._idx.isTrained();
  }

  ntotal(): number {
    return this._idx.ntotal();
  }

  setNprobe(_n: number): void {
    // not applicable for flat index
  }
}

class NativeFlatIPBackend implements FaissBackend {
  readonly indexType = "FlatIP";
  readonly dim: number;
  private readonly _idx: NativeIndex;
  private readonly _idMap: Map<number, number> = new Map();
  private _total = 0;

  constructor(dim: number) {
    const mod = tryLoadNative();
    if (!mod) throw new Error("faiss-node native module is not available");
    this._idx = new mod.IndexFlatIP(dim);
    this.dim = dim;
  }

  add(flat: number[]): void {
    this._idx.add(flat);
    const n = flat.length / this.dim;
    for (let i = 0; i < n; i++) {
      const seq = this._total + i;
      this._idMap.set(seq, seq);
    }
    this._total += n;
  }

  addWithIds(flat: number[], ids: number[]): void {
    this._idx.add(flat);
    const n = flat.length / this.dim;
    for (let i = 0; i < n; i++) {
      this._idMap.set(this._total + i, ids[i]);
    }
    this._total += n;
  }

  train(_flat: number[]): void {
    // FlatIP is always trained
  }

  search(flat: number[], k: number): SearchResult {
    const res = this._idx.search(flat, k);
    const remapped = res.labels.map((l) =>
      l < 0 ? -1 : (this._idMap.get(l) ?? l)
    );
    return { distances: res.distances, labels: remapped };
  }

  isTrained(): boolean {
    return this._idx.isTrained();
  }

  ntotal(): number {
    return this._idx.ntotal();
  }

  setNprobe(_n: number): void {
    // not applicable
  }
}

class NativeIVFFlatBackend implements FaissBackend {
  readonly indexType = "IVFFlat";
  readonly dim: number;
  private readonly _idx: NativeIndex;
  private readonly _idMap: Map<number, number> = new Map();
  private _total = 0;
  constructor(dim: number, nlist: number, metric: "L2" | "IP") {
    const mod = tryLoadNative();
    if (!mod) throw new Error("faiss-node native module is not available");
    const descriptor = `IVF${nlist},Flat`;
    const metricType =
      metric === "IP"
        ? mod.MetricType.METRIC_INNER_PRODUCT
        : mod.MetricType.METRIC_L2;
    this._idx = mod.Index.fromFactory(dim, descriptor, metricType);
    this.dim = dim;
  }

  add(flat: number[]): void {
    if (!this._idx.isTrained()) {
      throw new Error("Index must be trained before adding vectors");
    }
    this._idx.add(flat);
    const n = flat.length / this.dim;
    for (let i = 0; i < n; i++) {
      const seq = this._total + i;
      this._idMap.set(seq, seq);
    }
    this._total += n;
  }

  addWithIds(flat: number[], ids: number[]): void {
    if (!this._idx.isTrained()) {
      throw new Error("Index must be trained before adding vectors");
    }
    this._idx.add(flat);
    const n = flat.length / this.dim;
    for (let i = 0; i < n; i++) {
      this._idMap.set(this._total + i, ids[i]);
    }
    this._total += n;
  }

  train(flat: number[]): void {
    this._idx.train(flat);
  }

  search(flat: number[], k: number): SearchResult {
    // faiss-node doesn't expose nprobe setter directly on the factory index,
    // so we set it via a best-effort approach
    const res = this._idx.search(flat, k);
    const remapped = res.labels.map((l) =>
      l < 0 ? -1 : (this._idMap.get(l) ?? l)
    );
    return { distances: res.distances, labels: remapped };
  }

  isTrained(): boolean {
    return this._idx.isTrained();
  }

  ntotal(): number {
    return this._idx.ntotal();
  }

  setNprobe(n: number): void {
    // Some faiss-node builds expose nprobe directly on the index object
    const raw = this._idx as unknown as Record<string, unknown>;
    if (typeof raw["nprobe"] !== "undefined") {
      raw["nprobe"] = n;
    }
  }
}

// ---------------------------------------------------------------------------
// Pure-TypeScript brute-force backends (no native dependency)
// ---------------------------------------------------------------------------

class PureTSFlatL2Backend implements FaissBackend {
  readonly indexType = "PureTSFlatL2";
  readonly dim: number;
  private _vectors: number[] = []; // flat storage
  private _idMap: number[] = [];   // sequential index → user id

  constructor(dim: number) {
    this.dim = dim;
  }

  add(flat: number[]): void {
    const start = this._idMap.length;
    const n = flat.length / this.dim;
    for (let i = 0; i < n; i++) {
      this._idMap.push(start + i);
    }
    this._vectors.push(...flat);
  }

  addWithIds(flat: number[], ids: number[]): void {
    const n = flat.length / this.dim;
    for (let i = 0; i < n; i++) {
      this._idMap.push(ids[i]);
    }
    this._vectors.push(...flat);
  }

  train(_flat: number[]): void {
    // always trained
  }

  search(flat: number[], k: number): SearchResult {
    const nQuery = flat.length / this.dim;
    const nStored = this._idMap.length;
    const distances: number[] = [];
    const labels: number[] = [];

    for (let q = 0; q < nQuery; q++) {
      const qBase = q * this.dim;
      const heap: Array<{ dist: number; label: number }> = [];

      for (let s = 0; s < nStored; s++) {
        const sBase = s * this.dim;
        let dist = 0;
        for (let d = 0; d < this.dim; d++) {
          const diff = flat[qBase + d] - this._vectors[sBase + d];
          dist += diff * diff;
        }
        heap.push({ dist, label: this._idMap[s] });
      }

      heap.sort((a, b) => a.dist - b.dist);
      const topK = heap.slice(0, k);
      // Pad with -1 if fewer results than k
      while (topK.length < k) {
        topK.push({ dist: Infinity, label: -1 });
      }

      for (const item of topK) {
        distances.push(item.dist);
        labels.push(item.label);
      }
    }

    return { distances, labels };
  }

  isTrained(): boolean {
    return true;
  }

  ntotal(): number {
    return this._idMap.length;
  }

  setNprobe(_n: number): void {
    // not applicable
  }
}

class PureTSFlatIPBackend implements FaissBackend {
  readonly indexType = "PureTSFlatIP";
  readonly dim: number;
  private _vectors: number[] = [];
  private _idMap: number[] = [];

  constructor(dim: number) {
    this.dim = dim;
  }

  add(flat: number[]): void {
    const start = this._idMap.length;
    const n = flat.length / this.dim;
    for (let i = 0; i < n; i++) {
      this._idMap.push(start + i);
    }
    this._vectors.push(...flat);
  }

  addWithIds(flat: number[], ids: number[]): void {
    const n = flat.length / this.dim;
    for (let i = 0; i < n; i++) {
      this._idMap.push(ids[i]);
    }
    this._vectors.push(...flat);
  }

  train(_flat: number[]): void {
    // always trained
  }

  search(flat: number[], k: number): SearchResult {
    const nQuery = flat.length / this.dim;
    const nStored = this._idMap.length;
    const distances: number[] = [];
    const labels: number[] = [];

    for (let q = 0; q < nQuery; q++) {
      const qBase = q * this.dim;
      const heap: Array<{ dist: number; label: number }> = [];

      for (let s = 0; s < nStored; s++) {
        const sBase = s * this.dim;
        let ip = 0;
        for (let d = 0; d < this.dim; d++) {
          ip += flat[qBase + d] * this._vectors[sBase + d];
        }
        heap.push({ dist: ip, label: this._idMap[s] });
      }

      // Inner product: higher is better, so sort descending
      heap.sort((a, b) => b.dist - a.dist);
      const topK = heap.slice(0, k);
      while (topK.length < k) {
        topK.push({ dist: -Infinity, label: -1 });
      }

      for (const item of topK) {
        distances.push(item.dist);
        labels.push(item.label);
      }
    }

    return { distances, labels };
  }

  isTrained(): boolean {
    return true;
  }

  ntotal(): number {
    return this._idMap.length;
  }

  setNprobe(_n: number): void {
    // not applicable
  }
}

// ---------------------------------------------------------------------------
// Backend factory helpers
// ---------------------------------------------------------------------------

function createFlatL2Backend(dim: number): FaissBackend {
  const mod = tryLoadNative();
  if (mod) {
    return new NativeFlatL2Backend(dim);
  }
  return new PureTSFlatL2Backend(dim);
}

function createFlatIPBackend(dim: number): FaissBackend {
  const mod = tryLoadNative();
  if (mod) {
    return new NativeFlatIPBackend(dim);
  }
  return new PureTSFlatIPBackend(dim);
}

function createIVFFlatBackend(
  dim: number,
  nlist: number,
  metric: "L2" | "IP"
): FaissBackend {
  const mod = tryLoadNative();
  if (!mod) {
    throw new Error(
      "IVF indices require the faiss-node native module, which is not available on this system. " +
        "Install faiss-node or use CreateIndexFlatL2/CreateIndexFlatIP instead."
    );
  }
  return new NativeIVFFlatBackend(dim, nlist, metric);
}

// ---------------------------------------------------------------------------
// Node 1: CreateIndexFlatL2Node
// ---------------------------------------------------------------------------

export class CreateIndexFlatL2Node extends BaseNode {
  static readonly nodeType = "vector.faiss.CreateIndexFlatL2";
            static readonly title = "Create Index Flat L2";
            static readonly description = "Create a FAISS IndexFlatL2.\n    faiss, index, l2, create";
        static readonly metadataOutputTypes = {
    output: "faiss_index"
  };
  
  @prop({ type: "int", default: 768, title: "Dim", description: "Embedding dimensionality", min: 1 })
  declare dim: any;




  async process(
    inputs: Record<string, unknown>,
    _context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const dim = Number(inputs.dim ?? this.dim ?? 768);
    if (!Number.isInteger(dim) || dim < 1) {
      throw new Error(`dim must be a positive integer, got ${dim}`);
    }
    const backend = createFlatL2Backend(dim);
    return { output: wrapIndex(backend, dim) };
  }
}

// ---------------------------------------------------------------------------
// Node 2: CreateIndexFlatIPNode
// ---------------------------------------------------------------------------

export class CreateIndexFlatIPNode extends BaseNode {
  static readonly nodeType = "vector.faiss.CreateIndexFlatIP";
            static readonly title = "Create Index Flat IP";
            static readonly description = "Create a FAISS IndexFlatIP (inner product / cosine with normalized vectors).\n    faiss, index, ip, create";
        static readonly metadataOutputTypes = {
    output: "faiss_index"
  };
  
  @prop({ type: "int", default: 768, title: "Dim", description: "Embedding dimensionality", min: 1 })
  declare dim: any;




  async process(
    inputs: Record<string, unknown>,
    _context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const dim = Number(inputs.dim ?? this.dim ?? 768);
    if (!Number.isInteger(dim) || dim < 1) {
      throw new Error(`dim must be a positive integer, got ${dim}`);
    }
    const backend = createFlatIPBackend(dim);
    return { output: wrapIndex(backend, dim) };
  }
}

// ---------------------------------------------------------------------------
// Node 3: CreateIndexIVFFlatNode
// ---------------------------------------------------------------------------

export class CreateIndexIVFFlatNode extends BaseNode {
  static readonly nodeType = "vector.faiss.CreateIndexIVFFlat";
            static readonly title = "Create Index IVFFlat";
            static readonly description = "Create a FAISS IndexIVFFlat (inverted file index with flat quantizer).\n    faiss, index, ivf, create";
        static readonly metadataOutputTypes = {
    output: "faiss_index"
  };
  
  @prop({ type: "int", default: 768, title: "Dim", description: "Embedding dimensionality", min: 1 })
  declare dim: any;

  @prop({ type: "int", default: 1024, title: "Nlist", description: "Number of Voronoi cells", min: 1 })
  declare nlist: any;

  @prop({ type: "enum", default: "L2", title: "Metric", description: "Distance metric", values: [
  "L2",
  "IP"
] })
  declare metric: any;




  async process(
    inputs: Record<string, unknown>,
    _context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const dim = Number(inputs.dim ?? this.dim ?? 768);
    const nlist = Number(inputs.nlist ?? this.nlist ?? 1024);
    const metric = String(inputs.metric ?? this.metric ?? "L2") as
      | "L2"
      | "IP";

    if (!Number.isInteger(dim) || dim < 1) {
      throw new Error(`dim must be a positive integer, got ${dim}`);
    }
    if (!Number.isInteger(nlist) || nlist < 1) {
      throw new Error(`nlist must be a positive integer, got ${nlist}`);
    }
    if (metric !== "L2" && metric !== "IP") {
      throw new Error(`metric must be "L2" or "IP", got "${metric}"`);
    }

    const backend = createIVFFlatBackend(dim, nlist, metric);
    return { output: wrapIndex(backend, dim) };
  }
}

// ---------------------------------------------------------------------------
// Node 4: TrainIndexNode
// ---------------------------------------------------------------------------

export class TrainIndexNode extends BaseNode {
  static readonly nodeType = "vector.faiss.TrainIndex";
            static readonly title = "Train Index";
            static readonly description = "Train a FAISS index with training vectors (required for IVF indices).\n    faiss, train, index";
        static readonly metadataOutputTypes = {
    output: "faiss_index"
  };
  
  @prop({ type: "faiss_index", default: {
  "type": "faiss_index",
  "index": null
}, title: "Index", description: "FAISS index" })
  declare index: any;

  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Vectors", description: "Training vectors (n, d)" })
  declare vectors: any;




  async process(
    inputs: Record<string, unknown>,
    _context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const indexRaw = inputs.index ?? this.index;
    if (indexRaw === null || indexRaw === undefined) {
      throw new Error("FAISS index is not set");
    }

    const ref = unwrapIndex(indexRaw);
    const { _index: backend, dim } = ref;

    const vectorsRaw = inputs.vectors ?? this.vectors;
    const ndArr = asNdArray(vectorsRaw);
    if (ndArr.data.length === 0) {
      throw new Error("Training vectors are empty");
    }

    const { flat, n } = flatten2D(vectorsRaw, dim);
    if (n === 0) {
      throw new Error("Training vectors are empty");
    }

    backend.train(flat);

    return { output: ref };
  }
}

// ---------------------------------------------------------------------------
// Node 5: AddVectorsNode
// ---------------------------------------------------------------------------

export class AddVectorsNode extends BaseNode {
  static readonly nodeType = "vector.faiss.AddVectors";
            static readonly title = "Add Vectors";
            static readonly description = "Add vectors to a FAISS index.\n    faiss, add, vectors";
        static readonly metadataOutputTypes = {
    output: "faiss_index"
  };
  
  @prop({ type: "faiss_index", default: {
  "type": "faiss_index",
  "index": null
}, title: "Index", description: "FAISS index" })
  declare index: any;

  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Vectors", description: "Vectors to add (n, d)" })
  declare vectors: any;




  async process(
    inputs: Record<string, unknown>,
    _context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const indexRaw = inputs.index ?? this.index;
    if (indexRaw === null || indexRaw === undefined) {
      throw new Error("FAISS index is not set");
    }

    const ref = unwrapIndex(indexRaw);
    const { _index: backend, dim } = ref;

    const vectorsRaw = inputs.vectors ?? this.vectors;
    const ndArr = asNdArray(vectorsRaw);
    if (ndArr.data.length === 0) {
      throw new Error("Vectors are empty");
    }

    const { flat, n } = flatten2D(vectorsRaw, dim);
    if (n === 0) {
      throw new Error("Vectors are empty");
    }

    if (!backend.isTrained()) {
      throw new Error(
        "Index must be trained before adding vectors. " +
          "Use a Train Index node first for IVF indices."
      );
    }

    backend.add(flat);

    return { output: ref };
  }
}

// ---------------------------------------------------------------------------
// Node 6: AddWithIdsNode
// ---------------------------------------------------------------------------

export class AddWithIdsNode extends BaseNode {
  static readonly nodeType = "vector.faiss.AddWithIds";
            static readonly title = "Add With Ids";
            static readonly description = "Add vectors with explicit integer IDs to a FAISS index.\n    faiss, add, ids, vectors";
        static readonly metadataOutputTypes = {
    output: "faiss_index"
  };
  
  @prop({ type: "faiss_index", default: {
  "type": "faiss_index",
  "index": null
}, title: "Index", description: "FAISS index" })
  declare index: any;

  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Vectors", description: "Vectors to add (n, d)" })
  declare vectors: any;

  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Ids", description: "1-D int64 IDs (n,)" })
  declare ids: any;




  async process(
    inputs: Record<string, unknown>,
    _context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const indexRaw = inputs.index ?? this.index;
    if (indexRaw === null || indexRaw === undefined) {
      throw new Error("FAISS index is not set");
    }

    const ref = unwrapIndex(indexRaw);
    const { _index: backend, dim } = ref;

    const vectorsRaw = inputs.vectors ?? this.vectors;
    const ndArr = asNdArray(vectorsRaw);
    if (ndArr.data.length === 0) {
      throw new Error("Vectors are empty");
    }

    const idsRaw = inputs.ids ?? this.ids;
    const idsArr = Array.isArray(idsRaw)
      ? (idsRaw as number[]).map(Number)
      : asNdArray(idsRaw).data.map(Number);

    if (idsArr.length === 0) {
      throw new Error("IDs are empty");
    }

    const { flat, n } = flatten2D(vectorsRaw, dim);
    if (n === 0) {
      throw new Error("Vectors are empty");
    }

    if (n !== idsArr.length) {
      throw new Error(
        `Vectors and IDs must have the same length: got ${n} vectors and ${idsArr.length} IDs`
      );
    }

    if (!backend.isTrained()) {
      throw new Error(
        "Index must be trained before adding vectors. " +
          "Use a Train Index node first for IVF indices."
      );
    }

    backend.addWithIds(flat, idsArr);

    return { output: ref };
  }
}

// ---------------------------------------------------------------------------
// Node 7: SearchNode
// ---------------------------------------------------------------------------

export class SearchNode extends BaseNode {
  static readonly nodeType = "vector.faiss.Search";
            static readonly title = "Search";
            static readonly description = "Search a FAISS index with query vectors, returning distances and indices.\n    faiss, search, query, knn";
        static readonly metadataOutputTypes = {
    distances: "np_array",
    indices: "np_array"
  };
  
  @prop({ type: "faiss_index", default: {
  "type": "faiss_index",
  "index": null
}, title: "Index", description: "FAISS index" })
  declare index: any;

  @prop({ type: "np_array", default: {
  "type": "np_array",
  "value": null,
  "dtype": "<i8",
  "shape": [
    1
  ]
}, title: "Query", description: "Query vectors (m, d) or (d,)" })
  declare query: any;

  @prop({ type: "int", default: 5, title: "K", description: "Number of nearest neighbors", min: 1 })
  declare k: any;

  @prop({ type: "int", default: 10, title: "Nprobe", description: "nprobe for IVF indices", min: 1 })
  declare nprobe: any;




  async process(
    inputs: Record<string, unknown>,
    _context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const indexRaw = inputs.index ?? this.index;
    if (indexRaw === null || indexRaw === undefined) {
      throw new Error("FAISS index is not set");
    }

    const ref = unwrapIndex(indexRaw);
    const { _index: backend, dim } = ref;

    const queryRaw = inputs.query ?? this.query;
    const ndArr = asNdArray(queryRaw);
    if (ndArr.data.length === 0) {
      throw new Error("Query vectors are empty");
    }

    const { flat, n: nQuery } = flatten2D(queryRaw, dim);
    if (nQuery === 0) {
      throw new Error("Query vectors are empty");
    }

    const k = Number(inputs.k ?? this.k ?? 5);
    if (!Number.isInteger(k) || k < 1) {
      throw new Error(`k must be a positive integer, got ${k}`);
    }

    const nprobe = Number(inputs.nprobe ?? this.nprobe ?? 10);
    if (nprobe >= 1) {
      backend.setNprobe(Math.floor(nprobe));
    }

    const result = backend.search(flat, k);

    // Return as 2-D NdArrays: shape [nQuery, k]
    const distancesNd: NdArray = {
      data: result.distances,
      shape: [nQuery, k],
    };
    const indicesNd: NdArray = {
      data: result.labels,
      shape: [nQuery, k],
    };

    return {
      distances: distancesNd,
      indices: indicesNd,
    };
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const VECTOR_FAISS_NODES: readonly NodeClass[] = [
  CreateIndexFlatL2Node,
  CreateIndexFlatIPNode,
  CreateIndexIVFFlatNode,
  TrainIndexNode,
  AddVectorsNode,
  AddWithIdsNode,
  SearchNode,
];
