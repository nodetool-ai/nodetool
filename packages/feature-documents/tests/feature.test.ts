import { describe, expect, it, vi } from "vitest";
import { createCoreExecutionHost } from "@nodetool-ai/nodes-core";
import { configureFeatures } from "@nodetool-ai/server-features";
import { feature } from "../src/index.js";

vi.mock("@nodetool-ai/document-processing", () => ({ parsePdfBuffer: vi.fn(async () => ({ pages: [{ text: "first" }, { text: "second" }, { text: "third" }] })) }));

describe("optional document execution", () => {
  it("adds the existing PDF node and resolves the owner's stored asset through the host", async () => {
    const execution = createCoreExecutionHost();
    const reference = { type: "document", asset_id: "a".repeat(32) };
    const graph = { nodes: [{ id: "pdf", type: "lib.pdf.ExtractText", properties: { pdf: reference, start_page: 1, end_page: 1 } }], edges: [] };
    expect(execution.validate(graph)[0]?.code).toBe("UNKNOWN_NODE_TYPE");
    const readAsset = vi.fn(async () => new Uint8Array([37, 80, 68, 70]));
    const features = await configureFeatures([{ id: "document", load: async () => feature }], { execution, readAsset });
    expect(execution.validate(graph)).toEqual([]);
    const outputs = await execution.run({ graph, userId: "owner", jobId: "job", signal: new AbortController().signal, emit: () => undefined });
    expect(Object.values(outputs).flat()).toContain("second");
    expect(readAsset).toHaveBeenCalledWith("owner", reference);
    expect(features.capabilities).toContain("documents:pdf-text");
    await features.close();
  });

  it("propagates denied asset access without parsing another tenant's data", async () => {
    const execution = createCoreExecutionHost();
    const readAsset = vi.fn(async () => { throw new Error("Asset not found"); });
    await feature.activate({ execution, readAsset });
    await expect(execution.run({ graph: { nodes: [{ id: "pdf", type: "lib.pdf.ExtractText", properties: { pdf: { asset_id: "a".repeat(32) } } }], edges: [] }, userId: "other", jobId: "job", signal: new AbortController().signal, emit: () => undefined })).rejects.toThrow("Asset not found");
  });
});
