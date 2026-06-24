import {
  outputOf,
  assetToOutputValue,
  assetToGeneration,
  mergeGenerations,
  getCurrentGeneration,
  groupByRun,
  getCurrentRun,
  selectedOutputValues,
  type Generation
} from "../nodeGenerations";
import type { Asset } from "../../stores/ApiTypes";

const gen = (outputs: Record<string, unknown>): Generation => ({
  id: "g1",
  jobId: "j1",
  createdAt: 1,
  outputs,
  status: "completed"
});

const asset = (id: string, jobId: string, createdAt: string): Asset =>
  ({
    id,
    job_id: jobId,
    node_id: "n1",
    content_type: "image/png",
    get_url: `http://x/${id}.png`,
    created_at: createdAt
  }) as unknown as Asset;

describe("outputOf", () => {
  it("returns the named handle when present", () => {
    expect(outputOf(gen({ image: "A", mask: "B" }), "image")).toBe("A");
  });
  it("falls through to the sole output when the handle does not match", () => {
    // single-output node whose edge handle differs from the stored key
    expect(outputOf(gen({ output: "X" }), "image")).toBe("X");
  });
  it("returns the whole record for a handle miss on a multi-output node", () => {
    expect(outputOf(gen({ a: 1, b: 2 }), "c")).toEqual({ a: 1, b: 2 });
  });
  it("returns undefined outputs as undefined", () => {
    expect(outputOf(gen({}), "x")).toBeUndefined();
  });
});

describe("assetToOutputValue", () => {
  it("maps an image asset to an image value", () => {
    expect(assetToOutputValue(asset("a1", "j1", "2026-01-01T00:00:00Z"))).toEqual(
      { type: "image", uri: "http://x/a1.png" }
    );
  });

  it("maps a text/plain asset to a text value using inline metadata", () => {
    const textAsset = {
      id: "t1",
      job_id: "j1",
      node_id: "n1",
      content_type: "text/plain",
      get_url: "http://x/t1.txt",
      metadata: { text: "hello world" },
      created_at: "2026-01-01T00:00:00Z"
    } as unknown as Asset;
    expect(assetToOutputValue(textAsset)).toEqual({
      type: "text",
      text: "hello world",
      uri: "http://x/t1.txt"
    });
  });

  it("returns empty text when a text asset has no inline metadata", () => {
    const textAsset = {
      id: "t2",
      content_type: "text/plain",
      get_url: "http://x/t2.txt"
    } as unknown as Asset;
    expect(assetToOutputValue(textAsset)).toEqual({
      type: "text",
      text: "",
      uri: "http://x/t2.txt"
    });
  });

  it("maps an application/json asset to its inline value", () => {
    const jsonAsset = {
      id: "jx",
      content_type: "application/json",
      get_url: "http://x/jx.json",
      metadata: { json: { output: ["a", "b"], index: 1 } }
    } as unknown as Asset;
    expect(assetToOutputValue(jsonAsset)).toEqual({
      type: "json",
      value: { output: ["a", "b"], index: 1 },
      uri: "http://x/jx.json"
    });
  });
});

describe("assetToGeneration", () => {
  it("wraps the asset value under the output handle and carries asset id", () => {
    const g = assetToGeneration(asset("a1", "j1", "2026-01-01T00:00:00Z"));
    expect(g.assetId).toBe("a1");
    expect(g.jobId).toBe("j1");
    expect(g.status).toBe("completed");
    expect(g.outputs.output).toEqual({ type: "image", uri: "http://x/a1.png" });
  });

  it("reloads a JSON generation's whole output dict so per-handle reads mirror a live run", () => {
    const jsonAsset = {
      id: "jg",
      job_id: "j9",
      node_id: "n1",
      content_type: "application/json",
      get_url: "http://x/jg.json",
      metadata: { json: { item: "z", index: 2, output: ["x", "y", "z"] } },
      created_at: "2026-01-01T00:00:00Z"
    } as unknown as Asset;
    const g = assetToGeneration(jsonAsset);
    expect(g.assetId).toBe("jg");
    // outputs ARE the persisted dict (not wrapped under `output`), so a body
    // reading the `output` handle gets the full list, same as a live run.
    expect(g.outputs).toEqual({ item: "z", index: 2, output: ["x", "y", "z"] });
    expect(outputOf(g, "output")).toEqual(["x", "y", "z"]);
  });

  it("falls back to a single output value when a JSON asset has no inline dict", () => {
    const jsonAsset = {
      id: "jg2",
      job_id: "j9",
      node_id: "n1",
      content_type: "application/json",
      get_url: "http://x/jg2.json",
      created_at: "2026-01-01T00:00:00Z"
    } as unknown as Asset;
    const g = assetToGeneration(jsonAsset);
    expect(g.outputs.output).toEqual({ type: "json", uri: "http://x/jg2.json" });
  });
});

describe("mergeGenerations", () => {
  // END-TO-END / regression lock #1 (the bug we fixed): 6 generation_complete
  // (6 live variants) + 6 persisted assets for ONE job → every live slot has a
  // persisted twin at (jobId, index) → all 6 live drop, 6 persisted survive, and
  // groupByRun yields ONE run with SIX variants (not 1).
  it("yields 6 variants for 6 generation_complete + 6 persisted (same job)", () => {
    const persisted = Array.from({ length: 6 }, (_, i) =>
      assetToGeneration(asset(`a${i}`, "j1", `2026-01-01T00:00:0${i}.000Z`))
    );
    // Live ids follow ResultsStore's scheme: slot 0 === jobId, slot k === `${jobId}#k`.
    const live: Generation[] = Array.from({ length: 6 }, (_, i) => ({
      id: i === 0 ? "j1" : `j1#${i}`,
      jobId: "j1",
      createdAt: 100 + i,
      outputs: { output: `live${i}` },
      status: "completed" as const
    }));
    const merged = mergeGenerations(persisted, live);
    const runs = groupByRun(merged);
    expect(runs).toHaveLength(1);
    expect(runs[0].variants).toHaveLength(6);
    // All survivors are persisted (live fully superseded slot-for-slot).
    expect(merged.map((g) => g.id)).toEqual([
      "a0",
      "a1",
      "a2",
      "a3",
      "a4",
      "a5"
    ]);
  });

  // The mid-run fix: 6 live + only 1 persisted-so-far (slot 0) → 5 live survive
  // + 1 persisted → still 6 variants in ONE run (no premature collapse to 1).
  it("yields 6 variants mid-run with 6 live + 1 persisted (slot 0)", () => {
    const persisted = [
      assetToGeneration(asset("a0", "j1", "2026-01-01T00:00:00.000Z"))
    ];
    const live: Generation[] = Array.from({ length: 6 }, (_, i) => ({
      id: i === 0 ? "j1" : `j1#${i}`,
      jobId: "j1",
      createdAt: 100 + i,
      outputs: { output: `live${i}` },
      status: i === 5 ? ("running" as const) : ("completed" as const)
    }));
    const merged = mergeGenerations(persisted, live);
    const runs = groupByRun(merged);
    expect(runs).toHaveLength(1);
    expect(runs[0].variants).toHaveLength(6);
    // Slot 0 superseded by persisted a0; slots 1..5 survive as live.
    expect(merged.map((g) => g.id)).toEqual([
      "a0",
      "j1#1",
      "j1#2",
      "j1#3",
      "j1#4",
      "j1#5"
    ]);
  });

  // Regression lock #2 (proves the OLD drop-all-live-for-job behavior is gone):
  // the previous merge collapsed 6 live to 1 once ANY asset persisted for the
  // job. With slot-level reconciliation it must NOT collapse.
  it("does NOT collapse 6 live to 1 when one asset persists (old bug locked)", () => {
    const persisted = [
      assetToGeneration(asset("a0", "j1", "2026-01-01T00:00:00.000Z"))
    ];
    const live: Generation[] = Array.from({ length: 6 }, (_, i) => ({
      id: i === 0 ? "j1" : `j1#${i}`,
      jobId: "j1",
      createdAt: 100 + i,
      outputs: { output: `live${i}` },
      status: "completed" as const
    }));
    const merged = mergeGenerations(persisted, live);
    // Old behavior would be exactly 1 (["a0"]); assert it is NOT.
    expect(merged).not.toHaveLength(1);
    expect(groupByRun(merged)[0].variants).toHaveLength(6);
  });

  // Mixed-type run: a live variant whose output is non-asset-like never gets a
  // persisted twin → survives → live-only variants stay visible.
  it("keeps a live-only variant that never persists (mixed-type run)", () => {
    const persisted = [
      assetToGeneration(asset("a0", "j1", "2026-01-01T00:00:00.000Z"))
    ];
    const live: Generation[] = [
      {
        id: "j1",
        jobId: "j1",
        createdAt: 100,
        outputs: { output: "asset-like" },
        status: "completed"
      },
      {
        id: "j1#1",
        jobId: "j1",
        createdAt: 101,
        outputs: { output: { type: "text", text: "no asset" } },
        status: "completed"
      }
    ];
    const merged = mergeGenerations(persisted, live);
    // slot 0 → persisted a0; slot 1 → live-only survives.
    expect(merged.map((g) => g.id)).toEqual(["a0", "j1#1"]);
  });

  // Two independent jobs reconcile by their OWN slots, never cross-job: a
  // persisted asset for j1 does not supersede a live variant of j2.
  it("reconciles per job, not across jobs", () => {
    const persisted = [
      assetToGeneration(asset("a0", "j1", "2026-01-01T00:00:00.000Z"))
    ];
    const live: Generation[] = [
      {
        id: "j1",
        jobId: "j1",
        createdAt: 100,
        outputs: { output: "j1-live" },
        status: "completed"
      },
      {
        id: "j2",
        jobId: "j2",
        createdAt: 200,
        outputs: { output: "j2-live" },
        status: "running"
      }
    ];
    const merged = mergeGenerations(persisted, live);
    // j1 slot 0 superseded by a0; j2 slot 0 has no persisted twin → survives.
    expect(merged.map((g) => g.id)).toEqual(["a0", "j2"]);
  });

  // Null-jobId live always survives; null-jobId persisted stays its own singleton.
  it("never reconciles null-jobId live or persisted", () => {
    const persisted = [
      {
        id: "p0",
        jobId: null,
        createdAt: 1,
        outputs: { output: "solo" },
        status: "completed" as const
      }
    ];
    const live: Generation[] = [
      {
        id: "L0",
        jobId: null,
        createdAt: 5,
        outputs: { output: "live-solo" },
        status: "running" as const
      }
    ];
    const merged = mergeGenerations(persisted, live);
    expect(merged.map((g) => g.id)).toEqual(["p0", "L0"]);
    expect(groupByRun(merged)).toHaveLength(2); // two __solo__ runs
  });

  // Same-millisecond persisted assets keep a stable (createdAt, id) order so the
  // slot assignment — and thus reconciliation — is deterministic across renders.
  it("orders same-ms persisted assets stably by id tie-break", () => {
    const persisted = [
      assetToGeneration(asset("b", "j1", "2026-01-01T00:00:00.000Z")),
      assetToGeneration(asset("a", "j1", "2026-01-01T00:00:00.000Z"))
    ];
    const merged = mergeGenerations(persisted, []);
    expect(merged.map((g) => g.id)).toEqual(["a", "b"]);
  });
});

const list: Generation[] = [
  {
    id: "g1",
    jobId: "j1",
    createdAt: 1,
    outputs: { output: "first" },
    status: "completed"
  },
  {
    id: "g2",
    jobId: "j2",
    createdAt: 2,
    outputs: { output: "latest" },
    status: "completed"
  }
];

describe("getCurrentGeneration", () => {
  it("defaults to the latest (last) generation", () => {
    expect(getCurrentGeneration(list)?.id).toBe("g2");
  });
  it("honors an explicit selected id", () => {
    expect(getCurrentGeneration(list, "g1")?.id).toBe("g1");
  });
  it("falls back to latest when the selected id is gone", () => {
    expect(getCurrentGeneration(list, "missing")?.id).toBe("g2");
  });
  it("returns undefined for an empty list", () => {
    expect(getCurrentGeneration([])).toBeUndefined();
  });
});

describe("groupByRun / getCurrentRun", () => {
  const mkGen = (
    id: string,
    jobId: string | null,
    createdAt: number,
    status: Generation["status"] = "completed",
    outputs: Record<string, unknown> = { output: id }
  ): Generation => ({ id, jobId, createdAt, outputs, status });

  describe("groupByRun", () => {
    it("returns [] for an empty list", () => {
      expect(groupByRun([])).toEqual([]);
    });

    it("groups N variants sharing one jobId into a single run", () => {
      const gens = [
        mkGen("a", "j1", 5),
        mkGen("b", "j1", 6),
        mkGen("c", "j1", 7)
      ];
      const runs = groupByRun(gens);
      expect(runs).toHaveLength(1);
      const run = runs[0];
      expect(run.jobId).toBe("j1");
      expect(run.variants).toHaveLength(3);
      expect(run.variants.map((v) => v.id)).toEqual(["a", "b", "c"]);
      expect(run.cover.id).toBe("c");
      expect(run.createdAt).toBe(5);
    });

    it("splits two interleaved jobs into two runs sorted by min createdAt", () => {
      const gens = [
        mkGen("a", "j1", 10),
        mkGen("b", "j2", 5),
        mkGen("c", "j1", 11),
        mkGen("d", "j2", 6)
      ];
      const runs = groupByRun(gens);
      expect(runs).toHaveLength(2);
      // j2 has min createdAt 5 → first; j1 min 10 → second
      expect(runs[0].jobId).toBe("j2");
      expect(runs[0].variants.map((v) => v.id)).toEqual(["b", "d"]);
      expect(runs[1].jobId).toBe("j1");
      expect(runs[1].variants.map((v) => v.id)).toEqual(["a", "c"]);
    });

    it("never merges null-jobId generations — each is its own singleton run", () => {
      const gens = [
        mkGen("s1", null, 1),
        mkGen("s2", null, 2),
        mkGen("r1", "j1", 3)
      ];
      const runs = groupByRun(gens);
      expect(runs).toHaveLength(3);
      const byKey = Object.fromEntries(runs.map((r) => [r.jobId, r]));
      expect(byKey["__solo__:s1"].variants.map((v) => v.id)).toEqual(["s1"]);
      expect(byKey["__solo__:s2"].variants.map((v) => v.id)).toEqual(["s2"]);
      expect(byKey["j1"].variants.map((v) => v.id)).toEqual(["r1"]);
    });

    it("rolls up status: any running → running", () => {
      const runs = groupByRun([
        mkGen("a", "j1", 1, "completed"),
        mkGen("b", "j1", 2, "running")
      ]);
      expect(runs[0].status).toBe("running");
    });

    it("rolls up status: an error with none running → error", () => {
      const runs = groupByRun([
        mkGen("a", "j1", 1, "completed"),
        mkGen("b", "j1", 2, "error")
      ]);
      expect(runs[0].status).toBe("error");
    });

    it("rolls up status: all completed → completed", () => {
      const runs = groupByRun([
        mkGen("a", "j1", 1, "completed"),
        mkGen("b", "j1", 2, "completed")
      ]);
      expect(runs[0].status).toBe("completed");
    });
  });

  describe("getCurrentRun", () => {
    it("returns undefined for an empty list", () => {
      expect(getCurrentRun([])).toBeUndefined();
    });

    it("resolves the run that contains the selected variant id", () => {
      const runs = groupByRun([
        mkGen("a", "j1", 1),
        mkGen("b", "j2", 2),
        mkGen("c", "j2", 3)
      ]);
      // select variant "b" of run j2
      expect(getCurrentRun(runs, "b")?.jobId).toBe("j2");
    });

    it("falls back to the latest run when selectedId is stale/absent", () => {
      const runs = groupByRun([mkGen("a", "j1", 1), mkGen("b", "j2", 2)]);
      expect(getCurrentRun(runs, "missing")?.jobId).toBe("j2");
      expect(getCurrentRun(runs)?.jobId).toBe("j2");
    });
  });
});

describe("selectedOutputValues", () => {
  const mkGen = (
    id: string,
    status: Generation["status"] = "completed",
    outputs: Record<string, unknown> = { output: id }
  ): Generation => ({ id, jobId: "j1", createdAt: 1, outputs, status });

  it("returns [] when nothing is selected", () => {
    expect(selectedOutputValues([mkGen("a")], undefined)).toEqual([]);
    expect(selectedOutputValues([mkGen("a")], [])).toEqual([]);
  });

  it("maps selected (pick-ordered) completed generations to their handle value", () => {
    const gens = [
      mkGen("a", "completed", { output: "imgA" }),
      mkGen("b", "completed", { output: "imgB" }),
      mkGen("c", "completed", { output: "imgC" })
    ];
    expect(selectedOutputValues(gens, ["c", "a"])).toEqual(["imgC", "imgA"]);
  });

  it("keeps only completed selections (drops running/error members)", () => {
    const gens = [
      mkGen("a", "completed", { output: "imgA" }),
      mkGen("b", "running", { output: "imgB" }),
      mkGen("c", "error", { output: "imgC" })
    ];
    expect(selectedOutputValues(gens, ["a", "b", "c"])).toEqual(["imgA"]);
  });

  it("spreads an array-valued generation one level (num_images flatten)", () => {
    const gens = [
      mkGen("a", "completed", { output: ["i1", "i2"] }),
      mkGen("b", "completed", { output: "i3" })
    ];
    expect(selectedOutputValues(gens, ["a", "b"])).toEqual(["i1", "i2", "i3"]);
  });

  it("drops null/undefined holes", () => {
    const gens = [
      mkGen("a", "completed", { output: "imgA" }),
      mkGen("b", "completed", { output: null }),
      mkGen("c", "completed", {})
    ];
    expect(selectedOutputValues(gens, ["a", "b", "c"])).toEqual(["imgA"]);
  });

  it("respects the named handle on multi-key outputs", () => {
    const gens = [
      mkGen("a", "completed", { image: "imgA", mask: "maskA" }),
      mkGen("b", "completed", { image: "imgB", mask: "maskB" })
    ];
    expect(selectedOutputValues(gens, ["a", "b"], "image")).toEqual([
      "imgA",
      "imgB"
    ]);
  });
});
