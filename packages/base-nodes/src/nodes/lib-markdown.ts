import { BaseNode, prop } from "@nodetool/node-sdk";

export class ExtractLinksMarkdownLibNode extends BaseNode {
  static readonly nodeType = "lib.markdown.ExtractLinks";
            static readonly title = "Extract Links";
            static readonly description = "Extracts all links from markdown text.\n    markdown, links, extraction\n\n    Use cases:\n    - Extract references and citations from academic documents\n    - Build link graphs from markdown documentation\n    - Analyze external resources referenced in markdown files";
        static readonly metadataOutputTypes = {
    output: "list[dict[str, str]]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "", title: "Markdown", description: "The markdown text to analyze" })
  declare markdown: any;

  @prop({ type: "bool", default: true, title: "Include Titles", description: "Whether to include link titles in output" })
  declare include_titles: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const markdown = String(inputs.markdown ?? this.markdown ?? "");
    const includeTitles = Boolean(inputs.include_titles ?? this.include_titles ?? true);
    const links: Array<Record<string, string>> = [];
    const pattern = /\[([^\]]+)\]\(([^)]+)\)|<([^>]+)>/g;
    for (const match of markdown.matchAll(pattern)) {
      if (match[1] && match[2]) {
        links.push({ url: match[2], title: includeTitles ? match[1] : "" });
      } else if (match[3]) {
        links.push({ url: match[3], title: "" });
      }
    }
    return { output: links };
  }
}

export class ExtractHeadersMarkdownLibNode extends BaseNode {
  static readonly nodeType = "lib.markdown.ExtractHeaders";
            static readonly title = "Extract Headers";
            static readonly description = "Extracts headers and creates a document structure/outline.\n    markdown, headers, structure\n\n    Use cases:\n    - Generate table of contents\n    - Analyze document structure\n    - Extract main topics from documents";
        static readonly metadataOutputTypes = {
    output: "list[dict[str, any]]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "", title: "Markdown", description: "The markdown text to analyze" })
  declare markdown: any;

  @prop({ type: "int", default: 6, title: "Max Level", description: "Maximum header level to extract (1-6)", min: 1, max: 6 })
  declare max_level: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const markdown = String(inputs.markdown ?? this.markdown ?? "");
    const maxLevel = Number(inputs.max_level ?? this.max_level ?? 6);
    const headers: Array<Record<string, unknown>> = [];
    for (const line of markdown.split("\n")) {
      const m = line.match(/^(#{1,6})\s+(.+)$/);
      if (!m) continue;
      const level = m[1].length;
      if (level <= maxLevel) {
        headers.push({ level, text: m[2].trim(), index: headers.length });
      }
    }
    return { output: headers };
  }
}

export class ExtractBulletListsMarkdownLibNode extends BaseNode {
  static readonly nodeType = "lib.markdown.ExtractBulletLists";
            static readonly title = "Extract Bullet Lists";
            static readonly description = "Extracts bulleted lists from markdown.\n    markdown, lists, bullets, extraction\n\n    Use cases:\n    - Extract unordered list items\n    - Analyze bullet point structures\n    - Convert bullet lists to structured data";
        static readonly metadataOutputTypes = {
    output: "list[dict[str, any]]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "", title: "Markdown", description: "The markdown text to analyze" })
  declare markdown: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const markdown = String(inputs.markdown ?? this.markdown ?? "");
    const lists: Array<Array<Record<string, string>>> = [];
    let current: Array<Record<string, string>> = [];

    for (const line of markdown.split("\n")) {
      const m = line.match(/^\s*[-*+]\s+(.+)$/);
      if (m) {
        current.push({ text: m[1].trim() });
      } else if (current.length > 0) {
        lists.push(current);
        current = [];
      }
    }
    if (current.length > 0) lists.push(current);
    return { output: lists };
  }
}

export class ExtractNumberedListsMarkdownLibNode extends BaseNode {
  static readonly nodeType = "lib.markdown.ExtractNumberedLists";
            static readonly title = "Extract Numbered Lists";
            static readonly description = "Extracts numbered lists from markdown.\n    markdown, lists, numbered, extraction\n\n    Use cases:\n    - Extract ordered list items\n    - Analyze enumerated structures\n    - Convert numbered lists to structured data";
        static readonly metadataOutputTypes = {
    output: "list[str]"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "", title: "Markdown", description: "The markdown text to analyze" })
  declare markdown: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const markdown = String(inputs.markdown ?? this.markdown ?? "");
    const lists: string[][] = [];
    let current: string[] = [];

    for (const line of markdown.split("\n")) {
      const m = line.match(/^\s*\d+\.\s+(.+)$/);
      if (m) {
        current.push(m[1].trim());
      } else if (current.length > 0) {
        lists.push(current);
        current = [];
      }
    }
    if (current.length > 0) lists.push(current);
    return { output: lists };
  }
}

export class ExtractCodeBlocksMarkdownLibNode extends BaseNode {
  static readonly nodeType = "lib.markdown.ExtractCodeBlocks";
            static readonly title = "Extract Code Blocks";
            static readonly description = "Extracts code blocks and their languages from markdown.\n    markdown, code, extraction\n\n    Use cases:\n    - Extract code samples for analysis\n    - Collect programming examples\n    - Analyze code snippets in documentation";
        static readonly metadataOutputTypes = {
    output: "list[dict[str, str]]"
  };
  
  @prop({ type: "str", default: "", title: "Markdown", description: "The markdown text to analyze" })
  declare markdown: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const markdown = String(inputs.markdown ?? this.markdown ?? "");
    const blocks: Array<Record<string, string>> = [];
    const pattern = /```(\w*)\n([\s\S]*?)\n```/g;
    for (const match of markdown.matchAll(pattern)) {
      blocks.push({ language: match[1] || "text", code: match[2].trim() });
    }
    return { output: blocks };
  }
}

export class ExtractTablesMarkdownLibNode extends BaseNode {
  static readonly nodeType = "lib.markdown.ExtractTables";
            static readonly title = "Extract Tables";
            static readonly description = "Extracts tables from markdown and converts them to structured data.\n    markdown, tables, data\n\n    Use cases:\n    - Extract tabular data from markdown\n    - Convert markdown tables to structured formats\n    - Analyze tabulated information";
        static readonly metadataOutputTypes = {
    output: "dataframe"
  };
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "", title: "Markdown", description: "The markdown text to analyze" })
  declare markdown: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const markdown = String(inputs.markdown ?? this.markdown ?? "");
    const lines = markdown.split("\n");
    const currentTable: string[][] = [];

    for (const line of lines) {
      if (line.includes("|")) {
        const cells = line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim());
        if (cells.length > 0) {
          currentTable.push(cells);
        }
      } else if (currentTable.length > 0) {
        break;
      }
    }

    if (currentTable.length > 2) {
      const headers = currentTable[0];
      const data = currentTable.slice(2);
      const rows = data.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])));
      return { output: { rows } };
    }

    return { output: { rows: [] as Array<Record<string, unknown>> } };
  }
}

export const LIB_MARKDOWN_NODES = [
  ExtractLinksMarkdownLibNode,
  ExtractHeadersMarkdownLibNode,
  ExtractBulletListsMarkdownLibNode,
  ExtractNumberedListsMarkdownLibNode,
  ExtractCodeBlocksMarkdownLibNode,
  ExtractTablesMarkdownLibNode,
] as const;
