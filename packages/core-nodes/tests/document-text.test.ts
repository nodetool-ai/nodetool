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

  it("converts PDF bytes to Markdown on DocumentInput while ConstantDocument keeps binary empty", async () => {
    const pdf = encode("%PDF-1.7 binary");
    const calls: Array<{ filename?: string | null; contentType?: string | null }> = [];
    const context = {
      ...contextWith({ "asset://pdf": pdf }),
      getAssetInfo: async () => ({ name: "report.pdf", content_type: "application/pdf" }),
      convertDocumentToMarkdown: async (args: {
        bytes: Uint8Array;
        filename?: string | null;
        contentType?: string | null;
      }) => {
        calls.push({ filename: args.filename, contentType: args.contentType });
        return "# Report\n\nExtracted text.\n";
      }
    };

    const inputNode = new DocumentInputNode();
    inputNode.assign({ value: { type: "document", uri: "asset://pdf", asset_id: "pdf" } });
    const inputResult = await inputNode.process(context);
    expect(inputResult.text).toBe("# Report\n\nExtracted text.\n");
    expect(inputResult.output).toMatchObject({
      type: "document",
      uri: "asset://pdf",
      asset_id: "pdf",
      data: null,
      text: "# Report\n\nExtracted text.\n"
    });
    expect(calls).toEqual([{ filename: "report.pdf", contentType: "application/pdf" }]);

    const constantNode = new ConstantDocumentNode();
    constantNode.assign({ value: { type: "document", uri: "asset://pdf", asset_id: "pdf" } });
    const constantResult = await constantNode.process(context);
    expect(constantResult.text).toBe("");
  });

  it("converts HTML assets and data URIs on DocumentInput", async () => {
    const htmlBytes = encode("<h1>Brief</h1><p>Ship <strong>it</strong>.</p>");
    const calls: Array<{ filename?: string | null; contentType?: string | null }> = [];
    const context = {
      ...contextWith({ "asset://html1": htmlBytes }),
      getAssetInfo: async () => ({ name: "brief.html", content_type: "text/html" }),
      convertDocumentToMarkdown: async (args: {
        bytes: Uint8Array;
        filename?: string | null;
        contentType?: string | null;
      }) => {
        calls.push({ filename: args.filename, contentType: args.contentType });
        return "# Brief\n\nShip **it**.\n";
      }
    };

    const assetNode = new DocumentInputNode();
    assetNode.assign({ value: { type: "document", uri: "asset://html1", asset_id: "html1" } });
    const assetResult = await assetNode.process(context);
    expect(assetResult.text).toBe("# Brief\n\nShip **it**.\n");
    expect(assetResult.output).toMatchObject({ text: "# Brief\n\nShip **it**.\n", data: null });

    const dataUriNode = new DocumentInputNode();
    const encodedHtml = Buffer.from("<h1>Inline</h1>").toString("base64");
    dataUriNode.assign({
      value: { type: "document", uri: `data:text/html;base64,${encodedHtml}` }
    });
    const dataUriResult = await dataUriNode.process(context);
    expect(dataUriResult.text).toBe("# Brief\n\nShip **it**.\n");
    expect(calls).toEqual([
      { filename: "brief.html", contentType: "text/html" },
      { filename: null, contentType: "text/html" }
    ]);
  });

  it("passes plain UTF-8 formats like CSV and Markdown through DocumentInput without conversion", async () => {
    let converted = 0;
    const context = {
      ...contextWith({ "asset://catalog": encode("sku,name\n1,Lamp\n") }),
      getAssetInfo: async () => ({ name: "products.csv", content_type: "text/csv" }),
      convertDocumentToMarkdown: async () => {
        converted += 1;
        return "should not run";
      }
    };
    const node = new DocumentInputNode();
    node.assign({ value: { type: "document", uri: "asset://catalog", asset_id: "catalog" } });
    const result = await node.process(context);
    expect(result.text).toBe("sku,name\n1,Lamp\n");
    expect(converted).toBe(0);
  });

  it("falls back to empty text on DocumentInput when no converter matches a binary file", async () => {
    const context = {
      ...contextWith({ "asset://bin": encode("%PDF-1.7 binary") }),
      convertDocumentToMarkdown: async () => null
    };
    const node = new DocumentInputNode();
    node.assign({ value: { type: "document", uri: "asset://bin", asset_id: "bin" } });
    const result = await node.process(context);
    expect(result.text).toBe("");
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
