import {
  batchSeeds,
  buildCreateBatch,
  createBlocker,
  type CreateSettings
} from "../createRequest";

const model = (id: string) => ({
  type: "image_model" as const,
  id,
  provider: "fake" as never,
  name: id,
  path: ""
});

const settings = (overrides: Partial<CreateSettings> = {}): CreateSettings => ({
  image: {
    model: model("flux"),
    resolution: "1K",
    aspectRatio: "16:9",
    variations: 4
  },
  video: {
    model: {
      type: "video_model",
      id: "wan",
      provider: "fake",
      name: "wan"
    },
    resolution: "1080p",
    aspectRatio: "16:9",
    duration: 8
  },
  presetIds: {},
  ...overrides
});

describe("batchSeeds", () => {
  it("returns distinct seeds, including across the wrap point", () => {
    const seeds = batchSeeds(4, 2 ** 31 - 2);
    expect(new Set(seeds).size).toBe(4);
    expect(seeds.every((seed) => seed >= 0 && seed < 2 ** 31)).toBe(true);
  });
});

describe("buildCreateBatch", () => {
  it("makes one image request per take, each asking for one image with its own seed", () => {
    const requests = buildCreateBatch("image", settings(), "a lighthouse", 3);
    expect(requests).toHaveLength(3);
    expect(requests.map((request) => request.variations)).toEqual([1, 1, 1]);
    expect(new Set(requests.map((request) => request.seed)).size).toBe(3);
    expect(requests[0]).toMatchObject({
      mode: "image",
      provider: "fake",
      model: "flux",
      prompt: "a lighthouse",
      width: 1820,
      height: 1024
    });
  });

  it("carries the video settings and presets", () => {
    const [request] = buildCreateBatch(
      "video",
      settings({ presetIds: { video: ["camera.arc"] } }),
      "dolly in",
      1,
      [7]
    );
    expect(request).toMatchObject({
      mode: "video",
      model: "wan",
      duration: 8,
      aspect_ratio: "16:9",
      preset_ids: ["camera.arc"],
      seed: 7
    });
  });

  it("omits preset_ids when none are chosen", () => {
    const [request] = buildCreateBatch("video", settings(), "x", 1);
    expect(request).not.toHaveProperty("preset_ids");
  });
});

describe("createBlocker", () => {
  it("names what is missing", () => {
    expect(createBlocker("image", settings(), "  ")).toBe("no-prompt");
    expect(
      createBlocker(
        "image",
        settings({ image: { ...settings().image, model: null } }),
        "go"
      )
    ).toBe("no-model");
    expect(createBlocker("video", settings(), "go")).toBeNull();
  });
});
