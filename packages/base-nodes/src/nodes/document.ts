import { BaseNode, prop } from "@nodetool/node-sdk";
import { promises as fs } from "node:fs";
import path from "node:path";

type DocumentRefLike = {
  uri?: string;
  data?: Uint8Array | string;
  text?: string;
};

function documentSourceId(refOrPath: unknown): string {
  if (typeof refOrPath === "string" && refOrPath) {
    return refOrPath;
  }
  if (refOrPath && typeof refOrPath === "object") {
    const ref = refOrPath as DocumentRefLike;
    if (typeof ref.uri === "string" && ref.uri) return ref.uri;
  }
  return "document";
}

function asBytes(data: Uint8Array | string | undefined): Uint8Array {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  return Uint8Array.from(Buffer.from(data, "base64"));
}

function toFilePath(uriOrPath: string): string {
  if (uriOrPath.startsWith("file://")) {
    return uriOrPath.slice("file://".length);
  }
  return uriOrPath;
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
}

function textChunk(
  text: string,
  sourceId: string,
  startIndex: number
): Record<string, unknown> {
  return {
    chunk: text,
    text,
    source_id: sourceId,
    start_index: startIndex
  };
}

function splitByChunk(
  text: string,
  chunkSize: number,
  overlap: number
): string[] {
  if (!text) return [];
  const size = Math.max(1, chunkSize);
  const step = Math.max(1, size - Math.max(0, overlap));
  const out: string[] = [];
  for (let i = 0; i < text.length; i += step) {
    out.push(text.slice(i, i + size));
    if (i + size >= text.length) break;
  }
  return out;
}

async function readDocumentText(refOrPath: unknown): Promise<string> {
  if (typeof refOrPath === "string" && refOrPath) {
    return fs.readFile(toFilePath(refOrPath), "utf8");
  }
  if (refOrPath && typeof refOrPath === "object") {
    const ref = refOrPath as DocumentRefLike;
    if (typeof ref.text === "string") return ref.text;
    if (ref.data) {
      const bytes = asBytes(ref.data);
      return Buffer.from(bytes).toString("utf8");
    }
    if (typeof ref.uri === "string" && ref.uri) {
      return fs.readFile(toFilePath(ref.uri), "utf8");
    }
  }
  return "";
}

export class LoadDocumentFileNode extends BaseNode {
  static readonly nodeType = "nodetool.document.LoadDocumentFile";
  static readonly title = "Load Document File";
  static readonly description =
    "Read a document from disk.\n    files, document, read, input, load, file";
  static readonly metadataOutputTypes = {
    output: "document"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to the document to read"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = String(this.path ?? this.path ?? "");
    const full = toFilePath(p);
    const bytes = new Uint8Array(await fs.readFile(full));
    return {
      output: {
        uri: `file://${full}`,
        data: Buffer.from(bytes).toString("base64")
      }
    };
  }
}

export class SaveDocumentFileNode extends BaseNode {
  static readonly nodeType = "nodetool.document.SaveDocumentFile";
  static readonly title = "Save Document File";
  static readonly description =
    "Write a document to disk.\n    files, document, write, output, save, file\n\n    The filename can include time and date variables:\n    %Y - Year, %m - Month, %d - Day\n    %H - Hour, %M - Minute, %S - Second";

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
    description: "The document to save"
  })
  declare document: any;

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder where the file will be saved"
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "",
    title: "Filename",
    description: "Name of the file to save. Supports strftime format codes."
  })
  declare filename: any;

  async process(): Promise<Record<string, unknown>> {
    const document = (this.document ?? this.document ?? {}) as DocumentRefLike;
    const p = String((this as any).path ?? "");
    const full = toFilePath(p);
    await fs.mkdir(path.dirname(full), { recursive: true });
    if (document.data) {
      await fs.writeFile(full, asBytes(document.data));
    } else if (typeof document.text === "string") {
      await fs.writeFile(full, document.text, "utf8");
    } else if (document.uri) {
      await fs.copyFile(toFilePath(document.uri), full);
    } else {
      await fs.writeFile(full, "", "utf8");
    }
    return { output: full };
  }
}

export class ListDocumentsNode extends BaseNode {
  static readonly nodeType = "nodetool.document.ListDocuments";
  static readonly title = "List Documents";
  static readonly description =
    "List documents in a directory.\n    files, list, directory";
  static readonly metadataOutputTypes = {
    document: "document"
  };

  static readonly isStreamingOutput = true;
  @prop({
    type: "str",
    default: "~",
    title: "Folder",
    description: "Directory to scan"
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "*",
    title: "Pattern",
    description: "File pattern to match (e.g. *.txt)"
  })
  declare pattern: any;

  @prop({
    type: "bool",
    default: false,
    title: "Recursive",
    description: "Search subdirectories"
  })
  declare recursive: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const folder = String(this.folder ?? this.folder ?? ".");
    const pattern = String(this.pattern ?? this.pattern ?? "*");
    const recursive = Boolean(this.recursive ?? this.recursive ?? false);
    const allowed = new Set([
      ".txt",
      ".md",
      ".markdown",
      ".json",
      ".html",
      ".pdf",
      ".docx"
    ]);
    const matches = wildcardToRegExp(pattern);
    const visit = async function* (dir: string): AsyncGenerator<string> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (recursive) {
            yield* visit(full);
          }
          continue;
        }
        yield full;
      }
    };
    for await (const full of visit(folder)) {
      if (
        allowed.has(path.extname(full).toLowerCase()) &&
        matches.test(path.basename(full))
      ) {
        yield { document: { uri: `file://${full}` } };
      }
    }
  }
}

export class SplitDocumentNode extends BaseNode {
  static readonly nodeType = "nodetool.document.SplitDocument";
  static readonly title = "Split Document";
  static readonly description =
    "Split text semantically.\n    chroma, embedding, collection, RAG, index, text, markdown, semantic";
  static readonly metadataOutputTypes = {
    text: "str",
    source_id: "str",
    start_index: "int"
  };
  static readonly recommendedModels = [
    {
      id: "embeddinggemma",
      type: "embedding_model",
      name: "Embedding Gemma",
      repo_id: "embeddinggemma",
      description: "Embedding model for semantic splitting"
    },
    {
      id: "nomic-embed-text",
      type: "embedding_model",
      name: "Nomic Embed Text",
      repo_id: "nomic-embed-text",
      description: "Embedding model for semantic splitting"
    },
    {
      id: "mxbai-embed-large",
      type: "embedding_model",
      name: "MXBai Embed Large",
      repo_id: "mxbai-embed-large",
      description: "Embedding model for semantic splitting"
    },
    {
      id: "bge-m3",
      type: "embedding_model",
      name: "BGE M3",
      repo_id: "bge-m3",
      description: "Embedding model for semantic splitting"
    },
    {
      id: "all-minilm",
      type: "embedding_model",
      name: "All Minilm",
      repo_id: "all-minilm",
      description: "Embedding model for semantic splitting"
    }
  ];

  static readonly isStreamingOutput = true;
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "ollama",
      id: "embeddinggemma",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Embed Model",
    description: "Embedding model to use"
  })
  declare embed_model: any;

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
    description: "Document ID to associate with the text content"
  })
  declare document: any;

  @prop({
    type: "int",
    default: 1,
    title: "Buffer Size",
    description: "Buffer size for semantic splitting",
    min: 1,
    max: 100
  })
  declare buffer_size: any;

  @prop({
    type: "int",
    default: 95,
    title: "Threshold",
    description: "Breakpoint percentile threshold for semantic splitting",
    min: 0,
    max: 100
  })
  declare threshold: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const document = this.document ?? this.document;
    const text = await readDocumentText(document);
    const sourceId = documentSourceId(document);
    const chunkSize = Number((this as any).chunk_size ?? 1200);
    const overlap = Number((this as any).chunk_overlap ?? 100);
    let startIndex = 0;
    for (const chunk of splitByChunk(text, chunkSize, overlap)) {
      const idx = text.indexOf(chunk, startIndex);
      const resolvedIndex = idx >= 0 ? idx : startIndex;
      yield textChunk(chunk, sourceId, resolvedIndex);
      startIndex = resolvedIndex + Math.max(chunk.length - overlap, 1);
    }
  }
}

export class SplitHTMLNode extends BaseNode {
  static readonly nodeType = "nodetool.document.SplitHTML";
  static readonly title = "Split HTML";
  static readonly description =
    "Split HTML content into semantic chunks based on HTML tags.\n    html, text, semantic, tags, parsing";
  static readonly metadataOutputTypes = {
    text: "str",
    source_id: "str",
    start_index: "int"
  };

  static readonly isStreamingOutput = true;
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
    description: "Document ID to associate with the HTML content"
  })
  declare document: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const document = this.document ?? this.document;
    const html = await readDocumentText(document);
    const sourceId = documentSourceId(document);
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const chunkSize = Number((this as any).chunk_size ?? 1200);
    const overlap = Number((this as any).chunk_overlap ?? 100);
    let startIndex = 0;
    for (const chunk of splitByChunk(text, chunkSize, overlap)) {
      const idx = text.indexOf(chunk, startIndex);
      const resolvedIndex = idx >= 0 ? idx : startIndex;
      yield textChunk(chunk, sourceId, resolvedIndex);
      startIndex = resolvedIndex + Math.max(chunk.length - overlap, 1);
    }
  }
}

export class SplitJSONNode extends BaseNode {
  static readonly nodeType = "nodetool.document.SplitJSON";
  static readonly title = "Split JSON";
  static readonly description =
    "Split JSON content into semantic chunks.\n    json, parsing, semantic, structured";
  static readonly metadataOutputTypes = {
    text: "str",
    source_id: "str",
    start_index: "int"
  };

  static readonly isStreamingOutput = true;
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
    description: "Document ID to associate with the JSON content"
  })
  declare document: any;

  @prop({
    type: "bool",
    default: true,
    title: "Include Metadata",
    description: "Whether to include metadata in nodes"
  })
  declare include_metadata: any;

  @prop({
    type: "bool",
    default: true,
    title: "Include Prev Next Rel",
    description: "Whether to include prev/next relationships"
  })
  declare include_prev_next_rel: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const document = this.document ?? this.document;
    const raw = await readDocumentText(document);
    const sourceId = documentSourceId(document);
    let rendered: string;
    try {
      rendered = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      rendered = raw;
    }
    const chunkSize = Number((this as any).chunk_size ?? 1200);
    const overlap = Number((this as any).chunk_overlap ?? 100);
    let startIndex = 0;
    for (const chunk of splitByChunk(rendered, chunkSize, overlap)) {
      const idx = rendered.indexOf(chunk, startIndex);
      const resolvedIndex = idx >= 0 ? idx : startIndex;
      yield textChunk(chunk, sourceId, resolvedIndex);
      startIndex = resolvedIndex + Math.max(chunk.length - overlap, 1);
    }
  }
}

export class SplitRecursivelyNode extends BaseNode {
  static readonly nodeType = "nodetool.document.SplitRecursively";
  static readonly title = "Split Recursively";
  static readonly description =
    "Splits text recursively using LangChain's RecursiveCharacterTextSplitter.\n    text, split, chunks\n\n    Use cases:\n    - Splitting documents while preserving semantic relationships\n    - Creating chunks for language model processing\n    - Handling text in languages with/without word boundaries";
  static readonly metadataOutputTypes = {
    text: "str",
    source_id: "str",
    start_index: "int"
  };

  static readonly isStreamingOutput = true;
  @prop({
    type: "document",
    default: {
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Document"
  })
  declare document: any;

  @prop({
    type: "int",
    default: 1000,
    title: "Chunk Size",
    description: "Maximum size of each chunk in characters"
  })
  declare chunk_size: any;

  @prop({
    type: "int",
    default: 200,
    title: "Chunk Overlap",
    description: "Number of characters to overlap between chunks"
  })
  declare chunk_overlap: any;

  @prop({
    type: "list[str]",
    default: ["\n\n", "\n", "."],
    title: "Separators",
    description:
      "List of separators to use for splitting, in order of preference"
  })
  declare separators: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const document = this.document ?? this.document;
    const text = await readDocumentText(document);
    const sourceId = documentSourceId(document);
    const chunkSize = Number(
      (this as any).chunk_size ?? (this as any).chunk_size ?? 1200
    );
    const overlap = Number(
      (this as any).chunk_overlap ?? (this as any).chunk_overlap ?? 100
    );
    const separators = Array.isArray(this.separators ?? this.separators)
      ? ((this.separators ?? this.separators) as unknown[]).map((s) =>
          String(s)
        )
      : ["\n\n", "\n", "."];

    const activeSeparator = separators.find(
      (separator) => separator && text.includes(separator)
    );
    if (activeSeparator) {
      const parts: Array<{ text: string; start: number }> = [];
      let cursor = 0;
      if (activeSeparator === "\n") {
        const rawParts = text.split("\n");
        rawParts.forEach((part, index) => {
          const prefix = index === 0 ? "" : "\n";
          const value = `${prefix}${part}`;
          if (value) {
            parts.push({
              text: value,
              start: index === 0 ? cursor : cursor - 1
            });
          }
          cursor += part.length + 1;
        });
      } else {
        for (const part of text.split(activeSeparator)) {
          if (!part) {
            cursor += activeSeparator.length;
            continue;
          }
          parts.push({ text: part, start: cursor });
          cursor += part.length + activeSeparator.length;
        }
      }

      for (const part of parts) {
        yield textChunk(
          part.text,
          `${sourceId}:${parts.indexOf(part)}`,
          part.start
        );
      }
      return;
    }

    let startIndex = 0;
    for (const chunk of splitByChunk(text, chunkSize, overlap)) {
      const idx = text.indexOf(chunk, startIndex);
      const resolvedIndex = idx >= 0 ? idx : startIndex;
      yield textChunk(
        chunk,
        `${sourceId}:${Math.floor(resolvedIndex / Math.max(chunkSize - overlap, 1))}`,
        resolvedIndex
      );
      startIndex = resolvedIndex + Math.max(chunk.length - overlap, 1);
    }
  }
}

export class SplitMarkdownNode extends BaseNode {
  static readonly nodeType = "nodetool.document.SplitMarkdown";
  static readonly title = "Split Markdown";
  static readonly description =
    "Splits markdown text by headers while preserving header hierarchy in metadata.\n    markdown, split, headers\n\n    Use cases:\n    - Splitting markdown documentation while preserving structure\n    - Processing markdown files for semantic search\n    - Creating context-aware chunks from markdown content";
  static readonly metadataOutputTypes = {
    text: "str",
    source_id: "str",
    start_index: "int"
  };

  static readonly isStreamingOutput = true;
  @prop({
    type: "document",
    default: {
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Document"
  })
  declare document: any;

  @prop({
    type: "list[tuple[str, str]]",
    default: [
      ["#", "Header 1"],
      ["##", "Header 2"],
      ["###", "Header 3"]
    ],
    title: "Headers To Split On",
    description: "List of tuples containing (header_symbol, header_name)"
  })
  declare headers_to_split_on: any;

  @prop({
    type: "bool",
    default: true,
    title: "Strip Headers",
    description: "Whether to remove headers from the output content"
  })
  declare strip_headers: any;

  @prop({
    type: "bool",
    default: false,
    title: "Return Each Line",
    description:
      "Whether to split into individual lines instead of header sections"
  })
  declare return_each_line: any;

  @prop({
    type: "int",
    default: 1000,
    title: "Chunk Size",
    description: "Optional maximum chunk size for further splitting"
  })
  declare chunk_size: any;

  @prop({
    type: "int",
    default: 30,
    title: "Chunk Overlap",
    description: "Overlap size when using chunk_size"
  })
  declare chunk_overlap: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const document = this.document ?? this.document;
    const markdown = await readDocumentText(document);
    const sourceId = documentSourceId(document);
    const stripHeaders = Boolean(
      this.strip_headers ?? this.strip_headers ?? true
    );
    const chunkSize = Number(
      (this as any).chunk_size ?? (this as any).chunk_size ?? 1200
    );
    const overlap = Number(
      (this as any).chunk_overlap ?? (this as any).chunk_overlap ?? 30
    );

    const sections: string[] = [];
    let current: string[] = [];
    for (const line of markdown.split("\n")) {
      if (line.trim().startsWith("#")) {
        if (current.length) sections.push(current.join("\n").trim());
        current = stripHeaders ? [] : [line];
        continue;
      }
      current.push(line);
    }
    if (current.length) sections.push(current.join("\n").trim());

    if (sections.length > 0) {
      for (const section of sections.filter(Boolean)) {
        const sectionChunks = splitByChunk(section, chunkSize, overlap);
        let sectionStart = 0;
        for (const chunk of sectionChunks) {
          const idx = section.indexOf(chunk, sectionStart);
          const resolvedIndex = idx >= 0 ? idx : sectionStart;
          yield textChunk(chunk, sourceId, resolvedIndex);
          sectionStart = resolvedIndex + Math.max(chunk.length - overlap, 1);
        }
      }
      return;
    }

    let startIndex = 0;
    for (const chunk of splitByChunk(markdown, chunkSize, overlap)) {
      const idx = markdown.indexOf(chunk, startIndex);
      const resolvedIndex = idx >= 0 ? idx : startIndex;
      yield textChunk(chunk, sourceId, resolvedIndex);
      startIndex = resolvedIndex + Math.max(chunk.length - overlap, 1);
    }
  }
}

export const DOCUMENT_NODES = [
  LoadDocumentFileNode,
  SaveDocumentFileNode,
  ListDocumentsNode,
  SplitDocumentNode,
  SplitHTMLNode,
  SplitJSONNode,
  SplitRecursivelyNode,
  SplitMarkdownNode
] as const;
