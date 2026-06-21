import { describe, expect, it } from "vitest";
import { supportsPlatform } from "@nodetool-ai/protocol";

import { LIB_PDF_NODES } from "@nodetool-ai/document-nodes";

describe("lib.pdf platform tags", () => {
  it("every PDF node (native pdfium/sharp + subprocess) is node-only", () => {
    expect(LIB_PDF_NODES.length).toBeGreaterThan(0);
    for (const NodeClass of LIB_PDF_NODES) {
      expect(supportsPlatform(NodeClass.platforms, "node")).toBe(true);
      expect(supportsPlatform(NodeClass.platforms, "workers")).toBe(false);
      expect(supportsPlatform(NodeClass.platforms, "edge")).toBe(false);
    }
  });
});
