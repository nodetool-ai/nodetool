import {
  outputOf,
  assetToOutputValue,
  assetToGeneration,
  mergeGenerations,
  getCurrentGeneration,
  getCurrentOutput,
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
});

describe("assetToGeneration", () => {
  it("wraps the asset value under the output handle and carries asset id", () => {
    const g = assetToGeneration(asset("a1", "j1", "2026-01-01T00:00:00Z"));
    expect(g.assetId).toBe("a1");
    expect(g.jobId).toBe("j1");
    expect(g.status).toBe("completed");
    expect(g.outputs.output).toEqual({ type: "image", uri: "http://x/a1.png" });
  });
});

describe("mergeGenerations", () => {
  it("keeps all persisted assets and drops a live gen once its job persisted", () => {
    const persisted = [
      assetToGeneration(asset("a1", "j1", "2026-01-01T00:00:00Z")),
      assetToGeneration(asset("a2", "j1", "2026-01-01T00:00:01Z")) // batch: same job, 2 assets
    ];
    const live = [
      {
        id: "j1",
        jobId: "j1",
        createdAt: 10,
        outputs: { output: "stale" },
        status: "completed" as const
      },
      {
        id: "j2",
        jobId: "j2",
        createdAt: 20,
        outputs: { output: "live" },
        status: "running" as const
      }
    ];
    const merged = mergeGenerations(persisted, live);
    expect(merged.map((g) => g.id)).toEqual(["a1", "a2", "j2"]); // j1 superseded; chronological
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

describe("getCurrentOutput", () => {
  it("returns the current generation's output for a handle", () => {
    expect(getCurrentOutput(list, "g1", "output")).toBe("first");
  });
});
