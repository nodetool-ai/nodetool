import { describe, expect, it } from "vitest";

import { buildManifestEntry } from "../comfy-router-manifest-lib.mjs";

const document = (properties) => ({
  paths: {
    "/run": {
      post: { requestBody: { content: { "application/json": { schema: { properties } } } } }
    }
  }
});

describe("buildManifestEntry", () => {
  it("reads a closed list from an enum and from a description", () => {
    const { params } = buildManifestEntry(
      document({
        resolution: { description: "Output resolution class: 768sq, 1k, 1.5k, 2k, or 4k." },
        aspect_ratio: { enum: ["1:1", "16:9"] }
      })
    );
    expect(params.resolution.values).toEqual(["768sq", "1k", "1.5k", "2k", "4k"]);
    expect(params.aspectRatio).toEqual({ field: "aspect_ratio", values: ["1:1", "16:9"], source: "enum" });
  });

  it("leaves examples and ranges in prose unconstrained and reports them", () => {
    const entry = buildManifestEntry(
      document({
        aspect_ratio: { description: "Aspect ratio between 21:9 and 9:21, e.g. 16:9." },
        resolution: { description: "Resolution of the output video" }
      })
    );
    expect(entry.params).toEqual({});
    expect(entry.unparsed).toEqual(["resolution", "aspect_ratio"]);
  });

  it("reads a size separator, a pixel area, and a duration range", () => {
    const { params } = buildManifestEntry(
      document({
        size: {
          description: "In the format width*height. A pixel area between 262144 (512*512) and 6553600 (2560*2560)."
        },
        duration: { description: "Video length in seconds (4-15), or auto." }
      })
    );
    expect(params.size).toMatchObject({ separator: "*", pixelArea: [262144, 6553600] });
    expect(params.duration).toMatchObject({ min: 4, max: 15 });
  });
});
