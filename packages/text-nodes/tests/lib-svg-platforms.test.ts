import { describe, expect, it } from "vitest";
import { supportsPlatform } from "@nodetool-ai/protocol";

import { SVGToImageLibNode, RectLibNode } from "@nodetool-ai/text-nodes";

describe("lib.svg platform tags", () => {
  it("SVGToImage (native sharp) does not support workers/edge", () => {
    expect(supportsPlatform(SVGToImageLibNode.platforms, "node")).toBe(true);
    expect(supportsPlatform(SVGToImageLibNode.platforms, "workers")).toBe(
      false
    );
    expect(supportsPlatform(SVGToImageLibNode.platforms, "edge")).toBe(false);
  });

  it("Rect (pure SVG-string generator) still supports workers/edge", () => {
    expect(supportsPlatform(RectLibNode.platforms, "node")).toBe(true);
    expect(supportsPlatform(RectLibNode.platforms, "workers")).toBe(true);
    expect(supportsPlatform(RectLibNode.platforms, "edge")).toBe(true);
  });
});
