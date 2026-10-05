import { describe, it, expect, vi } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { supportsPlatform } from "@nodetool-ai/protocol";
import { PreviewNode } from "../src/nodes/preview.js";

describe("PreviewNode reactive browser eligibility", () => {
  it("declares read-only browser support and displays its input", async () => {
    const metadata = getNodeMetadata(PreviewNode);
    expect(metadata.effect).toBe("read");
    expect(supportsPlatform(metadata.platforms, "browser")).toBe(true);
    const node = new PreviewNode();
    node.assign({ value: "browser preview" });
    await expect(node.process()).resolves.toEqual({ output: "browser preview" });
  });

  it("reads the processing context to normalize the displayed value", async () => {
    const context = new ProcessingContext({});
    const normalize = vi.spyOn(context, "normalizeOutputValue").mockResolvedValue("normalized preview");
    const node = new PreviewNode();
    node.assign({ value: "input preview" });
    await expect(node.process(context)).resolves.toEqual({ output: "normalized preview" });
    expect(normalize).toHaveBeenCalledExactlyOnceWith("input preview");
  });
});
