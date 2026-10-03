import { isCoarsePointer } from "../isCoarsePointer";

describe("isCoarsePointer", () => {
  const original = window.matchMedia;

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: original
    });
  });

  const setMatchMedia = (value: unknown) => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value
    });
  };

  it("is false when matchMedia is unavailable", () => {
    setMatchMedia(undefined);

    expect(isCoarsePointer()).toBe(false);
  });

  it("queries the primary pointer type", () => {
    const matchMedia = jest.fn(() => ({ matches: true }));
    setMatchMedia(matchMedia);

    isCoarsePointer();

    expect(matchMedia).toHaveBeenCalledWith("(pointer: coarse)");
  });

  it("is true when the pointer is coarse", () => {
    setMatchMedia(() => ({ matches: true }));

    expect(isCoarsePointer()).toBe(true);
  });

  it("is false when the pointer is fine", () => {
    setMatchMedia(() => ({ matches: false }));

    expect(isCoarsePointer()).toBe(false);
  });

  it("re-reads the media query on every call", () => {
    let matches = false;
    setMatchMedia(() => ({ matches }));

    expect(isCoarsePointer()).toBe(false);
    matches = true;
    expect(isCoarsePointer()).toBe(true);
  });
});
