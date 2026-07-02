import { describe, it, expect } from "vitest";
import {
  buildMusicModels,
  buildTTSModels,
  loadImageModels,
  loadMusicModels,
  loadTTSModels,
  loadVideoModels
} from "../../src/providers/manifest-models.js";

const FAL_PKG = "@nodetool-ai/fal-nodes";
const FAL_MANIFEST = "fal-manifest.json";

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

  it("tags specialized image transforms with a single specific task", () => {
    expect(byId(images, "fal-ai/image-apps-v2/relighting")?.supportedTasks).toEqual([
      "relight"
    ]);
    // IC-Light is a relighting model that never says "relight" in its id/name.
    expect(byId(images, "fal-ai/iclight-v2")?.supportedTasks).toEqual([
      "relight"
    ]);
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

  it("tags general image generators with both generation tasks", () => {
    const generators = images.filter(
      (m) =>
        m.supportedTasks?.includes("text_to_image") ||
        m.supportedTasks?.includes("image_to_image")
    );
    expect(generators.length).toBeGreaterThan(0);
    for (const m of generators) {
      // Every generator carries both generation tasks; mask-declaring endpoints
      // additionally advertise inpainting (the only permitted extra).
      const tasks = m.supportedTasks ?? [];
      expect(tasks).toContain("text_to_image");
      expect(tasks).toContain("image_to_image");
      const extras = tasks.filter(
        (t) => t !== "text_to_image" && t !== "image_to_image"
      );
      expect(extras.every((t) => t === "inpainting")).toBe(true);
    }
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

  it("pure buildMusicModels: matches by module/task/keyword; excludes TTS", () => {
    const models = buildMusicModels(
      [
        // FAL-style: tagged by the text_to_audio module
        {
          endpointId: "vendor/compose",
          className: "Compose",
          outputType: "audio",
          moduleName: "text_to_audio"
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
      "vendor/compose",
      "vendor/song"
    ]);
    expect(
      models.every((m) => m.supportedTasks?.includes("text_to_music"))
    ).toBe(true);
  });
});

function byIdIn<T extends { id: string }>(list: T[], id: string): T | undefined {
  return list.find((m) => m.id === id);
}
