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
  noModelSamples,
  setModelSampleProbe,
  useModelSamples,
  MODEL_SAMPLE_BASE_URL
} from "../modelSamples";

/** The elements the probe made, so a test can settle them. */
let created: Array<{ tag: string; el: HTMLElement }> = [];

const realCreateElement = document.createElement.bind(document);

beforeEach(() => {
  created = [];
  // The suite that covers the real probe is the one that installs it. Every
  // other suite keeps the no-network probe the web test setup installs.
  setModelSampleProbe(null);
  jest
    .spyOn(document, "createElement")
    .mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const el = realCreateElement(tag, options);
      if (tag === "img" || tag === "video") {
        // jsdom runs with `resources: "usable"`, so the prototype's `src`
        // setter resolves the CDN hostname for real. Shadow it with a plain
        // property: the probe under test only writes the URL, and the events
        // it listens for are dispatched by hand below.
        Object.defineProperty(el, "src", { writable: true, value: "" });
        created.push({ tag, el });
      }
      return el;
    });
});

afterEach(() => {
  jest.restoreAllMocks();
  setModelSampleProbe(noModelSamples);
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

  // A media element in jsdom resolves the CDN hostname for real. A suite that
  // named a model id made an outbound DNS call and then never settled either
  // way: slow, flaky on a bad link, dead on an offline runner.
  it("answers without a request under the test environment's probe", async () => {
    setModelSampleProbe(noModelSamples);

    // A tile decides between its picture and its fallback on this answer, so
    // the probe has to settle, not hang.
    await expect(noModelSamples("img-c", "image")).resolves.toBe(false);

    const { result } = renderHook(() => useModelSamples(["img-c"], "image"));

    await waitFor(() => expect(result.current).toEqual({}));
    expect(created).toHaveLength(0);
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
