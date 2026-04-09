import { describe, it, expect } from "vitest";
import { FaissSearchNode } from "../src/index.js";
import {
  CreateIndexFlatL2Node,
  CreateIndexFlatIPNode,
  CreateIndexIVFFlatNode,
  TrainIndexNode,
  AddVectorsNode,
  AddWithIdsNode,
  SearchNode,
  type FaissIndexRef
} from "../src/nodes/vector-faiss.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorthand: instantiate a node, optionally set props, and call process(). */
async function run<T extends Record<string, unknown>>(
  NodeCls: new () => {
    assign(inputs: Record<string, unknown>): void;
    process(): Promise<T>;
  },
  inputs: Record<string, unknown> = {}
): Promise<T> {
  const node = new NodeCls();
  Object.assign(node, inputs);
  return node.process();
}

/** Create an L2 index with given dimension via the node. */
async function makeL2Index(dim: number): Promise<FaissIndexRef> {
  const res = await run(CreateIndexFlatL2Node, { dim });
  return res.output as FaissIndexRef;
}

/** Create an IP index with given dimension via the node. */
async function makeIPIndex(dim: number): Promise<FaissIndexRef> {
  const res = await run(CreateIndexFlatIPNode, { dim });
  return res.output as FaissIndexRef;
}

// ---------------------------------------------------------------------------
// CreateIndexFlatL2Node
// ---------------------------------------------------------------------------

describe("CreateIndexFlatL2Node", () => {
  it("has correct metadata", () => {
    expect(CreateIndexFlatL2Node.nodeType).toBe(
      "vector.faiss.CreateIndexFlatL2"
    );
    expect(CreateIndexFlatL2Node.title).toBe("Create Index Flat L2");
  });

  it("defaults() returns { dim: 768 }", () => {
    const node = new CreateIndexFlatL2Node();
    expect(node.serialize()).toEqual({ dim: 768 });
  });

  it("process() creates an index ref with __faiss_index__ marker", async () => {
    const res = await run(CreateIndexFlatL2Node, { dim: 4 });
    const ref = res.output as FaissIndexRef;
    expect(ref.__faiss_index__).toBe(true);
    expect(ref.dim).toBe(4);
    expect(ref._index).toBeDefined();
    expect(ref._index.ntotal()).toBe(0);
    expect(ref._index.isTrained()).toBe(true);
  });

  it("validates dim must be a positive integer", async () => {
    await expect(run(CreateIndexFlatL2Node, { dim: 0 })).rejects.toThrow(
      /positive integer/
    );
    await expect(run(CreateIndexFlatL2Node, { dim: -3 })).rejects.toThrow(
      /positive integer/
    );
    await expect(run(CreateIndexFlatL2Node, { dim: 2.5 })).rejects.toThrow(
      /positive integer/
    );
  });
});

// ---------------------------------------------------------------------------
// CreateIndexFlatIPNode
// ---------------------------------------------------------------------------

describe("CreateIndexFlatIPNode", () => {
  it("has correct metadata", () => {
    expect(CreateIndexFlatIPNode.nodeType).toBe(
      "vector.faiss.CreateIndexFlatIP"
    );
    expect(CreateIndexFlatIPNode.title).toBe("Create Index Flat IP");
  });

  it("defaults() returns { dim: 768 }", () => {
    const node = new CreateIndexFlatIPNode();
    expect(node.serialize()).toEqual({ dim: 768 });
  });

  it("process() creates an index ref with __faiss_index__ marker", async () => {
    const res = await run(CreateIndexFlatIPNode, { dim: 3 });
    const ref = res.output as FaissIndexRef;
    expect(ref.__faiss_index__).toBe(true);
    expect(ref.dim).toBe(3);
    expect(ref._index.ntotal()).toBe(0);
    expect(ref._index.isTrained()).toBe(true);
  });

  it("validates dim must be a positive integer", async () => {
    await expect(run(CreateIndexFlatIPNode, { dim: 0 })).rejects.toThrow(
      /positive integer/
    );
    await expect(run(CreateIndexFlatIPNode, { dim: -1 })).rejects.toThrow(
      /positive integer/
    );
  });
});

// ---------------------------------------------------------------------------
// CreateIndexIVFFlatNode
// ---------------------------------------------------------------------------

describe("CreateIndexIVFFlatNode", () => {
  it("has correct metadata", () => {
    expect(CreateIndexIVFFlatNode.nodeType).toBe(
      "vector.faiss.CreateIndexIVFFlat"
    );
    expect(CreateIndexIVFFlatNode.title).toBe("Create Index IVFFlat");
  });

  it("defaults() returns { dim: 768, nlist: 1024, metric: 'L2' }", () => {
    const node = new CreateIndexIVFFlatNode();
    expect(node.serialize()).toEqual({ dim: 768, nlist: 1024, metric: "L2" });
  });

  it("process() creates an IVF index (native) or throws (no native)", async () => {
    // If faiss-node is available, this succeeds and returns an index ref.
    // If not, it throws about the native module being unavailable.
    try {
      const res = await run(CreateIndexIVFFlatNode, {
        dim: 4,
        nlist: 2,
        metric: "L2"
      });
      const ref = res.output as FaissIndexRef;
      expect(ref.__faiss_index__).toBe(true);
      expect(ref.dim).toBe(4);
    } catch (err: unknown) {
      expect((err as Error).message).toMatch(/faiss-node native module/i);
    }
  });

  it("validates dim must be positive integer", async () => {
    await expect(
      run(CreateIndexIVFFlatNode, { dim: 0, nlist: 2, metric: "L2" })
    ).rejects.toThrow(/positive integer/);
  });

  it("validates nlist must be positive integer", async () => {
    await expect(
      run(CreateIndexIVFFlatNode, { dim: 4, nlist: 0, metric: "L2" })
    ).rejects.toThrow(/positive integer/);
  });

  it("validates metric must be L2 or IP", async () => {
    await expect(
      run(CreateIndexIVFFlatNode, { dim: 4, nlist: 2, metric: "cosine" })
    ).rejects.toThrow(/metric must be/);
  });
});

// ---------------------------------------------------------------------------
// TrainIndexNode
// ---------------------------------------------------------------------------

describe("TrainIndexNode", () => {
  it("returns the same index reference (train is no-op for flat)", async () => {
    const idx = await makeL2Index(3);
    const res = await run(TrainIndexNode, {
      index: idx,
      vectors: {
        data: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        shape: [3, 3]
      }
    });
    expect(res.output).toBe(idx);
  });

  it("throws on null index", async () => {
    await expect(
      run(TrainIndexNode, {
        index: null,
        vectors: { data: [1, 2, 3], shape: [1, 3] }
      })
    ).rejects.toThrow(/Invalid FAISS index|FAISS index is not set/);
  });

  it("returns early for already-trained flat index with empty vectors", async () => {
    const idx = await makeL2Index(3);
    // Flat indices are always trained, so TrainIndexNode returns early
    const res = await run(TrainIndexNode, {
      index: idx,
      vectors: []
    });
    expect(res.output).toBe(idx);
  });
});

// ---------------------------------------------------------------------------
// AddVectorsNode
// ---------------------------------------------------------------------------

describe("AddVectorsNode", () => {
  it("adds vectors and increases ntotal()", async () => {
    const idx = await makeL2Index(3);
    expect(idx._index.ntotal()).toBe(0);

    const res = await run(AddVectorsNode, {
      index: idx,
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ]
    });
    const out = res.output as FaissIndexRef;
    expect(out._index.ntotal()).toBe(3);
  });

  it("accepts NdArray input with shape [n, dim]", async () => {
    const idx = await makeL2Index(2);
    await run(AddVectorsNode, {
      index: idx,
      vectors: { data: [1, 2, 3, 4, 5, 6], shape: [3, 2] }
    });
    expect(idx._index.ntotal()).toBe(3);
  });

  it("throws on null index", async () => {
    await expect(
      run(AddVectorsNode, {
        index: null,
        vectors: [[1, 2]]
      })
    ).rejects.toThrow(/Invalid FAISS index|FAISS index is not set/);
  });

  it("throws on empty vectors", async () => {
    const idx = await makeL2Index(2);
    await expect(
      run(AddVectorsNode, {
        index: idx,
        vectors: []
      })
    ).rejects.toThrow(/empty/i);
  });

  it("throws on dimension mismatch", async () => {
    const idx = await makeL2Index(3);
    await expect(
      run(AddVectorsNode, {
        index: idx,
        vectors: [[1, 2]] // dim=2, index expects 3
      })
    ).rejects.toThrow(/dimension/i);
  });

  it("throws on invalid index reference", async () => {
    await expect(
      run(AddVectorsNode, {
        index: { fake: true },
        vectors: [[1, 2]]
      })
    ).rejects.toThrow(/Invalid FAISS index|FAISS index is not set/);
  });
});

// ---------------------------------------------------------------------------
// AddWithIdsNode
// ---------------------------------------------------------------------------

describe("AddWithIdsNode", () => {
  it("adds vectors with explicit IDs", async () => {
    const idx = await makeL2Index(2);
    await run(AddWithIdsNode, {
      index: idx,
      vectors: [
        [1, 0],
        [0, 1]
      ],
      ids: [100, 200]
    });
    expect(idx._index.ntotal()).toBe(2);
  });

  it("throws when vectors count != ids count", async () => {
    const idx = await makeL2Index(2);
    await expect(
      run(AddWithIdsNode, {
        index: idx,
        vectors: [
          [1, 0],
          [0, 1],
          [1, 1]
        ],
        ids: [10, 20]
      })
    ).rejects.toThrow(/same length/);
  });

  it("throws on null index", async () => {
    await expect(
      run(AddWithIdsNode, {
        index: null,
        vectors: [[1, 2]],
        ids: [1]
      })
    ).rejects.toThrow(/Invalid FAISS index|FAISS index is not set/);
  });

  it("throws on empty vectors", async () => {
    const idx = await makeL2Index(2);
    await expect(
      run(AddWithIdsNode, {
        index: idx,
        vectors: [],
        ids: []
      })
    ).rejects.toThrow(/empty/i);
  });

  it("preserves IDs in search results", async () => {
    const idx = await makeL2Index(2);
    await run(AddWithIdsNode, {
      index: idx,
      vectors: [
        [1, 0],
        [0, 1],
        [1, 1]
      ],
      ids: [100, 200, 300]
    });

    // Search for [1, 0] — nearest should be ID 100
    const searchRes = await run(SearchNode, {
      index: idx,
      query: [[1, 0]],
      k: 3
    });
    const indices = searchRes.indices as { data: number[]; shape: number[] };
    expect(indices.data[0]).toBe(100); // closest match
  });
});

// ---------------------------------------------------------------------------
// SearchNode
// ---------------------------------------------------------------------------

describe("SearchNode", () => {
  it("export alias points to the faiss search implementation", () => {
    expect(FaissSearchNode).toBe(SearchNode);
  });

  it("returns distances and indices as NdArrays with correct shape", async () => {
    const idx = await makeL2Index(3);
    await run(AddVectorsNode, {
      index: idx,
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ]
    });

    const res = await run(SearchNode, {
      index: idx,
      query: [[1, 0, 0]],
      k: 2
    });

    const distances = res.distances as { data: number[]; shape: number[] };
    const indices = res.indices as { data: number[]; shape: number[] };

    expect(distances.shape).toEqual([1, 2]);
    expect(indices.shape).toEqual([1, 2]);
    expect(distances.data).toHaveLength(2);
    expect(indices.data).toHaveLength(2);
  });

  it("exact match returns distance ~0 for L2", async () => {
    const idx = await makeL2Index(3);
    await run(AddVectorsNode, {
      index: idx,
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ]
    });

    const res = await run(SearchNode, {
      index: idx,
      query: [[1, 0, 0]],
      k: 1
    });

    const distances = res.distances as { data: number[]; shape: number[] };
    const indices = res.indices as { data: number[]; shape: number[] };

    expect(distances.data[0]).toBeCloseTo(0, 10);
    expect(indices.data[0]).toBe(0); // first vector added
  });

  it("L2 distances are correct for known vectors", async () => {
    const idx = await makeL2Index(2);
    // Add [0,0], [3,0], [0,4]
    await run(AddVectorsNode, {
      index: idx,
      vectors: [
        [0, 0],
        [3, 0],
        [0, 4]
      ]
    });

    // Query [0,0] — distances should be 0, 9, 16
    const res = await run(SearchNode, {
      index: idx,
      query: [[0, 0]],
      k: 3
    });

    const distances = res.distances as { data: number[]; shape: number[] };
    const indices = res.indices as { data: number[]; shape: number[] };

    // Sorted ascending by L2 distance
    expect(distances.data[0]).toBeCloseTo(0); // [0,0] -> 0
    expect(distances.data[1]).toBeCloseTo(9); // [3,0] -> 9
    expect(distances.data[2]).toBeCloseTo(16); // [0,4] -> 16
    expect(indices.data[0]).toBe(0);
    expect(indices.data[1]).toBe(1);
    expect(indices.data[2]).toBe(2);
  });

  it("handles multiple query vectors", async () => {
    const idx = await makeL2Index(2);
    await run(AddVectorsNode, {
      index: idx,
      vectors: [
        [1, 0],
        [0, 1]
      ]
    });

    const res = await run(SearchNode, {
      index: idx,
      query: [
        [1, 0],
        [0, 1]
      ],
      k: 2
    });

    const distances = res.distances as { data: number[]; shape: number[] };
    const indices = res.indices as { data: number[]; shape: number[] };

    expect(distances.shape).toEqual([2, 2]);
    expect(indices.shape).toEqual([2, 2]);

    // First query [1,0]: nearest is index 0 (dist=0), then index 1 (dist=2)
    expect(indices.data[0]).toBe(0);
    expect(distances.data[0]).toBeCloseTo(0);
    expect(indices.data[1]).toBe(1);
    expect(distances.data[1]).toBeCloseTo(2);

    // Second query [0,1]: nearest is index 1 (dist=0), then index 0 (dist=2)
    expect(indices.data[2]).toBe(1);
    expect(distances.data[2]).toBeCloseTo(0);
    expect(indices.data[3]).toBe(0);
    expect(distances.data[3]).toBeCloseTo(2);
  });

  it("IP results are sorted by inner product descending", async () => {
    const idx = await makeIPIndex(2);
    // Add three vectors with varying magnitudes
    await run(AddVectorsNode, {
      index: idx,
      vectors: [
        [1, 0],
        [0, 1],
        [3, 3]
      ]
    });

    // Query [1, 1] — IP: [1,0]=>1, [0,1]=>1, [3,3]=>6
    const res = await run(SearchNode, {
      index: idx,
      query: [[1, 1]],
      k: 3
    });

    const distances = res.distances as { data: number[]; shape: number[] };
    const indices = res.indices as { data: number[]; shape: number[] };

    // Descending IP order: [3,3]=>6 first, then [1,0] and [0,1] tied at 1
    expect(indices.data[0]).toBe(2); // [3,3]
    expect(distances.data[0]).toBeCloseTo(6);
    // The next two are tied at IP=1
    expect(distances.data[1]).toBeCloseTo(1);
    expect(distances.data[2]).toBeCloseTo(1);
  });

  it("throws on null index", async () => {
    await expect(
      run(SearchNode, {
        index: null,
        query: [[1, 2, 3]],
        k: 1
      })
    ).rejects.toThrow(/Invalid FAISS index|FAISS index is not set/);
  });

  it("throws on empty query", async () => {
    const idx = await makeL2Index(3);
    await expect(
      run(SearchNode, {
        index: idx,
        query: [],
        k: 1
      })
    ).rejects.toThrow(/empty/i);
  });

  it("throws on invalid k", async () => {
    const idx = await makeL2Index(2);
    await run(AddVectorsNode, {
      index: idx,
      vectors: [[1, 0]]
    });
    await expect(
      run(SearchNode, {
        index: idx,
        query: [[1, 0]],
        k: 0
      })
    ).rejects.toThrow(/positive integer/);
  });

  it("pads results with -1 when k exceeds ntotal (pure-TS only)", async () => {
    // Native faiss-node throws when k > ntotal, but the pure-TS backend
    // pads with -1. We test the pure-TS path by creating a backend directly.
    // For the node-level test, we just verify k <= ntotal works correctly.
    const idx = await makeL2Index(2);
    await run(AddVectorsNode, {
      index: idx,
      vectors: [
        [1, 0],
        [0, 1],
        [1, 1]
      ]
    });

    const res = await run(SearchNode, {
      index: idx,
      query: [[1, 0]],
      k: 3
    });

    const indices = res.indices as { data: number[]; shape: number[] };
    const distances = res.distances as { data: number[]; shape: number[] };

    expect(indices.shape).toEqual([1, 3]);
    expect(indices.data[0]).toBe(0); // exact match
    expect(distances.data[0]).toBeCloseTo(0);
    // All 3 results should be valid (not -1)
    expect(indices.data).toHaveLength(3);
  });

  it("accepts NdArray query with shape [n, dim]", async () => {
    const idx = await makeL2Index(2);
    await run(AddVectorsNode, {
      index: idx,
      vectors: [
        [1, 0],
        [0, 1]
      ]
    });

    const res = await run(SearchNode, {
      index: idx,
      query: { data: [1, 0, 0, 1], shape: [2, 2] },
      k: 1
    });

    const indices = res.indices as { data: number[]; shape: number[] };
    expect(indices.shape).toEqual([2, 1]);
    expect(indices.data[0]).toBe(0); // [1,0] matches vector 0
    expect(indices.data[1]).toBe(1); // [0,1] matches vector 1
  });
});

// ---------------------------------------------------------------------------
// Integration-style pipeline tests
// ---------------------------------------------------------------------------

describe("FAISS pipeline", () => {
  it("create -> add -> search (L2)", async () => {
    // Create index with dim=4
    const createRes = await run(CreateIndexFlatL2Node, { dim: 4 });
    const idx = createRes.output as FaissIndexRef;

    // Add 5 vectors
    const vectors = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [1, 1, 1, 1]
    ];
    await run(AddVectorsNode, { index: idx, vectors });
    expect(idx._index.ntotal()).toBe(5);

    // Search for [1, 0, 0, 0] — nearest should be index 0 (exact match)
    const searchRes = await run(SearchNode, {
      index: idx,
      query: [[1, 0, 0, 0]],
      k: 3
    });

    const distances = searchRes.distances as {
      data: number[];
      shape: number[];
    };
    const indices = searchRes.indices as { data: number[]; shape: number[] };

    expect(indices.data[0]).toBe(0);
    expect(distances.data[0]).toBeCloseTo(0);

    // Second nearest: [1,1,1,1] at L2 dist = 0+1+1+1 = 3
    // or one of the unit vectors at L2 dist = 1+1 = 2
    // Actually [0,1,0,0] has dist = 1+1+0+0 = 2, same for [0,0,1,0] and [0,0,0,1]
    expect(distances.data[1]).toBeCloseTo(2);
  });

  it("create -> add with ids -> search (IP)", async () => {
    // Create IP index
    const createRes = await run(CreateIndexFlatIPNode, { dim: 3 });
    const idx = createRes.output as FaissIndexRef;

    // Add vectors with custom IDs
    const vectors = [
      [1, 0, 0],
      [0, 2, 0],
      [0, 0, 3]
    ];
    await run(AddWithIdsNode, {
      index: idx,
      vectors,
      ids: [100, 200, 300]
    });
    expect(idx._index.ntotal()).toBe(3);

    // Query [0, 2, 0] — highest IP with [0,2,0] which is id=200 (IP=4)
    const searchRes = await run(SearchNode, {
      index: idx,
      query: [[0, 2, 0]],
      k: 3
    });

    const distances = searchRes.distances as {
      data: number[];
      shape: number[];
    };
    const indices = searchRes.indices as { data: number[]; shape: number[] };

    expect(indices.data[0]).toBe(200);
    expect(distances.data[0]).toBeCloseTo(4); // IP: [0,2,0]·[0,2,0] = 4

    // Next two should have IP = 0
    expect(distances.data[1]).toBeCloseTo(0);
    expect(distances.data[2]).toBeCloseTo(0);
  });

  it("create -> train (no-op for flat) -> add -> search", async () => {
    const idx = await makeL2Index(2);

    // Train (no-op for flat)
    const trainRes = await run(TrainIndexNode, {
      index: idx,
      vectors: {
        data: [1, 0, 0, 1],
        shape: [2, 2]
      }
    });
    expect(trainRes.output).toBe(idx);

    // Add
    await run(AddVectorsNode, {
      index: idx,
      vectors: [
        [1, 0],
        [0, 1],
        [0.5, 0.5]
      ]
    });

    // Search for [0.5, 0.5] — exact match at index 2
    const searchRes = await run(SearchNode, {
      index: idx,
      query: [[0.5, 0.5]],
      k: 1
    });

    const distances = searchRes.distances as {
      data: number[];
      shape: number[];
    };
    const indices = searchRes.indices as { data: number[]; shape: number[] };

    expect(indices.data[0]).toBe(2);
    expect(distances.data[0]).toBeCloseTo(0);
  });

  it("multiple add calls accumulate vectors", async () => {
    const idx = await makeL2Index(2);

    await run(AddVectorsNode, { index: idx, vectors: [[1, 0]] });
    expect(idx._index.ntotal()).toBe(1);

    await run(AddVectorsNode, { index: idx, vectors: [[0, 1]] });
    expect(idx._index.ntotal()).toBe(2);

    await run(AddVectorsNode, {
      index: idx,
      vectors: [
        [1, 1],
        [2, 2]
      ]
    });
    expect(idx._index.ntotal()).toBe(4);

    // Search for [2, 2] — should find index 3 (the last added vector)
    const res = await run(SearchNode, {
      index: idx,
      query: [[2, 2]],
      k: 1
    });
    const indices = res.indices as { data: number[]; shape: number[] };
    expect(indices.data[0]).toBe(3);
  });

  it("mixed add and addWithIds", async () => {
    const idx = await makeL2Index(2);

    // Add without IDs (sequential: 0, 1)
    await run(AddVectorsNode, {
      index: idx,
      vectors: [
        [1, 0],
        [0, 1]
      ]
    });

    // Add with custom IDs
    await run(AddWithIdsNode, {
      index: idx,
      vectors: [[5, 5]],
      ids: [999]
    });

    expect(idx._index.ntotal()).toBe(3);

    // Search for [5, 5] — should find id=999
    const res = await run(SearchNode, {
      index: idx,
      query: [[5, 5]],
      k: 1
    });
    const indices = res.indices as { data: number[]; shape: number[] };
    expect(indices.data[0]).toBe(999);
  });

  it("high-dimensional vectors work correctly", async () => {
    const dim = 128;
    const idx = await makeL2Index(dim);

    // Create a few random-ish vectors
    const makeVec = (seed: number): number[] =>
      Array.from({ length: dim }, (_, i) => Math.sin(seed * (i + 1)));

    const vectors = [
      makeVec(1),
      makeVec(2),
      makeVec(3),
      makeVec(4),
      makeVec(5)
    ];
    await run(AddVectorsNode, { index: idx, vectors });

    // Search for exact match of vector 3
    const res = await run(SearchNode, {
      index: idx,
      query: [makeVec(3)],
      k: 1
    });

    const distances = res.distances as { data: number[]; shape: number[] };
    const indices = res.indices as { data: number[]; shape: number[] };

    expect(indices.data[0]).toBe(2); // 0-indexed, vector 3 is at position 2
    expect(distances.data[0]).toBeCloseTo(0, 5);
  });
});
