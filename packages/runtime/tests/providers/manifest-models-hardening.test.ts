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
  requiresMediaInput,
  narrowTasksByRequiredInputs,
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
  it("reads FAL's unit-suffixed duration spellings", () => {
    // The Veo 3.1 image-to-video and first-last-frame families, and Marey,
    // declare `["4s", "6s", "8s"]`. `Number("4s")` is NaN, so the whole enum
    // used to drop and the endpoint looked unconstrained.
    const n = {
      inputFields: [
        { name: "duration", propType: "x", enumValues: ["4s", "6s", "8s"] }
      ]
    };
    expect(videoConstraints(n).durations).toEqual([4, 6, 8]);
  });

  it("reads a mixed bag of spellings and drops what names no length", () => {
    const n = {
      inputFields: [
        {
          name: "duration",
          propType: "x",
          enumValues: ["auto", "5", "8s", "2.5s", "10 seconds", "", "s"]
        }
      ]
    };
    expect(videoConstraints(n).durations).toEqual([5, 8, 2.5, 10]);
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
    //
    // The manifest is this package's own. `@nodetool-ai/fal-nodes` is the
    // larger catalog, but it *depends on* runtime, so no dependency edge can
    // order its build before this test — turbo's `test` dependsOn `^build`
    // builds a package's dependencies, never its dependents. On a `--affected`
    // CI run that reached runtime, `fal-manifest.json` was simply not on disk
    // yet and the catalog came back empty.
    const real = loadImageModels(
      "@nodetool-ai/runtime",
      "providers/aki-manifest.json",
      "aki"
    );
    expect(real.length).toBeGreaterThan(0);
    expect(loadImageModels(uniq(), "x.json", "p")).toEqual([]);
  });

  it("rejects an unregistered ref instead of serving a colocated file", () => {
    // aki-manifest.json sits next to manifest-models in this package, and the
    // old loader served it for ANY package name via its `./` fallback. The
    // registry guard closes that hole: a typo'd package yields [] (with a
    // warning) instead of silently picking up an unrelated colocated manifest.
    expect(loadManifest(uniq(), "aki-manifest.json")).toEqual([]);
  });

  it("loads a registered same-package manifest via the colocated fallback", () => {
    const manifest = loadManifest(
      "@nodetool-ai/runtime",
      "providers/aki-manifest.json"
    );
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

describe("narrowTasksByRequiredInputs", () => {
  const requiredImage = {
    outputType: "image",
    endpointId: "alibaba/qwen-image-3/edit",
    inputFields: [
      { name: "prompt", propType: "str", required: true },
      { name: "images", propType: "list[image]", required: true }
    ]
  };

  it("reads requiredness off the declared fields", () => {
    expect(requiresMediaInput(requiredImage, "image")).toBe(true);
    expect(requiresMediaInput(requiredImage, "video")).toBe(false);
    expect(
      requiresMediaInput(
        { inputFields: [{ name: "image", propType: "image" }] },
        "image"
      )
    ).toBe(false);
    // Kie declares uploads instead of typed fields, and says nothing about
    // requiredness — inference stands rather than being narrowed on a guess.
    expect(
      requiresMediaInput({ uploads: [{ field: "image", kind: "image" }] }, "image")
    ).toBe(false);
  });

  // `models.pick("text_to_image")` answered with an image *editor* — every
  // image endpoint was tagged with both generation tasks, so the pool was
  // alphabetical and this id sorts first.
  it("drops text_to_image from an endpoint that requires an image", () => {
    expect(
      narrowTasksByRequiredInputs(
        ["text_to_image", "image_to_image"],
        requiredImage,
        "image"
      )
    ).toEqual(["image_to_image"]);
  });

  // AtlasCloud manifests describe inputs under `fields` (`type`, not
  // `propType`). Blind to that convention, `requiresMediaInput` answered
  // false for every entry, and edit-only endpoints like
  // `openai/gpt-image-2/edit` ranked as top text_to_image answers — then
  // failed at call time with "request body field <image> is required".
  it("reads requiredness off AtlasCloud/Kie-style fields too", () => {
    const atlasEdit = {
      outputType: "image",
      modelId: "openai/gpt-image-2/edit",
      fields: [
        { name: "prompt", type: "str", required: true },
        { name: "images", type: "list[image]", required: true }
      ]
    };
    expect(requiresMediaInput(atlasEdit, "image")).toBe(true);
    expect(requiresMediaInput(atlasEdit, "video")).toBe(false);
    expect(
      requiresMediaInput(
        { fields: [{ name: "image", type: "image", required: false }] },
        "image"
      )
    ).toBe(false);
    expect(
      narrowTasksByRequiredInputs(
        ["text_to_image", "image_to_image"],
        atlasEdit,
        "image"
      )
    ).toEqual(["image_to_image"]);
  });

  it("an edit-only endpoint stops qualifying as a text_to_image model", () => {
    const [model] = buildImageModels([
      {
        outputType: "image",
        modelId: "openai/gpt-image-2/edit",
        fields: [
          { name: "prompt", type: "str", required: true },
          { name: "images", type: "list[image]", required: true }
        ]
      }
    ], "atlascloud");
    expect(model.id).toBe("openai/gpt-image-2/edit");
    expect(model.supportedTasks).toEqual(["image_to_image"]);
  });

  it("drops text_to_video from a video endpoint that requires an image", () => {
    expect(
      narrowTasksByRequiredInputs(
        ["text_to_video", "image_to_video"],
        {
          outputType: "video",
          inputFields: [{ name: "image", propType: "image", required: true }]
        },
        "video"
      )
    ).toEqual(["image_to_video"]);
  });

  it("falls back to the transform task when nothing generative is left", () => {
    expect(
      narrowTasksByRequiredInputs(
        ["text_to_video", "image_to_video"],
        {
          outputType: "video",
          inputFields: [{ name: "video", propType: "video", required: true }]
        },
        "video"
      )
    ).toEqual(["video_to_video"]);
  });

  it("leaves an endpoint that requires nothing alone", () => {
    const tasks = ["text_to_image", "image_to_image"];
    expect(
      narrowTasksByRequiredInputs(
        tasks,
        {
          outputType: "image",
          inputFields: [{ name: "image", propType: "image", required: false }]
        },
        "image"
      )
    ).toBe(tasks);
  });

  it("never overrules an explicit supportedTasks declaration", () => {
    const [model] = buildImageModels(
      [
        {
          outputType: "image",
          endpointId: "e1",
          supportedTasks: ["text_to_image"],
          inputFields: [{ name: "image", propType: "image", required: true }]
        }
      ],
      "p"
    );
    expect(model.supportedTasks).toEqual(["text_to_image"]);
  });

  it("narrows an inferred tagging through buildImageModels", () => {
    const [model] = buildImageModels([requiredImage], "fal_ai");
    expect(model.supportedTasks).toEqual(["image_to_image"]);
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
    ["imagetovideo", ["image_to_video"]],
    ["fal-ai/topaz/upscale/video", ["video_to_video"]],
    ["super-resolution", ["video_to_video"]],
    ["seedvr", ["video_to_video"]],
    ["flashvsr", ["video_to_video"]],
    ["wan-vision-enhancer", ["video_to_video"]]
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

  // A live session searched image_to_video for "ltx" and got back four
  // audio-to-video endpoints and an extend-video one, because every endpoint
  // whose id spelled out neither direction was tagged as both generators.
  const byId: [string, string[]][] = [
    ["fal-ai/ltx-2-19b/audio-to-video", ["audio_to_video"]],
    ["fal-ai/ltx-2-19b/distilled/audio-to-video/lora", ["audio_to_video"]],
    ["fal-ai/longcat-multi-avatar/image-audio-to-video", ["audio_to_video"]],
    ["argil/avatars/audio-to-video", ["audio_to_video"]],
    ["fal-ai/ltx-2-19b/extend-video", ["video_to_video"]],
    ["fal-ai/ltx-video-13b-dev/extend", ["video_to_video"]],
    ["fal-ai/ltx-2.3/reframe", ["video_to_video"]],
    ["fal-ai/ltx-2/retake-video", ["video_to_video"]],
    ["fal-ai/ltx-2.3-quality/outpaint", ["video_to_video"]],
    ["fal-ai/bernini-r/edit-video", ["video_to_video"]],
    ["bria/video/background-removal/v3", ["video_to_video"]],
    ["fal-ai/amt-interpolation/frame-interpolation", ["video_to_video"]],
    ["fal-ai/elevenlabs/dubbing", ["video_to_video"]],
    ["decart/lucy-restyle", ["video_to_video"]],
    ["blackforestlabs/flux-3/first-last-frame-to-video", ["image_to_video"]],
    ["blackforestlabs/flux-3/keyframes-to-video", ["image_to_video"]],
    ["bytedance/seedance-2.0/reference-to-video", ["image_to_video"]],
    // Still a generator: the direction is spelled out, so nothing above bites.
    ["fal-ai/ltx-2-19b/image-to-video", ["image_to_video"]],
    ["fal-ai/ltx-2-19b/distilled/image-to-video/lora", ["image_to_video"]],
    ["fal-ai/heygen/avatar4/image-to-video", ["image_to_video"]],
    // A lip-sync endpoint keeps its own task even when the id says audio.
    ["fal-ai/kling-video/lipsync/audio-to-video", ["lip_sync"]]
  ];
  for (const [id, expected] of byId) {
    it(`"${id}" → ${expected.join("+")}`, () => {
      expect(inferVideoTasks("", id)).toEqual(expected);
    });
  }
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
