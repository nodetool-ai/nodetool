/**
 * The model tiles' samples are fetched on first use, never shipped (R5).
 *
 * Both look steps go through one probe: E2's clip tiles and E4's still tiles.
 * The kind decides which element asks for the bytes, which event means
 * "renderable", and which extension the URL carries — a still probed with a
 * `<video>` element would never load, and every image tile would sit on its
 * typographic fallback forever.
 */

import { renderHook, waitFor } from "@testing-library/react";

import {
  modelSampleUrl,
  useModelSamples,
  MODEL_SAMPLE_BASE_URL
} from "../modelSamples";

/** The elements the probe made, so a test can settle them. */
let created: Array<{ tag: string; el: HTMLElement }> = [];

const realCreateElement = document.createElement.bind(document);

beforeEach(() => {
  created = [];
  jest
    .spyOn(document, "createElement")
    .mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const el = realCreateElement(tag, options);
      if (tag === "img" || tag === "video") {
        created.push({ tag, el });
      }
      return el;
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Fire the event that the probe treats as "this sample will render". */
const settleLoaded = (tag: "img" | "video") => {
  for (const entry of created.filter((c) => c.tag === tag)) {
    entry.el.dispatchEvent(
      new Event(tag === "video" ? "loadedmetadata" : "load")
    );
  }
};

describe("modelSampleUrl", () => {
  it("names a still for an image model and a clip for a video model", () => {
    expect(modelSampleUrl("fal-ai/flux/dev", "image")).toBe(
      `${MODEL_SAMPLE_BASE_URL}/fal-ai%2Fflux%2Fdev.jpg`
    );
    expect(modelSampleUrl("fal-ai/kling/v1.6", "video")).toBe(
      `${MODEL_SAMPLE_BASE_URL}/fal-ai%2Fkling%2Fv1.6.mp4`
    );
  });
});

describe("useModelSamples", () => {
  it("reports an image model's still once the browser has loaded it", async () => {
    const { result } = renderHook(() => useModelSamples(["img-a"], "image"));

    expect(created.map((c) => c.tag)).toEqual(["img"]);
    settleLoaded("img");

    await waitFor(() =>
      expect(result.current["img-a"]).toBe(
        `${MODEL_SAMPLE_BASE_URL}/img-a.jpg`
      )
    );
  });

  it("reports a video model's clip once its metadata has loaded", async () => {
    const { result } = renderHook(() => useModelSamples(["vid-a"], "video"));

    expect(created.map((c) => c.tag)).toEqual(["video"]);
    settleLoaded("video");

    await waitFor(() =>
      expect(result.current["vid-a"]).toBe(
        `${MODEL_SAMPLE_BASE_URL}/vid-a.mp4`
      )
    );
  });

  it("leaves a model whose sample fails to load on its fallback", async () => {
    const { result } = renderHook(() => useModelSamples(["img-b"], "image"));

    for (const entry of created) {
      entry.el.dispatchEvent(new Event("error"));
    }

    await waitFor(() => expect(created).toHaveLength(1));
    expect(result.current["img-b"]).toBeUndefined();
  });
});
