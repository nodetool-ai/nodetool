import { describe, expect, it } from "vitest";
import { supportsPlatform } from "@nodetool-ai/protocol";

import { SVGToImageLibNode, DocumentLibNode } from "@nodetool-ai/text-nodes";

describe("lib.svg platform tags", () => {
  it("SVGToImage (native sharp) does not support workers/edge", () => {
    expect(supportsPlatform(SVGToImageLibNode.platforms, "node")).toBe(true);
    expect(supportsPlatform(SVGToImageLibNode.platforms, "workers")).toBe(
      false
    );
    expect(supportsPlatform(SVGToImageLibNode.platforms, "edge")).toBe(false);
  });

  it("Document (pure SVG-string generator) still supports workers/edge", () => {
    expect(supportsPlatform(DocumentLibNode.platforms, "node")).toBe(true);
    expect(supportsPlatform(DocumentLibNode.platforms, "workers")).toBe(true);
    expect(supportsPlatform(DocumentLibNode.platforms, "edge")).toBe(true);
  });
});
