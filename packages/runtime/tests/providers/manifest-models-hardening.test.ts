/**
 * Mutation-hardening tests for the manifest-models helpers.
 *
 * The public loaders are covered by an integration test against the real FAL
 * manifest; these unit tests pin the pure helpers directly so every keyword
 * fragment, fallback, and constraint-parsing branch is individually killable.
 * See MUTATION_TESTING.md.
 */
import { describe, it, expect } from "vitest";
import {
  explicitTasks,
  enumValuesFor,
  videoConstraints,
  nodeId,
  nodeName,
  matchesAny,
  inferVideoTasks,
  inferImageTasks,
  buildVideoModels,
  buildImageModels,
  loadImageModels,
  loadManifest,
  manifestEntryImageInputs,
  selectPrimaryImageInput
} from "../../src/providers/manifest-models.js";
import type { ModelImageInput } from "../../src/providers/manifest-models.js";

describe("explicitTasks", () => {
  it("returns a declared non-empty task list", () => {
    expect(explicitTasks({ supportedTasks: ["x"] })).toEqual(["x"]);
  });
  it("returns undefined for empty or missing lists", () => {
    expect(explicitTasks({ supportedTasks: [] })).toBeUndefined();
    expect(explicitTasks({})).toBeUndefined();
    expect(
      explicitTasks({ supportedTasks: "no" as unknown as string[] })
    ).toBeUndefined();
  });
});

describe("enumValuesFor", () => {
  it("matches by apiParamName first", () => {
    const n = {
      inputFields: [
        { name: "dur", apiParamName: "duration", propType: "x", enumValues: ["5"] }
      ]
    };
    expect(enumValuesFor(n, "duration")).toEqual(["5"]);
  });
  it("falls back to name when apiParamName is absent", () => {
    const n = {
      inputFields: [{ name: "duration", propType: "x", enumValues: ["8"] }]
    };
    expect(enumValuesFor(n, "duration")).toEqual(["8"]);
  });
  it("returns undefined for empty enums, missing field, or no inputFields", () => {
    expect(
      enumValuesFor(
        { inputFields: [{ name: "duration", propType: "x", enumValues: [] }] },
        "duration"
      )
    ).toBeUndefined();
    expect(
      enumValuesFor(
        { inputFields: [{ name: "other", propType: "x", enumValues: ["1"] }] },
        "duration"
      )
    ).toBeUndefined();
    expect(enumValuesFor({}, "duration")).toBeUndefined();
  });
});

describe("videoConstraints", () => {
  it("coerces duration strings to finite numbers", () => {
    const n = {
      inputFields: [
        {
          name: "duration",
          propType: "x",
          enumValues: ["5", "8", "bad", "10"]
        }
      ]
    };
    expect(videoConstraints(n).durations).toEqual([5, 8, 10]);
  });
  it("drops durations entirely when none are finite", () => {
    const n = {
      inputFields: [
        { name: "duration", propType: "x", enumValues: ["x", "y"] }
      ]
    };
    expect(videoConstraints(n).durations).toBeUndefined();
  });
  it("passes resolution and aspect_ratio enums through", () => {
    const n = {
      inputFields: [
        { name: "resolution", propType: "x", enumValues: ["720p"] },
        { name: "aspect_ratio", propType: "x", enumValues: ["16:9"] }
      ]
    };
    const c = videoConstraints(n);
    expect(c.resolutions).toEqual(["720p"]);
    expect(c.aspectRatios).toEqual(["16:9"]);
  });
});

describe("nodeId / nodeName", () => {
  it("prefers modelId, then endpointId, then empty", () => {
    expect(nodeId({ modelId: "m", endpointId: "e" })).toBe("m");
    expect(nodeId({ endpointId: "e" })).toBe("e");
    expect(nodeId({})).toBe("");
  });
  it("prefers title, then className, then id", () => {
    expect(nodeName({ title: "T", className: "C", modelId: "m" })).toBe("T");
    expect(nodeName({ className: "Plain", modelId: "m" })).toBe("Plain");
    expect(nodeName({ modelId: "id-only" })).toBe("id-only");
  });
  it("splits PascalCase className into words", () => {
    expect(nodeName({ className: "FluxSchnellRedux" })).toBe(
      "Flux Schnell Redux"
    );
    // acronym boundary: HTTPServer -> HTTP Server
    expect(nodeName({ className: "HTTPServerNode" })).toBe("HTTP Server Node");
  });
  it("leaves names that already contain spaces untouched", () => {
    expect(nodeName({ title: "Already Spaced" })).toBe("Already Spaced");
    // even when a spaced name contains an internal PascalCase boundary
    expect(nodeName({ title: "A BcDe" })).toBe("A BcDe");
  });

  it("leaves an all-lowercase name untouched", () => {
    expect(nodeName({ className: "lowercase" })).toBe("lowercase");
  });
});

describe("buildVideoModels", () => {
  it("skips non-video and id-less entries", () => {
    expect(
      buildVideoModels(
        [
          { outputType: "image", endpointId: "img" },
          { outputType: "video" } // no id
        ],
        "p"
      )
    ).toEqual([]);
  });

  it("creates a video model with constraints", () => {
    const out = buildVideoModels(
      [
        {
          outputType: "video",
          endpointId: "v1",
          supportedTasks: ["text_to_video"],
          inputFields: [
            { name: "duration", propType: "x", enumValues: ["5", "8"] }
          ]
        }
      ],
      "fal"
    );
    expect(out).toEqual([
      {
        id: "v1",
        name: "v1",
        provider: "fal",
        supportedTasks: ["text_to_video"],
        durations: [5, 8]
      }
    ]);
  });

  it("merges duplicate ids: unions tasks and fills missing constraints", () => {
    const out = buildVideoModels(
      [
        { outputType: "video", endpointId: "dup", supportedTasks: ["text_to_video"] },
        {
          outputType: "video",
          endpointId: "dup",
          supportedTasks: ["image_to_video"],
          inputFields: [
            { name: "duration", propType: "x", enumValues: ["10"] },
            { name: "resolution", propType: "x", enumValues: ["720p"] },
            { name: "aspect_ratio", propType: "x", enumValues: ["16:9"] }
          ]
        }
      ],
      "p"
    );
    expect(out).toHaveLength(1);
    expect(out[0].supportedTasks).toEqual(["text_to_video", "image_to_video"]);
    // constraints came from the second entry via ??= (first had none)
    expect(out[0].durations).toEqual([10]);
    expect(out[0].resolutions).toEqual(["720p"]);
    expect(out[0].aspectRatios).toEqual(["16:9"]);
  });

  it("keeps the FIRST entry's constraints when both declare them", () => {
    const out = buildVideoModels(
      [
        {
          outputType: "video",
          endpointId: "dup",
          inputFields: [{ name: "duration", propType: "x", enumValues: ["5"] }]
        },
        {
          outputType: "video",
          endpointId: "dup",
          inputFields: [{ name: "duration", propType: "x", enumValues: ["9"] }]
        }
      ],
      "p"
    );
    expect(out[0].durations).toEqual([5]);
  });
});

describe("buildImageModels", () => {
  it("qualifies image entries and dict transforms, skips other types", () => {
    const out = buildImageModels(
      [
        { outputType: "image", endpointId: "img" },
        { outputType: "dict", endpointId: "fal/clarity-upscaler" },
        { outputType: "audio", endpointId: "aud" } // must be excluded
      ],
      "fal"
    );
    expect(out.map((m) => m.id)).toEqual(["img", "fal/clarity-upscaler"]);
    expect(out[1].supportedTasks).toEqual(["upscale"]);
  });

  it("deduplicates by id, keeping the first occurrence", () => {
    const out = buildImageModels(
      [
        { outputType: "image", endpointId: "x", title: "First" },
        { outputType: "image", endpointId: "x", title: "Second" }
      ],
      "p"
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("First");
  });

  it("skips id-less entries", () => {
    expect(buildImageModels([{ outputType: "image" }], "p")).toEqual([]);
  });

  it("tags entries that declare a mask image input with the inpainting task", () => {
    const out = buildImageModels(
      [
        {
          outputType: "image",
          endpointId: "edit/with-mask",
          inputFields: [
            { name: "image_url", propType: "image" },
            { name: "mask_url", propType: "image" }
          ]
        }
      ],
      "p"
    );
    expect(out[0].supportedTasks).toContain("inpainting");
    expect(out[0].supportedTasks).toContain("image_to_image");
  });

  it("does not tag inpainting when no mask input is declared", () => {
    const out = buildImageModels(
      [
        {
          outputType: "image",
          endpointId: "plain/edit",
          inputFields: [{ name: "image_url", propType: "image" }]
        }
      ],
      "p"
    );
    expect(out[0].supportedTasks).not.toContain("inpainting");
  });
});

describe("loadManifest IO (via loadImageModels)", () => {
  // Unique keys per test run so the module-global cache never short-circuits
  // (which would hide the catch/cache-set branches we're pinning here).
  const uniq = () => `@nodetool-ai/missing-${Date.now()}-${Math.random()}`;

  it("returns [] for an unresolvable package, on first AND cached call", () => {
    // Test loadManifest directly: loadImageModels would filter junk entries
    // downstream and mask a mutated non-empty fallback.
    const bad = uniq();
    expect(loadManifest(bad, "missing.json")).toEqual([]);
    // second call hits the cache and must also be empty (pins the cache-set [])
    expect(loadManifest(bad, "missing.json")).toEqual([]);
  });

  it("keys the cache by package+path (no cross-package bleed)", () => {
    // A real package yields a non-empty catalog; a different key must not
    // return that cached catalog.
    const real = loadImageModels(
      "@nodetool-ai/fal-nodes",
      "fal-manifest.json",
      "fal"
    );
    expect(real.length).toBeGreaterThan(0);
    expect(loadImageModels(uniq(), "x.json", "p")).toEqual([]);
  });

  it("falls back to a manifest colocated with the bundled module", () => {
    const manifest = loadManifest(uniq(), "aki-manifest.json");
    expect(manifest.length).toBeGreaterThan(0);
    expect(manifest[0]).toHaveProperty("endpointId");
  });
});

describe("matchesAny", () => {
  it("is true iff at least one needle is a substring", () => {
    expect(matchesAny("hello world", "zzz", "wor")).toBe(true);
    expect(matchesAny("hello world", "zzz", "qqq")).toBe(false);
  });
});

describe("inferVideoTasks", () => {
  const cases: [string, string[]][] = [
    ["lipsync", ["lip_sync"]],
    ["lip-sync", ["lip_sync"]],
    ["lip sync", ["lip_sync"]],
    ["video-to-video", ["video_to_video"]],
    ["video to video", ["video_to_video"]],
    ["videotovideo", ["video_to_video"]],
    ["v2v", ["video_to_video"]],
    ["text-to-video", ["text_to_video"]],
    ["text to video", ["text_to_video"]],
    ["texttovideo", ["text_to_video"]],
    ["image-to-video", ["image_to_video"]],
    ["image to video", ["image_to_video"]],
    ["imagetovideo", ["image_to_video"]]
  ];
  for (const [frag, expected] of cases) {
    it(`"${frag}" → ${expected.join("+")}`, () => {
      expect(inferVideoTasks(frag, "")).toEqual(expected);
    });
  }
  it("tags an ambiguous generator with both generation tasks", () => {
    expect(inferVideoTasks("some-generator", "x")).toEqual([
      "text_to_video",
      "image_to_video"
    ]);
  });
});

describe("inferImageTasks", () => {
  const upscale = [
    "upscal",
    "super-resolution",
    "super resolution",
    "superres",
    "esrgan",
    "seedvr",
    "clarity"
  ];
  const removeBg = [
    "background/remove",
    "remove-background",
    "remove background",
    "removebackground",
    "rembg",
    "bg-remove",
    "/remove-bg",
    "background-removal",
    "bria/background"
  ];
  const relight = ["relight", "relighting", "re-light"];
  const vectorize = ["vectorize", "vectorization", "/vectorize", "to-svg", "image-to-svg"];

  for (const f of upscale) {
    it(`upscale fragment "${f}"`, () =>
      expect(inferImageTasks(f, "")).toEqual(["upscale"]));
  }
  for (const f of removeBg) {
    it(`remove_background fragment "${f}"`, () =>
      expect(inferImageTasks(f, "")).toEqual(["remove_background"]));
  }
  for (const f of relight) {
    it(`relight fragment "${f}"`, () =>
      expect(inferImageTasks(f, "")).toEqual(["relight"]));
  }
  for (const f of vectorize) {
    it(`vectorize fragment "${f}"`, () =>
      expect(inferImageTasks(f, "")).toEqual(["vectorize"]));
  }
  it("defaults a plain generator to both generation tasks", () => {
    expect(inferImageTasks("plain-generator", "x")).toEqual([
      "text_to_image",
      "image_to_image"
    ]);
  });
});

describe("manifestEntryImageInputs", () => {
  it("prefers KIE uploads, keeping only image kinds", () => {
    expect(
      manifestEntryImageInputs({
        uploads: [
          { field: "photo", kind: "image", paramName: "image_url" },
          { field: "doc", kind: "file" }, // non-image → dropped
          { field: "frames", kind: "image", isList: true }
        ]
      })
    ).toEqual([
      { apiName: "image_url", isList: false, name: "photo" },
      { apiName: "frames_urls", isList: true, name: "frames" }
    ]);
  });

  it("derives the upload apiName from field + list-ness when paramName is absent", () => {
    expect(
      manifestEntryImageInputs({ uploads: [{ field: "ref", kind: "image" }] })
    ).toEqual([{ apiName: "ref_url", isList: false, name: "ref" }]);
    expect(
      manifestEntryImageInputs({
        uploads: [{ field: "ref", kind: "image", isList: true }]
      })
    ).toEqual([{ apiName: "ref_urls", isList: true, name: "ref" }]);
  });

  it("falls back to image / list[image] inputFields when there are no uploads", () => {
    expect(
      manifestEntryImageInputs({
        inputFields: [
          { name: "image", propType: "Image" },
          { name: "gallery", propType: "list[image]", apiParamName: "images" },
          { name: "prompt", propType: "str" } // non-image → dropped
        ]
      })
    ).toEqual([
      { apiName: "image", isList: false, name: "image" },
      { apiName: "images", isList: true, name: "gallery" }
    ]);
  });

  it("ignores inputFields when uploads are present (uploads win)", () => {
    expect(
      manifestEntryImageInputs({
        uploads: [{ field: "u", kind: "image" }],
        inputFields: [{ name: "image", propType: "image" }]
      })
    ).toEqual([{ apiName: "u_url", isList: false, name: "u" }]);
  });

  it("returns [] for an empty upload list and a no-image entry", () => {
    expect(manifestEntryImageInputs({ uploads: [] })).toEqual([]);
    expect(manifestEntryImageInputs({})).toEqual([]);
    expect(
      manifestEntryImageInputs({ inputFields: [{ name: "n", propType: "str" }] })
    ).toEqual([]);
  });
});

describe("selectPrimaryImageInput", () => {
  const inp = (name: string, isList = false): ModelImageInput => ({
    apiName: name,
    isList,
    name
  });

  it("returns undefined when there are no inputs", () => {
    expect(selectPrimaryImageInput([], 1)).toBeUndefined();
    expect(selectPrimaryImageInput([], 3)).toBeUndefined();
  });

  it("skips auxiliary inputs in favour of a real source image", () => {
    for (const aux of [
      "mask",
      "control_image",
      "reference",
      "style_image",
      "depth",
      "canny",
      "pose",
      "ip_adapter",
      "redux",
      "face_image",
      "last_frame",
      "end_image",
      "end_frame"
    ]) {
      expect(selectPrimaryImageInput([inp(aux), inp("image")], 1)?.name).toBe(
        "image"
      );
    }
  });

  it("falls back to auxiliary-only inputs when nothing else exists", () => {
    expect(selectPrimaryImageInput([inp("mask")], 1)?.name).toBe("mask");
  });

  it("drops auxiliary inputs from the pool even when the survivor is unknown-ranked", () => {
    // Both fields are unknown-ranked, so only the auxiliary FILTER distinguishes
    // them: "mask" must be removed, leaving "custom_field". If the filter is
    // skipped (or the pool ternary collapses to `inputs`), the stable sort would
    // return "mask" (first in the array) instead.
    expect(
      selectPrimaryImageInput([inp("mask"), inp("custom_field")], 1)?.name
    ).toBe("custom_field");
  });

  it("ranks every priority name above an unknown field", () => {
    // Each known name sits *second* in the array but must still win on priority;
    // if its priority string breaks it ties the unknown and loses (stable sort).
    for (const name of [
      "image",
      "input_image",
      "image_input",
      "images",
      "input_images",
      "img",
      "first_frame_image",
      "start_image",
      "source_image",
      "image_path",
      "subject_image",
      "file"
    ]) {
      expect(
        selectPrimaryImageInput([inp("zzz_unknown"), inp(name)], 1)?.name
      ).toBe(name);
    }
  });

  it("orders by priority among multiple known names", () => {
    expect(
      selectPrimaryImageInput([inp("img"), inp("input_image"), inp("image")], 1)
        ?.name
    ).toBe("image"); // index 0 beats 1 and 5
    expect(
      selectPrimaryImageInput([inp("source_image"), inp("input_image")], 1)?.name
    ).toBe("input_image"); // index 1 beats index 8
  });

  it("strongly prefers a list-typed field when multiple images are supplied", () => {
    // Single image: scalar "image" (idx 0) beats list "input_images" (idx 4).
    expect(
      selectPrimaryImageInput([inp("image"), inp("input_images", true)], 1)?.name
    ).toBe("image");
    // Multiple images: the list field gets a -100 bonus and wins despite worse base rank.
    expect(
      selectPrimaryImageInput([inp("image"), inp("input_images", true)], 2)?.name
    ).toBe("input_images");
  });

  it("penalises a scalar field when multiple images are supplied", () => {
    // Two scalars: with multiple images both get +10, so base priority still decides.
    expect(
      selectPrimaryImageInput([inp("img"), inp("image")], 2)?.name
    ).toBe("image");
  });
});
