import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

export class ConvertToMarkdownLibNode extends BaseNode {
  static readonly nodeType = "lib.convert.ConvertToMarkdown";
  static readonly title = "Convert To Markdown";
  static readonly description =
    "Converts various document formats to markdown using MarkItDown.\n    markdown, convert, document\n\n    Use cases:\n    - Convert Word documents to markdown\n    - Convert Excel files to markdown tables\n    - Convert PowerPoint to markdown content";
  static readonly metadataOutputTypes = {
    output: "document"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "document",
    default: {
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Document",
    description: "The document to convert to markdown"
  })
  declare document: any;

  async process(): Promise<Record<string, unknown>> {
    const doc = (this.document ?? {}) as Record<string, unknown>;
    const uri = String(doc.uri ?? "");
    const data = doc.data ? String(doc.data) : "";

    if (!uri && !data) {
      throw new Error("A document URI or data is required");
    }

    const TurndownService = (await import("turndown")).default;
    const turndown = new TurndownService();

    // If it looks like a DOCX (binary data or .docx URI), try mammoth
    const isDocx = uri.toLowerCase().endsWith(".docx");

    if (isDocx && uri) {
      // Try to convert via mammoth from file path
      const mammoth = await import("mammoth");
      let filePath = uri;
      if (filePath.startsWith("file://")) {
        filePath = decodeURIComponent(new URL(filePath).pathname);
      }
      const result = await mammoth.convertToHtml({ path: filePath });
      const markdown = turndown.turndown(result.value);
      return { output: { type: "document", uri, data: markdown } };
    }

    if (data) {
      // If data contains HTML tags, convert HTML to markdown
      if (data.includes("<") && data.includes(">")) {
        const markdown = turndown.turndown(data);
        return { output: { type: "document", uri, data: markdown } };
      }
      // Already plain text, return as-is
      return { output: { type: "document", uri, data } };
    }

    // Fallback: try to read from URI as HTML
    if (uri) {
      let filePath = uri;
      if (filePath.startsWith("file://")) {
        filePath = decodeURIComponent(new URL(filePath).pathname);
      }
      const fs = await import("node:fs/promises");
      const content = await fs.readFile(filePath, "utf-8");
      if (content.includes("<") && content.includes(">")) {
        const markdown = turndown.turndown(content);
        return { output: { type: "document", uri, data: markdown } };
      }
      return { output: { type: "document", uri, data: content } };
    }

    throw new Error("Could not process document");
  }
}

export const LIB_MARKITDOWN_NODES: readonly NodeClass[] = [
  ConvertToMarkdownLibNode
] as const;
