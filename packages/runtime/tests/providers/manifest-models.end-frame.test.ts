import { describe, it, expect } from "vitest";
import {
  selectEndFrameInput,
  selectPrimaryImageInput
} from "../../src/providers/manifest-models.js";

const END_FRAME_NAMES = [
  "end_image",
  "end_image_url",
  "end_frame",
  "end_frame_url",
  "end_frame_image",
  "last_frame",
  "last_frame_url",
  "last_frame_image",
  "last_frame_image_url",
  "last_image",
  "last_image_url",
  "tail_image",
  "tail_image_url",
  "image_tail"
];

const NOT_END_FRAME = [
  "image",
  "end_image_strength",
  "return_last_frame",
  "last_frame_strength",
  "end",
  "last",
  "tail_image_urls",
  "",
  "end_image_url "
];

const input = (name: string, apiName: string) => ({ name, apiName });

describe("selectEndFrameInput", () => {
  it("returns undefined for no inputs", () => {
    expect(selectEndFrameInput([])).toBeUndefined();
  });

  it.each(END_FRAME_NAMES)("accepts %s by declared name", (n) => {
    const i = input(n, "other");
    expect(selectEndFrameInput([input("image", "image"), i])).toBe(i);
  });

  it.each(END_FRAME_NAMES)("accepts %s by API name", (n) => {
    const i = input("Other", n);
    expect(selectEndFrameInput([input("image", "image"), i])).toBe(i);
  });

  it("matches without regard to case", () => {
    const i = input("END_IMAGE", "x");
    expect(selectEndFrameInput([i])).toBe(i);
    const j = input("x", "Tail_Image");
    expect(selectEndFrameInput([j])).toBe(j);
  });

  it.each(NOT_END_FRAME)("rejects %j when both names are non-matching", (n) => {
    expect(selectEndFrameInput([input(n, n)])).toBeUndefined();
  });

  it("returns the first match when several inputs qualify", () => {
    const a = input("tail_image", "a");
    const b = input("end_frame", "b");
    expect(selectEndFrameInput([input("image", "image"), a, b])).toBe(a);
  });

  it.each(END_FRAME_NAMES)(
    "never lets %s win primary image selection over a plain image",
    (n) => {
      for (const count of [1, 2]) {
        const picked = selectPrimaryImageInput(
          [
            { name: n, apiName: n, isList: false },
            { name: "image", apiName: "image", isList: false }
          ] as never,
          count
        );
        expect(picked?.name).toBe("image");
      }
    }
  );
});
