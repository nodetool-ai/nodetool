import { describe, it, expect, afterEach, jest } from "@jest/globals";
import { stub } from "../../test-utils/doubles";
import { probeMediaDurationMs } from "../probeMediaDuration";

function fakeEl(duration: number): HTMLVideoElement {
  return stub<HTMLVideoElement>({
    preload: "",
    duration,
    src: "",
    onloadedmetadata: null,
    onerror: null,
    removeAttribute: () => {},
    load: () => {}
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("probeMediaDurationMs", () => {
  it("resolves to the rounded ms duration from loadedmetadata", async () => {
    const el = fakeEl(12.5);
    jest
      .spyOn(document, "createElement")
      .mockReturnValue(el);

    const p = probeMediaDurationMs("blob:x", "video");
    el.onloadedmetadata?.(new Event("loadedmetadata"));

    await expect(p).resolves.toBe(12500);
  });

  it("resolves to null for a non-finite duration", async () => {
    const el = fakeEl(NaN);
    jest
      .spyOn(document, "createElement")
      .mockReturnValue(el);

    const p = probeMediaDurationMs("blob:x", "video");
    el.onloadedmetadata?.(new Event("loadedmetadata"));

    await expect(p).resolves.toBeNull();
  });

  it("resolves to null when the element errors", async () => {
    const el = fakeEl(0);
    jest
      .spyOn(document, "createElement")
      .mockReturnValue(el);

    const p = probeMediaDurationMs("blob:x", "audio");
    el.onerror?.(new Event("error"));

    await expect(p).resolves.toBeNull();
  });
});
