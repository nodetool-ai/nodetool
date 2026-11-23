import { describe, expect, it } from "vitest";
import { ConstantDocumentNode } from "../src/nodes/constant.js";
import { DocumentFileInputNode, DocumentInputNode } from "../src/nodes/input.js";
import { readDocumentText } from "../src/nodes/document-text.js";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function contextWith(files: Record<string, Uint8Array>) {
  const asked: string[] = [];
  return {
    asked,
    resolveAssetBytes: async (reference: string) => {
      asked.push(reference);
      return { bytes: files[reference] ?? null, attempts: [] };
    }
  };
}

describe("document text output", () => {
  it("reads a project document's Markdown by asset id", async () => {
    const context = contextWith({ "asset://doc1": encode("# Notes\n\nHello") });
    const node = new ConstantDocumentNode();
    node.assign({ value: { type: "document", uri: "", asset_id: "doc1", data: null } });
    const result = await node.process(context);
    expect(result.text).toBe("# Notes\n\nHello");
    expect(result.output).toMatchObject({ asset_id: "doc1" });
    expect(context.asked).toEqual(["asset://doc1"]);
  });

  it("gives the input node the same text output", async () => {
    const context = contextWith({ "asset://doc2": encode("plain text") });
    const node = new DocumentInputNode();
    node.assign({ value: { type: "document", uri: "asset://doc2" } });
    const result = await node.process(context);
    expect(result.text).toBe("plain text");
    expect(Object.keys(result).sort()).toEqual(
      Object.keys(DocumentInputNode.metadataOutputTypes).sort()
    );
  });

  it("gives an empty string for a PDF and for no document", async () => {
    const pdf = encode("%PDF-1.7 binary");
    const context = contextWith({ "asset://pdf": pdf });
    expect(await readDocumentText({ asset_id: "pdf" }, context)).toBe("");
    expect(await readDocumentText({ type: "document", uri: "" }, context)).toBe("");
    expect(await readDocumentText(null, context)).toBe("");
  });

  it("decodes inline base64 data", async () => {
    const data = Buffer.from("inline", "utf-8").toString("base64");
    expect(await readDocumentText({ data })).toBe("inline");
  });

  it("fails when a referenced document cannot be read", async () => {
    await expect(readDocumentText({ asset_id: "gone" }, contextWith({}))).rejects.toThrow(
      "Cannot read document asset://gone"
    );
  });
});

describe("DocumentFileInput resolves project paths (R23)", () => {
  const workspace = {
    uri: (path: string) => `workspace://${path}`,
    stat: async (path: string) => (path === "loose.md" ? { isDirectory: false } : null)
  };

  it("names the project's document by asset id", async () => {
    const node = new DocumentFileInputNode();
    node.assign({ value: "notes/plan.md" });
    const result = await node.process({
      workspace,
      findProjectAsset: async (path: string) => (path === "notes/plan.md" ? { id: "a1" } : null)
    });
    expect(result.document).toEqual({ type: "document", uri: "asset://a1", asset_id: "a1" });
  });

  it("uses the workspace URI for a project file with no asset row", async () => {
    const node = new DocumentFileInputNode();
    node.assign({ value: "loose.md" });
    const result = await node.process({ workspace, findProjectAsset: async () => null });
    expect(result.document).toEqual({ type: "document", uri: "workspace://loose.md" });
  });

  it("keeps a host path as a file:// reference", async () => {
    const node = new DocumentFileInputNode();
    node.assign({ value: "/tmp/report.pdf" });
    const result = await node.process({ workspace, findProjectAsset: async () => ({ id: "x" }) });
    expect(result.document).toEqual({ type: "document", uri: "file:///tmp/report.pdf" });
  });
});
