import { describe, expect, it } from "vitest";

import {
  acceptedDuration,
  acceptedSize,
  acceptedValue,
  announcedOptions
} from "../../src/providers/comfy-router-constraints.js";
import { COMFY_ROUTER_MANIFEST } from "../../src/providers/comfy-router-manifest.js";
import { COMFY_ROUTER_CATALOG } from "../../src/providers/comfy-router-catalog.js";

describe("Comfy Router constraints", () => {
  it("covers only catalog models and holds constraints", () => {
    const ids = new Set(COMFY_ROUTER_CATALOG.map((entry) => entry.id));
    const manifestIds = Object.keys(COMFY_ROUTER_MANIFEST);
    expect(manifestIds.length).toBeGreaterThan(50);
    expect(manifestIds.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("uses the model's spelling and rejects what it does not list", () => {
    expect(acceptedValue("bfl/flux-3-image", "resolution", "2K")).toBe("2k");
    expect(acceptedValue("bfl/flux-3-image", "resolution", "8K")).toBeUndefined();
    expect(acceptedValue("no/such-model", "resolution", "2K")).toBe("2K");
  });

  it("fits a size to the separator and pixel area", () => {
    expect(acceptedSize("qwen/qwen-image-3.0", 3641, 2048)).toBe("3413*1919");
    expect(acceptedSize("qwen/qwen-image-3.0", 1024, 768)).toBe("1024*768");
    expect(acceptedSize("no/such-model", 1024, 768)).toBe("1024x768");
  });

  it("clamps a duration to the model's range", () => {
    expect(acceptedDuration("bfl/flux-3-video", 60)).toBe(20);
    expect(acceptedDuration("bfl/flux-3-video", 1)).toBe(5);
    expect(acceptedDuration("no/such-model", 60)).toBe(60);
  });

  it("announces the options a picker may offer", () => {
    const options = announcedOptions("bfl/flux-3-image");
    expect(options.resolutions).toContain("2K");
    expect(options.aspectRatios).toContain("16:9");
    expect(options.aspectRatios).not.toContain("auto");
    expect(announcedOptions("bfl/flux-3-video").durations).toHaveLength(16);
    expect(announcedOptions("no/such-model")).toEqual({});
  });
});
