/**
 * The static early-out (A5.2): when nothing moves inside the shutter window,
 * one composite is the whole frame.
 */
import { describe, expect, it } from "vitest";
import { shutterWindowIsStatic } from "../src/render/motionBlur.js";

const still = { kind: "image", clip: {} };

describe("shutterWindowIsStatic", () => {
  it("is static for still images with no animation in flight", () => {
    expect(shutterWindowIsStatic([still, { kind: "text", clip: {} }], false)).toBe(
      true
    );
  });

  it("is not static while an animation window covers the instant", () => {
    expect(shutterWindowIsStatic([still], true)).toBe(false);
  });

  it("is not static with a video source, a transition, a remap or a caption", () => {
    expect(shutterWindowIsStatic([{ kind: "video", clip: {} }], false)).toBe(false);
    expect(
      shutterWindowIsStatic([{ ...still, transition: { type: "wipe" } }], false)
    ).toBe(false);
    expect(
      shutterWindowIsStatic([{ kind: "image", clip: { timeRemap: {} } }], false)
    ).toBe(false);
    expect(shutterWindowIsStatic([{ kind: "caption", clip: {} }], false)).toBe(
      false
    );
  });

  it("is not static when a matte source is video", () => {
    expect(
      shutterWindowIsStatic(
        [{ ...still, matte: { layer: { kind: "video" } } }],
        false
      )
    ).toBe(false);
  });

  it("has no opinion on an empty frame beyond static", () => {
    expect(shutterWindowIsStatic([], false)).toBe(true);
  });
});
