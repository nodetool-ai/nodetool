/**
 * § 7.7.9: `Add your own style` creates a user-owned copy, and the preset it
 * was started from never changes.
 */

import {
  MAX_STYLE_REFERENCES,
  buildStyleDescriptorContent,
  buildUserStyle
} from "../userStyle";

describe("buildUserStyle", () => {
  it("leaves the preset it copies from untouched", () => {
    const preset = Object.freeze({
      name: "Noir",
      descriptor: "High-contrast black and white, hard key, deep shadow."
    });
    const before = { ...preset };

    const draft = buildUserStyle(
      { name: "", descriptor: "Warm 16mm grain, soft halation, muted greens." },
      preset
    );

    expect(preset).toEqual(before);
    expect(draft).toEqual({
      name: "Noir (yours)",
      descriptor: "Warm 16mm grain, soft halation, muted greens."
    });
  });

  it("keeps the name the model wrote", () => {
    expect(
      buildUserStyle({ name: " Sun-bleached Super 8 ", descriptor: "Grainy." })
    ).toEqual({ name: "Sun-bleached Super 8", descriptor: "Grainy." });
  });

  it("names an unnamed style with no preset behind it", () => {
    expect(buildUserStyle({ descriptor: "Grainy." })?.name).toBe("My style");
  });

  it("refuses an answer with no descriptor", () => {
    expect(buildUserStyle({ name: "Nice", descriptor: "  " })).toBeNull();
  });
});

describe("buildStyleDescriptorContent", () => {
  it("sends the instruction and one block per reference", () => {
    const content = buildStyleDescriptorContent([
      "data:image/png;base64,AAA",
      "data:image/png;base64,BBB"
    ]);
    expect(content[0]).toEqual(
      expect.objectContaining({ type: "text" })
    );
    expect(content.slice(1)).toEqual([
      { type: "image_url", image: { type: "image", uri: "data:image/png;base64,AAA" } },
      { type: "image_url", image: { type: "image", uri: "data:image/png;base64,BBB" } }
    ]);
  });

  it("never sends more references than the step accepts", () => {
    const content = buildStyleDescriptorContent(
      Array.from({ length: 5 }, (_, i) => `data:image/png;base64,${i}`)
    );
    expect(content).toHaveLength(MAX_STYLE_REFERENCES + 1);
  });
});
