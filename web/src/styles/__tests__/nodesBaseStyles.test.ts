/**
 * @jest-environment node
 */
import fs from "node:fs";
import path from "node:path";

describe("nodes.base.css", () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, "../nodes.base.css"),
    "utf8"
  );

  it("clips vertical node content overflow without clipping side handles", () => {
    expect(css).toContain("overflow-x: visible;");
    expect(css).toContain("overflow-y: clip;");
  });

  it("keeps a hidden-overflow fallback for browsers without overflow-y clip", () => {
    expect(css).toContain("@supports not (overflow-y: clip)");
    expect(css).toContain("overflow-y: hidden;");
  });
});
