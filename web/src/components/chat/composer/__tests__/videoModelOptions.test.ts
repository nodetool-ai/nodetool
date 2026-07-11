/** @jest-environment node */
import type { VideoModel } from "../../../../stores/ApiTypes";
import {
  VIDEO_ASPECT_RATIOS,
  type AspectRatioOption
} from "../../../../stores/MediaGenerationStore";
import {
  videoModelConstraints,
  clampToAllowed,
  buildAspectOptions,
  normalizeVideoModel
} from "../videoModelOptions";

function makeVideoModel(overrides: Partial<VideoModel> = {}): VideoModel {
  return {
    type: "video_model",
    id: "test-model",
    name: "Test Model",
    provider: "empty",
    ...overrides
  };
}

describe("videoModelConstraints", () => {
  it("returns undefined for all when model has no constraints", () => {
    const result = videoModelConstraints(makeVideoModel());
    expect(result.durations).toBeUndefined();
    expect(result.resolutions).toBeUndefined();
    expect(result.aspectRatios).toBeUndefined();
  });

  it("extracts durations from model", () => {
    const result = videoModelConstraints(
      makeVideoModel({ durations: [3, 5, 10] })
    );
    expect(result.durations).toEqual([3, 5, 10]);
  });

  it("filters non-finite durations", () => {
    const result = videoModelConstraints(
      makeVideoModel({ durations: [3, NaN, Infinity, 5] })
    );
    expect(result.durations).toEqual([3, 5]);
  });

  it("returns undefined for empty duration array after filtering", () => {
    const result = videoModelConstraints(
      makeVideoModel({ durations: [NaN, Infinity] })
    );
    expect(result.durations).toBeUndefined();
  });

  it("extracts resolutions and aspect ratios", () => {
    const result = videoModelConstraints(
      makeVideoModel({
        resolutions: ["720p", "1080p"],
        aspect_ratios: ["16:9", "1:1"]
      })
    );
    expect(result.resolutions).toEqual(["720p", "1080p"]);
    expect(result.aspectRatios).toEqual(["16:9", "1:1"]);
  });

  it("returns undefined for null arrays", () => {
    const result = videoModelConstraints(
      makeVideoModel({ resolutions: null, aspect_ratios: null })
    );
    expect(result.resolutions).toBeUndefined();
    expect(result.aspectRatios).toBeUndefined();
  });
});

describe("clampToAllowed", () => {
  it("returns the value when allowed list is empty", () => {
    expect(clampToAllowed("720p", [])).toBe("720p");
  });

  it("returns the value when allowed list is undefined", () => {
    expect(clampToAllowed("720p", undefined)).toBe("720p");
  });

  it("returns the value when it is in the allowed list", () => {
    expect(clampToAllowed("1080p", ["720p", "1080p", "4K"])).toBe("1080p");
  });

  it("snaps to the first allowed value when value is not in the list", () => {
    expect(clampToAllowed("4K", ["720p", "1080p"])).toBe("720p");
  });

  it("works with numbers", () => {
    expect(clampToAllowed(5, [3, 5, 10])).toBe(5);
    expect(clampToAllowed(7, [3, 5, 10])).toBe(3);
  });
});

describe("buildAspectOptions", () => {
  it("maps known aspect ratio ids to full options from fallback", () => {
    const result = buildAspectOptions(["16:9", "1:1"], VIDEO_ASPECT_RATIOS);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(
      expect.objectContaining({ id: "16:9", width: 16, height: 9 })
    );
    expect(result[1]).toEqual(
      expect.objectContaining({ id: "1:1", width: 1, height: 1 })
    );
  });

  it("creates ad-hoc options for unknown aspect ratios", () => {
    const result = buildAspectOptions(["5:4"], VIDEO_ASPECT_RATIOS);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: "5:4", label: "5:4", width: 5, height: 4 });
  });

  it("filters out unparseable ids", () => {
    const result = buildAspectOptions(["16:9", "invalid"], VIDEO_ASPECT_RATIOS);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("16:9");
  });

  it("returns fallback when all ids are invalid", () => {
    const fallback: AspectRatioOption[] = [
      { id: "1:1", label: "1:1", width: 1, height: 1 }
    ];
    const result = buildAspectOptions(["bad"], fallback);
    expect(result).toBe(fallback);
  });
});

describe("normalizeVideoModel", () => {
  it("normalizes a model with constraints", () => {
    const model = makeVideoModel({
      id: "gen-3",
      provider: "runway",
      name: "Gen-3 Alpha",
      durations: [5, 10],
      resolutions: ["1080p"],
      aspect_ratios: ["16:9"]
    });
    const result = normalizeVideoModel(model);
    expect(result).toEqual({
      type: "video_model",
      id: "gen-3",
      provider: "runway",
      name: "Gen-3 Alpha",
      durations: [5, 10],
      resolutions: ["1080p"],
      aspectRatios: ["16:9"]
    });
  });

  it("normalizes a model without constraints", () => {
    const result = normalizeVideoModel(makeVideoModel({ name: "" }));
    expect(result.type).toBe("video_model");
    expect(result.name).toBe("");
    expect(result.durations).toBeUndefined();
    expect(result.resolutions).toBeUndefined();
    expect(result.aspectRatios).toBeUndefined();
  });

  it("falls back to empty name when model name is undefined", () => {
    const model = makeVideoModel();
    delete (model as unknown as Record<string, unknown>).name;
    const result = normalizeVideoModel(model);
    expect(result.name).toBe("");
  });
});
