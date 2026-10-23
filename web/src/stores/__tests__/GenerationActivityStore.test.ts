import {
  mediaKindOf,
  pruneGenerations,
  useGenerationActivityStore,
  type GenerationActivity
} from "../GenerationActivityStore";

const generation = (
  id: string,
  overrides: Partial<GenerationActivity> = {}
): GenerationActivity => ({
  id,
  channel: "rpc",
  status: "generating",
  kind: "image",
  prompt: "a red fox",
  model: "flux",
  source: null,
  threadId: null,
  startedAt: 1,
  endedAt: null,
  assetIds: [],
  error: null,
  ...overrides
});

describe("GenerationActivityStore", () => {
  beforeEach(() => {
    useGenerationActivityStore.setState({ generations: {} });
  });

  it("ignores a second start for the same id", () => {
    const { start } = useGenerationActivityStore.getState();
    start(generation("a"));
    start(generation("a", { prompt: "other" }));
    expect(useGenerationActivityStore.getState().generations.a.prompt).toBe(
      "a red fox"
    );
  });

  it("keeps the first outcome of a generation", () => {
    const { start, settle } = useGenerationActivityStore.getState();
    start(generation("a"));
    settle("a", { status: "cancelled" });
    settle("a", { status: "failed", error: "Generation cancelled" });
    const settled = useGenerationActivityStore.getState().generations.a;
    expect(settled.status).toBe("cancelled");
    expect(settled.error).toBeNull();
    expect(settled.endedAt).not.toBeNull();
  });

  it("records the assets of a finished generation", () => {
    const { start, settle } = useGenerationActivityStore.getState();
    start(generation("a"));
    settle("a", { status: "generated", assetIds: ["asset-1"] });
    expect(
      useGenerationActivityStore.getState().generations.a.assetIds
    ).toEqual(["asset-1"]);
  });

  it("clears finished generations and keeps running ones", () => {
    const { start, settle, clearFinished } =
      useGenerationActivityStore.getState();
    start(generation("running"));
    start(generation("done"));
    settle("done", { status: "generated" });
    clearFinished();
    expect(
      Object.keys(useGenerationActivityStore.getState().generations)
    ).toEqual(["running"]);
  });
});

describe("pruneGenerations", () => {
  it("drops the oldest finished generations past the limit", () => {
    const pruned = pruneGenerations(
      {
        running: generation("running", { startedAt: 0 }),
        old: generation("old", { status: "generated", endedAt: 10 }),
        mid: generation("mid", { status: "failed", endedAt: 20 }),
        new: generation("new", { status: "generated", endedAt: 30 })
      },
      2
    );
    expect(Object.keys(pruned).sort()).toEqual(["mid", "new", "running"]);
  });
});

describe("mediaKindOf", () => {
  it.each([
    ["image", "image"],
    ["image_edit", "image"],
    ["text_to_image", "image"],
    ["image_to_video", "video"],
    ["reference_to_video", "video"],
    ["extend", "video"],
    ["lip_sync", "video"],
    ["text_to_speech", "audio"],
    ["music", "audio"],
    [null, "other"]
  ])("reads %s as %s", (mode, kind) => {
    expect(mediaKindOf(mode)).toBe(kind);
  });
});
