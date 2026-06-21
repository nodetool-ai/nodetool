import { describe, it, expect, afterEach, jest } from "@jest/globals";
import { probeMediaDurationMs } from "../probeMediaDuration";

interface FakeMediaElement {
  preload: string;
  duration: number;
  src: string;
  onloadedmetadata: (() => void) | null;
  onerror: (() => void) | null;
  removeAttribute: () => void;
  load: () => void;
}

function fakeEl(duration: number): FakeMediaElement {
  return {
    preload: "",
    duration,
    src: "",
    onloadedmetadata: null,
    onerror: null,
    removeAttribute: () => {},
    load: () => {}
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("probeMediaDurationMs", () => {
  it("resolves to the rounded ms duration from loadedmetadata", async () => {
    const el = fakeEl(12.5);
    jest
      .spyOn(document, "createElement")
      .mockReturnValue(el as unknown as HTMLElement);

    const p = probeMediaDurationMs("blob:x", "video");
    el.onloadedmetadata?.();

    await expect(p).resolves.toBe(12500);
  });

  it("resolves to null for a non-finite duration", async () => {
    const el = fakeEl(NaN);
    jest
      .spyOn(document, "createElement")
      .mockReturnValue(el as unknown as HTMLElement);

    const p = probeMediaDurationMs("blob:x", "video");
    el.onloadedmetadata?.();

    await expect(p).resolves.toBeNull();
  });

  it("resolves to null when the element errors", async () => {
    const el = fakeEl(0);
    jest
      .spyOn(document, "createElement")
      .mockReturnValue(el as unknown as HTMLElement);

    const p = probeMediaDurationMs("blob:x", "audio");
    el.onerror?.();

    await expect(p).resolves.toBeNull();
  });
});
