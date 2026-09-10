import { describe, it, expect } from "vitest";
import {
  buildMusicModels,
  buildTTSModels,
  getManifestNodeMeta,
  getModelInputFields,
  getRequiredTextInputNames,
  isKieMusicNode,
  loadImageModels,
  loadMusicModels,
  loadTTSModels,
  loadVideoModels
} from "../../src/providers/manifest-models.js";
import {
  buildVideoModels,
  getModelReferenceInputs,
  validateReferenceInputs,
  inferVideoTasks
} from "../../src/providers/manifest-models.js";

const FAL_PKG = "@nodetool-ai/fal-nodes";
const FAL_MANIFEST = "fal-manifest.json";
const KIE_PKG = "@nodetool-ai/kie-nodes";
const KIE_MANIFEST = "kie-manifest.json";
const REPLICATE_PKG = "@nodetool-ai/replicate-nodes";
const REPLICATE_MANIFEST = "replicate-manifest.json";
const ATLAS_PKG = "@nodetool-ai/atlascloud-nodes";
const ATLAS_MANIFEST = "atlascloud-manifest.json";

describe("reference-to-video discovery and validation", () => {
  it("discovers shipped reference endpoints with generic media fields", () => {
    const fal = loadVideoModels(FAL_PKG, FAL_MANIFEST, "fal_ai").find((m) => m.id === "fal-ai/veo3.1/reference-to-video");
    const kie = loadVideoModels(KIE_PKG, KIE_MANIFEST, "kie").find((m) => m.id === "kling-3.0-omni/reference-to-video");
    expect(fal?.supportedTasks).toContain("reference_to_video");
    expect(kie?.supportedTasks).toContain("reference_to_video");
  });

  it("classifies reference names before image-to-video", () => {
    expect(inferVideoTasks("Reference To Video", "model")).toEqual(["reference_to_video"]);
    expect(inferVideoTasks("", "ref-to-video-model")).toEqual(["reference_to_video"]);
  });

  it("does not assume generic media arrays are identity references", () => {
    const models = buildVideoModels([
      { endpointId: "ambiguous", className: "Video Generator", outputType: "video", inputFields: [
        { name: "images", apiParamName: "image_urls", propType: "list[image]" },
        { name: "videos", apiParamName: "video_urls", propType: "list[video]" }
      ] }
    ], "test");
    expect(models[0]?.supportedTasks).not.toContain("reference_to_video");
  });

  it("preserves start-frame catalogs and omits unsupported structured reference endpoints", () => {
    const kie = loadVideoModels(KIE_PKG, KIE_MANIFEST, "kie");
    expect(kie.find((m) => m.id === "kling-2.6/image-to-video")?.supportedTasks).toEqual(["image_to_video"]);
    expect(kie.find((m) => m.id === "pixverse-v6/reference-to-video")).toBeUndefined();
    const fal = loadVideoModels(FAL_PKG, FAL_MANIFEST, "fal_ai");
    expect(fal.find((m) => m.id === "fal-ai/pika/v2.2/pikaframes")?.supportedTasks).not.toContain("reference_to_video");
    const fields = getModelReferenceInputs(FAL_PKG, FAL_MANIFEST, "alibaba/wan-3.0-prime/reference-to-video");
    expect(fields.map((field) => field.apiName).sort()).toEqual(["reference_image_urls", "reference_video_urls"]);
  });

  it("distinguishes Sora's optional first frame from role-specific references", () => {
    const models = loadVideoModels(REPLICATE_PKG, REPLICATE_MANIFEST, "replicate");
    expect(models.find((m) => m.id === "openai/sora-2")?.supportedTasks).toEqual([
      "text_to_video",
      "image_to_video"
    ]);
  });

  it.each([
    "google/veo-3.1",
    "bytedance/seedance-1-lite",
    "bytedance/seedance-2.0",
    "bytedance/seedance-2.5"
  ])("retains text and start-frame generation with optional references for %s", (id) => {
    const models = loadVideoModels(REPLICATE_PKG, REPLICATE_MANIFEST, "replicate");
    expect(models.find((model) => model.id === id)?.supportedTasks).toEqual([
      "text_to_video", "image_to_video", "reference_to_video"
    ]);
  });

  it("preserves distinct Wan 3.0 text, start-frame, and reference endpoints", () => {
    const models = loadVideoModels(ATLAS_PKG, ATLAS_MANIFEST, "atlascloud");
    for (const task of ["text_to_video", "image_to_video", "reference_to_video"]) {
      const id = `alibaba/wan-3.0/${task.replaceAll("_", "-")}`;
      expect(models.find((model) => model.id === id)?.supportedTasks).toEqual([task]);
    }
  });

  it("keeps dedicated Veo, Seedance, and Wan reference endpoints reference-only", () => {
    const models = loadVideoModels(ATLAS_PKG, ATLAS_MANIFEST, "atlascloud");
    for (const id of [
      "google/veo3.1/reference-to-video",
      "bytedance/seedance-2.5/reference-to-video",
      "alibaba/wan-3.0/reference-to-video"
    ]) {
      expect(models.find((m) => m.id === id)?.supportedTasks).toEqual([
        "reference_to_video"
      ]);
    }
  });

  it("uses only matching media kinds in malformed generated fields", () => {
    const fields = getModelReferenceInputs(FAL_PKG, FAL_MANIFEST, "wan/v2.6/reference-to-video/flash");
    expect(fields).toEqual([expect.objectContaining({ kind: "image", apiName: "image_urls", isList: true })]);
  });

  it("rejects ambiguous reference fields instead of dropping or duplicating inputs", () => {
    expect(() => validateReferenceInputs("test", "model", { images: [new Uint8Array([1])], videos: [] }, [
      { kind: "image", name: "reference_images", apiName: "reference_images", isList: true },
      { kind: "image", name: "subject_images", apiName: "subject_images", isList: true }
    ])).toThrow("ambiguous reference image");
  });

  it("keeps video editing models with required sources out of reference generation", () => {
    const models = loadVideoModels("@nodetool-ai/replicate-nodes", "replicate-manifest.json", "replicate");
    for (const id of ["runwayml/gen4-aleph", "decart/lucy-edit-2", "wan-video/wan-2.7-videoedit"]) {
      expect(models.find((model) => model.id === id)?.supportedTasks).toEqual(["video_to_video"]);
    }
  });

  it("keeps explicit tasks authoritative and protects required reference video", () => {
    const models = buildVideoModels([
      { endpointId: "explicit", outputType: "video", supportedTasks: ["image_to_video", "reference_to_video"], fields: [{ name: "reference_videos", type: "list[video]", required: true }] },
      { endpointId: "required", outputType: "video", className: "Video Generator", fields: [{ name: "reference_videos", type: "list[video]", required: true }] }
    ], "test");
    expect(models.find((m) => m.id === "explicit")?.supportedTasks).toEqual(["image_to_video", "reference_to_video"]);
    expect(models.find((m) => m.id === "required")?.supportedTasks).toEqual(["reference_to_video"]);
  });

  it("adds optional reference inputs without dropping text or image generation", () => {
    const models = buildVideoModels([
      {
        endpointId: "optional-text",
        className: "Optional Text to Video",
        outputType: "video",
        fields: [{ name: "reference_images", type: "list[image]" }]
      },
      {
        endpointId: "optional-image",
        className: "Optional Image to Video",
        outputType: "video",
        fields: [{ name: "reference_images", type: "list[image]" }]
      }
    ], "test");
    expect(models.find((m) => m.id === "optional-text")?.supportedTasks).toEqual([
      "text_to_video",
      "reference_to_video"
    ]);
    expect(models.find((m) => m.id === "optional-image")?.supportedTasks).toEqual([
      "image_to_video",
      "reference_to_video"
    ]);
  });

  it("validates empty, unsupported, required, and bounded references", () => {
    const fields = getModelReferenceInputs("test", "manifest", "missing");
    expect(fields).toEqual([]);
    expect(() => validateReferenceInputs("test", "m", { images: [], videos: [] }, [{ kind: "video", name: "reference_videos", apiName: "reference_videos", isList: true, required: true }])).toThrow("at least one");
    expect(() => validateReferenceInputs("test", "m", { images: [], videos: [new Uint8Array([1])] }, [{ kind: "video", name: "reference_videos", apiName: "reference_videos", isList: true, required: true }])).not.toThrow();
    expect(() => validateReferenceInputs("test", "m", { images: [new Uint8Array([1]), new Uint8Array([2])], videos: [] }, [{ kind: "image", name: "reference_image", apiName: "reference_image", isList: true, max: 1 }])).toThrow("at most 1");
  });

  it("treats required wrapped image and video fields as one mixed requirement", () => {
    const fields = [
      { kind: "image" as const, name: "reference_images", apiName: "reference_images", isList: true, required: true, wrapInto: "refers" },
      { kind: "video" as const, name: "reference_videos", apiName: "reference_videos", isList: true, required: true, wrapInto: "refers", min: 2 }
    ];
    expect(() => validateReferenceInputs("kie", "h3", { images: [new Uint8Array([1])], videos: [] }, fields)).not.toThrow();
    expect(() => validateReferenceInputs("kie", "h3", { images: [], videos: [new Uint8Array([1])] }, fields)).not.toThrow();
    expect(() => validateReferenceInputs("kie", "h3", { images: [], videos: [] }, fields)).toThrow("at least one");
  });
});

describe("manifest-models task inference (FAL manifest)", () => {
  const images = loadImageModels(FAL_PKG, FAL_MANIFEST, "fal_ai");
  const videos = loadVideoModels(FAL_PKG, FAL_MANIFEST, "fal_ai");
  const byId = (list: { id: string }[], id: string) =>
    list.find((m) => m.id === id);

  it("loads a non-trivial catalog", () => {
    expect(images.length).toBeGreaterThan(100);
    expect(videos.length).toBeGreaterThan(100);
  });

  it("tags every model with at least one task", () => {
    for (const m of [...images, ...videos]) {
      expect(m.supportedTasks?.length ?? 0).toBeGreaterThan(0);
    }
  });

  // The catalog-wide form of the failure this fixed: `find_model` for
  // image_to_video ranked ties alphabetically, so a search for "ltx" answered
  // with four audio-to-video endpoints and an extend-video one.
  it("keeps non-generator video endpoints out of the generation pools", () => {
    const generators = videos.filter(
      (m) =>
        m.supportedTasks?.includes("text_to_video") ||
        m.supportedTasks?.includes("image_to_video")
    );
    const offenders = generators
      .map((m) => m.id)
      .filter((id) =>
        /audio-to-video|extend-video|\/extend$|reframe|retake|background-removal/.test(
          id
        )
      );
    expect(offenders).toEqual([]);
    expect(
      byId(videos, "fal-ai/ltx-2-19b/audio-to-video")?.supportedTasks
    ).toEqual(["audio_to_video"]);
    expect(
      byId(videos, "fal-ai/ltx-2-19b/image-to-video")?.supportedTasks
    ).toEqual(["image_to_video"]);
  });

  it("tags specialized image transforms with a single specific task", () => {
    expect(byId(images, "fal-ai/image-apps-v2/relighting")?.supportedTasks).toEqual([
      "relight"
    ]);
    // IC-Light is a relighting model that never says "relight" in its id/name.
    // (It declares a mask input, so it also picks up the "inpainting" task.)
    expect(byId(images, "fal-ai/iclight-v2")?.supportedTasks).toContain(
      "relight"
    );
    expect(byId(images, "fal-ai/recraft/vectorize")?.supportedTasks).toEqual([
      "vectorize"
    ]);
    expect(byId(images, "fal-ai/bria/background/remove")?.supportedTasks).toEqual([
      "remove_background"
    ]);
  });

  it("salvages dict-typed image upscalers (e.g. clarity-upscaler)", () => {
    expect(byId(images, "fal-ai/clarity-upscaler")?.supportedTasks).toEqual([
      "upscale"
    ]);
  });

  it("never mixes a specialized task with a generation task", () => {
    for (const m of images) {
      const tasks = m.supportedTasks ?? [];
      const hasSpecialized = tasks.some((t) =>
        ["upscale", "remove_background", "relight", "vectorize"].includes(t)
      );
      const hasGeneration = tasks.some((t) =>
        ["text_to_image", "image_to_image"].includes(t)
      );
      expect(hasSpecialized && hasGeneration).toBe(false);
    }
  });

  it("tags a general image generator image_to_image, and text_to_image unless it requires an image", () => {
    const generators = images.filter(
      (m) =>
        m.supportedTasks?.includes("text_to_image") ||
        m.supportedTasks?.includes("image_to_image")
    );
    expect(generators.length).toBeGreaterThan(0);
    for (const m of generators) {
      // Direction cannot be read off a FAL id, so a generator carries
      // image_to_image either way; mask-declaring endpoints additionally
      // advertise inpainting (the only permitted extra).
      const tasks = m.supportedTasks ?? [];
      expect(tasks).toContain("image_to_image");
      const extras = tasks.filter(
        (t) => t !== "text_to_image" && t !== "image_to_image"
      );
      expect(extras.every((t) => t === "inpainting")).toBe(true);
    }
    // Some do generate from a prompt alone…
    expect(
      generators.filter((m) => m.supportedTasks?.includes("text_to_image"))
        .length
    ).toBeGreaterThan(0);
    // …and an endpoint whose manifest marks an image input required does not:
    // `pick("text_to_image")` answered with this editor before the required
    // inputs were read.
    expect(
      byId(images, "alibaba/qwen-image-3/edit")?.supportedTasks
    ).toEqual(["image_to_image"]);
  });

  it("tags mask-declaring edit endpoints with the inpainting task", () => {
    const inpainters = images.filter((m) =>
      m.supportedTasks?.includes("inpainting")
    );
    expect(inpainters.length).toBeGreaterThan(0);
    // ideogram/v2/edit declares a `mask_url` input.
    expect(byId(images, "fal-ai/ideogram/v2/edit")?.supportedTasks).toContain(
      "inpainting"
    );
  });

  it("derives per-model option constraints from manifest enums", () => {
    const pixverse = byId(videos, "fal-ai/pixverse/v5.6/image-to-video") as
      | { durations?: number[]; resolutions?: string[] }
      | undefined;
    // duration enums ship as strings ("5"/"8"/"10") and must be numbers so the
    // composer can offer them and the request doesn't 422.
    expect(pixverse?.durations).toEqual([5, 8, 10]);
    expect(pixverse?.resolutions).toEqual(["360p", "540p", "720p", "1080p"]);

    const seedance = byId(
      videos,
      "fal-ai/bytedance/seedance/v1/pro/fast/image-to-video"
    ) as { aspectRatios?: string[] } | undefined;
    expect(seedance?.aspectRatios).toContain("16:9");

    // A meaningful share of the video catalog carries constraints.
    const withConstraints = videos.filter(
      (m) =>
        (m as { durations?: number[] }).durations ||
        (m as { resolutions?: string[] }).resolutions ||
        (m as { aspectRatios?: string[] }).aspectRatios
    );
    expect(withConstraints.length).toBeGreaterThan(50);
  });

  it("tags lip-sync and video-to-video as exclusive video tasks", () => {
    const lip = videos.filter((m) => m.supportedTasks?.includes("lip_sync"));
    expect(lip.length).toBeGreaterThan(0);
    for (const m of lip) expect(m.supportedTasks).toEqual(["lip_sync"]);

    const v2v = videos.filter((m) =>
      m.supportedTasks?.includes("video_to_video")
    );
    expect(v2v.length).toBeGreaterThan(0);
    for (const m of v2v) expect(m.supportedTasks).toEqual(["video_to_video"]);
  });
});

describe("manifest-models TTS discovery", () => {
  const tts = loadTTSModels(FAL_PKG, FAL_MANIFEST, "fal_ai");
  const byId = (id: string) => tts.find((m) => m.id === id);

  it("discovers the FAL text-to-speech catalog", () => {
    expect(tts.length).toBeGreaterThan(10);
    expect(byId("fal-ai/dia-tts")).toBeTruthy();
    expect(tts.every((m) => m.provider === "fal_ai")).toBe(true);
  });

  it("extracts a preset voice list from an enumerated voice field", () => {
    const vibe = byId("fal-ai/vibevoice/0.5b");
    expect(vibe?.voices ?? []).toContain("Emma");
  });

  it("pure buildTTSModels: matches by moduleName, task, or id; excludes other audio", () => {
    const models = buildTTSModels(
      [
        // FAL-style: tagged by module
        {
          endpointId: "vendor/speak",
          className: "Speak",
          outputType: "audio",
          moduleName: "text_to_speech",
          inputFields: [
            { name: "voice", propType: "str", enumValues: ["Ann", "Bob"] }
          ]
        },
        // KIE-style: no module, identified by id keyword
        {
          modelId: "elevenlabs/text-to-speech-multilingual-v2",
          title: "ElevenLabs Multilingual",
          outputType: "audio"
        },
        // Explicit task
        {
          endpointId: "vendor/tts2",
          outputType: "audio",
          supportedTasks: ["text_to_speech"]
        },
        // Not TTS — a music model with audio output must be excluded
        {
          endpointId: "vendor/music",
          className: "MakeMusic",
          outputType: "audio"
        }
      ],
      "fal_ai"
    );
    expect(models.map((m) => m.id).sort()).toEqual([
      "elevenlabs/text-to-speech-multilingual-v2",
      "vendor/speak",
      "vendor/tts2"
    ]);
    expect(byIdIn(models, "vendor/speak")?.voices).toEqual(["Ann", "Bob"]);
    expect(byIdIn(models, "vendor/tts2")?.voices).toBeUndefined();
  });
});

describe("manifest-models music discovery", () => {
  const music = loadMusicModels(FAL_PKG, FAL_MANIFEST, "fal_ai");

  it("discovers the FAL text-to-music catalog and tags it", () => {
    expect(music.length).toBeGreaterThan(3);
    expect(music.every((m) => m.provider === "fal_ai")).toBe(true);
    expect(
      music.every((m) => m.supportedTasks?.includes("text_to_music"))
    ).toBe(true);
    // A well-known FAL music endpoint is present.
    expect(music.some((m) => /music|stable-audio|ace-step/i.test(m.id))).toBe(
      true
    );
  });

  it("does not surface any text-to-speech model under music", () => {
    const tts = new Set(
      loadTTSModels(FAL_PKG, FAL_MANIFEST, "fal_ai").map((m) => m.id)
    );
    expect(music.some((m) => tts.has(m.id))).toBe(false);
  });

  it("keeps speech, sound effects and audio transforms out of the FAL music catalog", () => {
    const ids = new Set(music.map((m) => m.id));
    // Every one of these was in the music catalog when `moduleName:
    // "text_to_audio"` counted as music evidence: FAL files speech, music and
    // sound effects alike under it. A session asking for a music model was
    // handed ElevenLabs' dialogue model, whose id a `music_model` property
    // then refused.
    expect(ids.has("fal-ai/elevenlabs/text-to-dialogue/eleven-v3")).toBe(false);
    expect(ids.has("fal-ai/kokoro")).toBe(false);
    expect(ids.has("fal-ai/kokoro/american-english")).toBe(false);
    expect(ids.has("fal-ai/zonos")).toBe(false);
    expect(ids.has("beatoven/sound-effect-generation")).toBe(false);
    expect(ids.has("cassetteai/sound-effects-generator")).toBe(false);
    expect(ids.has("fal-ai/ace-step/audio-inpaint")).toBe(false);
    // …and the real music endpoints are still there.
    expect(ids.has("beatoven/music-generation")).toBe(true);
    expect(ids.has("cassetteai/music-generator")).toBe(true);
    expect(ids.has("fal-ai/elevenlabs/music")).toBe(true);
    expect(ids.has("fal-ai/ace-step")).toBe(true);
  });

  it("lists the speech models the music catalog used to hold under TTS", () => {
    const tts = new Set(
      loadTTSModels(FAL_PKG, FAL_MANIFEST, "fal_ai").map((m) => m.id)
    );
    expect(tts.has("fal-ai/kokoro")).toBe(true);
    expect(tts.has("fal-ai/kokoro/american-english")).toBe(true);
    expect(tts.has("fal-ai/elevenlabs/text-to-dialogue/eleven-v3")).toBe(true);
    // A voice-clone TTS endpoint names itself in its id, which outranks the
    // reference-audio input that would otherwise read as a transform.
    expect(tts.has("fal-ai/dia-tts/voice-clone")).toBe(true);
  });

  it("pure buildMusicModels: needs music evidence, not just a text→audio module", () => {
    const models = buildMusicModels(
      [
        // FAL-style: the text_to_audio module is every text→audio endpoint,
        // so on its own it says nothing about music.
        {
          endpointId: "vendor/compose",
          className: "Compose",
          outputType: "audio",
          moduleName: "text_to_audio"
        },
        // Same module, but the tags name the task.
        {
          endpointId: "vendor/tagged",
          className: "Tagged",
          outputType: "audio",
          moduleName: "text_to_audio",
          tags: ["audio", "music", "generation"]
        },
        // Sound effects are neither music nor speech.
        {
          endpointId: "vendor/music-sound-effects",
          outputType: "audio",
          moduleName: "text_to_audio",
          tags: ["sfx"]
        },
        // A transform of existing audio has nothing to generate from.
        {
          endpointId: "vendor/musicgen/audio-to-audio",
          outputType: "audio",
          tags: ["audio-to-audio"]
        },
        // Identified by id keyword
        {
          modelId: "meta/musicgen",
          title: "MusicGen",
          outputType: "audio"
        },
        // Explicit task
        {
          endpointId: "vendor/song",
          outputType: "audio",
          supportedTasks: ["text_to_music"]
        },
        // TTS — must be excluded even though it outputs audio
        {
          endpointId: "vendor/speak",
          outputType: "audio",
          moduleName: "text_to_speech"
        },
        // Non-audio output — excluded
        {
          endpointId: "vendor/video",
          outputType: "video",
          className: "MusicVideo"
        }
      ],
      "replicate"
    );
    expect(models.map((m) => m.id).sort()).toEqual([
      "meta/musicgen",
      "vendor/song",
      "vendor/tagged"
    ]);
    expect(
      models.every((m) => m.supportedTasks?.includes("text_to_music"))
    ).toBe(true);
  });
});

describe("manifest-models Kie `fields` schema support", () => {
  it("extracts TTS preset voices from a Kie enum `voice` field", () => {
    const tts = loadTTSModels(KIE_PKG, KIE_MANIFEST, "kie");
    const multilingual = tts.find(
      (m) => m.id === "elevenlabs/text-to-speech-multilingual-v2"
    );
    expect(multilingual?.voices?.length ?? 0).toBeGreaterThan(10);
    // A free-form-voice model (voice not required) still lists preset voices.
    const turbo = tts.find(
      (m) => m.id === "elevenlabs/text-to-speech-turbo-2-5"
    );
    expect(turbo?.voices?.length ?? 0).toBeGreaterThan(10);
  });

  it("derives video durations from a Kie enum `duration` field", () => {
    const videos = loadVideoModels(KIE_PKG, KIE_MANIFEST, "kie");
    const kling = videos.find(
      (m) => m.id === "kling/v2-1-master-image-to-video"
    );
    expect(kling?.durations).toEqual([5, 10]);
  });

  it("derives image aspect ratios from a Kie enum `aspect_ratio` field", () => {
    const images = loadImageModels(KIE_PKG, KIE_MANIFEST, "kie");
    const imagen = images.find((m) => m.id === "google/imagen4");
    expect(imagen?.aspectRatios).toEqual([
      "1:1",
      "16:9",
      "9:16",
      "3:4",
      "4:3",
      "auto"
    ]);
  });
});

describe("getModelInputFields", () => {
  it("normalizes Kie `fields` (name is the API param, options in `values`)", () => {
    const fields = getModelInputFields(
      KIE_PKG,
      KIE_MANIFEST,
      "google/imagen4"
    );
    const aspect = fields.find((f) => f.name === "aspect_ratio");
    expect(aspect?.type).toBe("enum");
    expect(aspect?.enumValues).toContain("16:9");
    const prompt = fields.find((f) => f.name === "prompt");
    expect(prompt?.type).toBe("str");
    expect(prompt?.required).toBe(true);
  });

  it("normalizes FAL `inputFields` (apiParamName, lowercased propType)", () => {
    const fields = getModelInputFields(FAL_PKG, FAL_MANIFEST, "fal-ai/dia-tts");
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) {
      expect(f.type).toBe(f.type.toLowerCase());
    }
  });

  it("returns [] for an unknown model id", () => {
    expect(getModelInputFields(KIE_PKG, KIE_MANIFEST, "nope/nope")).toEqual([]);
  });
});

// The requirement that broke the trailer graph. Read off the real shipped
// manifests, because the check is worth exactly as much as the data behind it:
// a `required` flag the generator stopped emitting would leave the validator
// silently reporting nothing.
describe("getRequiredTextInputNames", () => {
  it("reads Kie's required `prompt` for a Kling image-to-video model", () => {
    expect(
      getRequiredTextInputNames(KIE_PKG, KIE_MANIFEST, "kling-2.6/image-to-video")
    ).toContain("prompt");
  });

  it("reads FAL's required `prompt` for a Kling image-to-video endpoint", () => {
    expect(
      getRequiredTextInputNames(
        FAL_PKG,
        FAL_MANIFEST,
        "fal-ai/kling-video/v2.5-turbo/pro/image-to-video"
      )
    ).toContain("prompt");
  });

  // A required media field arrives under its upload descriptor's API name
  // (`images` is sent as `image_urls`), so reporting it would make a caller
  // look for a property that is already correctly wired.
  it("reports no media or enum field, however required", () => {
    const names = getRequiredTextInputNames(
      KIE_PKG,
      KIE_MANIFEST,
      "kling-2.6/image-to-video"
    );
    expect(names).not.toContain("images");
    expect(names).not.toContain("duration");
    expect(names).not.toContain("sound");
  });

  // "Cannot tell" and "requires nothing" must not be the same answer.
  it("returns undefined for a model the manifest does not carry", () => {
    expect(
      getRequiredTextInputNames(KIE_PKG, KIE_MANIFEST, "nope/nope")
    ).toBeUndefined();
  });
});

describe("getManifestNodeMeta", () => {
  it("reads useSuno / sunoEndpoint / poll settings from the manifest", () => {
    const meta = getManifestNodeMeta(KIE_PKG, KIE_MANIFEST, "generate-music");
    expect(meta?.useSuno).toBe(true);
    expect(meta?.sunoEndpoint).toBe("/api/v1/generate");
    expect(typeof meta?.pollInterval).toBe("number");
    expect(typeof meta?.maxAttempts).toBe("number");
  });

  it("reports useSuno false for a plain (non-Suno) Kie model", () => {
    const meta = getManifestNodeMeta(KIE_PKG, KIE_MANIFEST, "google/imagen4");
    expect(meta?.useSuno).toBe(false);
  });

  it("returns undefined for an unknown model id", () => {
    expect(
      getManifestNodeMeta(KIE_PKG, KIE_MANIFEST, "nope/nope")
    ).toBeUndefined();
  });
});

describe("Kie music filter (isKieMusicNode)", () => {
  it("yields exactly {generate-music, generate-sounds} from the real manifest", () => {
    const music = loadMusicModels(KIE_PKG, KIE_MANIFEST, "kie");
    expect(music.map((m) => m.id).sort()).toEqual([
      "generate-music",
      "generate-sounds"
    ]);
    expect(
      music.every((m) => m.supportedTasks?.includes("text_to_music"))
    ).toBe(true);
  });

  it("accepts a prompt+model generator with no asset-referencing required field", () => {
    expect(
      isKieMusicNode({
        modelId: "generate-music",
        outputType: "audio",
        fields: [
          { name: "prompt", type: "str", required: true },
          { name: "model", type: "str", required: true }
        ]
      })
    ).toBe(true);
  });

  it("rejects a generator that requires an existing audio asset", () => {
    expect(
      isKieMusicNode({
        modelId: "extend-music",
        outputType: "audio",
        fields: [
          { name: "prompt", type: "str", required: true },
          { name: "model", type: "str", required: true },
          { name: "audioId", type: "str", required: true }
        ]
      })
    ).toBe(false);
  });

  it("rejects a lyrics endpoint (prompt but no model field)", () => {
    expect(
      isKieMusicNode({
        modelId: "generate-lyrics",
        outputType: "audio",
        fields: [{ name: "prompt", type: "str", required: true }]
      })
    ).toBe(false);
  });

  it("rejects a task-only utility (no prompt field)", () => {
    expect(
      isKieMusicNode({
        modelId: "separate-vocals",
        outputType: "audio",
        fields: [
          { name: "taskId", type: "str", required: true },
          { name: "audioId", type: "str", required: true }
        ]
      })
    ).toBe(false);
  });
});

function byIdIn<T extends { id: string }>(list: T[], id: string): T | undefined {
  return list.find((m) => m.id === id);
}
