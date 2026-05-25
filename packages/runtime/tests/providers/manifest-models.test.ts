import { describe, it, expect } from "vitest";
import {
  loadImageModels,
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
      expect(m.supportedTasks).toEqual(["text_to_image", "image_to_image"]);
    }
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
