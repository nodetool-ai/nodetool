/**
 * @jest-environment node
 */
import {
  setLazyLeash,
  getLazyLeash,
  clearLazyLeash,
} from "../lazyLeashState";

describe("lazyLeashState", () => {
  afterEach(() => {
    clearLazyLeash();
  });

  it("returns null when no leash is set", () => {
    expect(getLazyLeash()).toBeNull();
  });

  it("stores and retrieves a leash", () => {
    const leash = {
      rawDoc: { x: 10, y: 20 },
      tipDoc: { x: 15, y: 25 },
    };
    setLazyLeash(leash);
    expect(getLazyLeash()).toBe(leash);
  });

  it("updates to a new leash", () => {
    setLazyLeash({ rawDoc: { x: 0, y: 0 }, tipDoc: { x: 1, y: 1 } });
    const next = { rawDoc: { x: 50, y: 50 }, tipDoc: { x: 55, y: 55 } };
    setLazyLeash(next);
    expect(getLazyLeash()).toBe(next);
  });

  it("clears the leash", () => {
    setLazyLeash({ rawDoc: { x: 0, y: 0 }, tipDoc: { x: 1, y: 1 } });
    clearLazyLeash();
    expect(getLazyLeash()).toBeNull();
  });

  it("can set the leash to null explicitly", () => {
    setLazyLeash({ rawDoc: { x: 0, y: 0 }, tipDoc: { x: 1, y: 1 } });
    setLazyLeash(null);
    expect(getLazyLeash()).toBeNull();
  });
});
