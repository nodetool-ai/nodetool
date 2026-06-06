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
