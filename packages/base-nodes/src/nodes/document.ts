import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
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

async function readDocumentText(refOrPath: unknown, context?: ProcessingContext): Promise<string> {
  if (typeof refOrPath === "string" && refOrPath) {
    if (context?.storage) {
      const stored = await context.storage.retrieve(refOrPath);
      if (stored !== null) return Buffer.from(stored).toString("utf8");
    }
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
      if (context?.storage) {
        const stored = await context.storage.retrieve(ref.uri);
        if (stored !== null) return Buffer.from(stored).toString("utf8");
      }
      if (ref.uri.startsWith("file://") || !ref.uri.startsWith("http")) {
        return fs.readFile(toFilePath(ref.uri), "utf8");
      }
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
    document: "document",
    documents: "list"
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
    const collected: Record<string, unknown>[] = [];
    for await (const item of this._listDocuments()) {
      collected.push(item.document as Record<string, unknown>);
    }
    return {
      document: collected[0] ?? { uri: "" },
      documents: collected
    };
  }

  private async *_listDocuments(): AsyncGenerator<{ document: { uri: string } }> {
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

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const collected: Record<string, unknown>[] = [];
    for await (const item of this._listDocuments()) {
      collected.push(item.document as Record<string, unknown>);
      yield { document: item.document };
    }
    yield { documents: collected };
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
    start_index: "int",
    chunks: "list"
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const collected: Record<string, unknown>[] = [];
    for await (const item of this.genProcess(context)) {
      if ("chunks" in item) continue;
      collected.push(item);
    }
    return {
      text: collected[0]?.text ?? "",
      source_id: collected[0]?.source_id ?? "",
      start_index: collected[0]?.start_index ?? 0,
      chunks: collected
    };
  }

  async *genProcess(context?: ProcessingContext): AsyncGenerator<Record<string, unknown>> {
    const document = this.document ?? this.document;
    const text = await readDocumentText(document, context);
    const sourceId = documentSourceId(document);
    const chunkSize = Number((this as any).chunk_size ?? 1200);
    const overlap = Number((this as any).chunk_overlap ?? 100);
    const collected: Record<string, unknown>[] = [];
    let startIndex = 0;
    for (const chunk of splitByChunk(text, chunkSize, overlap)) {
      const idx = text.indexOf(chunk, startIndex);
      const resolvedIndex = idx >= 0 ? idx : startIndex;
      const item = textChunk(chunk, sourceId, resolvedIndex);
      collected.push(item);
      yield item;
      startIndex = resolvedIndex + Math.max(chunk.length - overlap, 1);
    }
    yield { chunks: collected };
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
    start_index: "int",
    chunks: "list"
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const collected: Record<string, unknown>[] = [];
    for await (const item of this.genProcess(context)) {
      if ("chunks" in item) continue;
      collected.push(item);
    }
    return {
      text: collected[0]?.text ?? "",
      source_id: collected[0]?.source_id ?? "",
      start_index: collected[0]?.start_index ?? 0,
      chunks: collected
    };
  }

  async *genProcess(context?: ProcessingContext): AsyncGenerator<Record<string, unknown>> {
    const document = this.document ?? this.document;
    const html = await readDocumentText(document, context);
    const sourceId = documentSourceId(document);
    const chunkSize = Number((this as any).chunk_size ?? 1200);
    const overlap = Number((this as any).chunk_overlap ?? 100);

    // Split on block-level HTML tags
    const blockTags = "p|div|h[1-6]|li|section|article|blockquote|tr|pre|header|footer|nav|main|aside";
    const blockPattern = new RegExp(
      `<(?:${blockTags})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:${blockTags})>`,
      "gi"
    );

    const sections: string[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = blockPattern.exec(html)) !== null) {
      // Capture any text between block elements
      if (match.index > lastIndex) {
        const between = html
          .slice(lastIndex, match.index)
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (between) sections.push(between);
      }
      // Extract text content from the block element
      const content = match[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (content) sections.push(content);
      lastIndex = match.index + match[0].length;
    }

    // Any remaining text after the last block element
    if (lastIndex < html.length) {
      const remaining = html
        .slice(lastIndex)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (remaining) sections.push(remaining);
    }

    // If no block elements found, fall back to stripping all tags
    if (sections.length === 0) {
      const text = html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) sections.push(text);
    }

    // Merge small sections and split large ones respecting chunk_size
    const collected: Record<string, unknown>[] = [];
    let startIndex = 0;
    let chunkIdx = 0;
    let buffer = "";

    for (const section of sections) {
      if (buffer && (buffer.length + 1 + section.length) > chunkSize) {
        // Emit buffer
        for (const chunk of splitByChunk(buffer, chunkSize, overlap)) {
          const item = textChunk(chunk, `${sourceId}:${chunkIdx}`, startIndex);
          collected.push(item);
          yield item;
          startIndex += Math.max(chunk.length - overlap, 1);
          chunkIdx++;
        }
        buffer = "";
      }
      buffer = buffer ? buffer + "\n" + section : section;
    }

    // Emit remaining buffer
    if (buffer) {
      for (const chunk of splitByChunk(buffer, chunkSize, overlap)) {
        const item = textChunk(chunk, `${sourceId}:${chunkIdx}`, startIndex);
        collected.push(item);
        yield item;
        startIndex += Math.max(chunk.length - overlap, 1);
        chunkIdx++;
      }
    }

    yield { chunks: collected };
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
    start_index: "int",
    chunks: "list"
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const collected: Record<string, unknown>[] = [];
    for await (const item of this.genProcess(context)) {
      if ("chunks" in item) continue;
      collected.push(item);
    }
    return {
      text: collected[0]?.text ?? "",
      source_id: collected[0]?.source_id ?? "",
      start_index: collected[0]?.start_index ?? 0,
      chunks: collected
    };
  }

  async *genProcess(context?: ProcessingContext): AsyncGenerator<Record<string, unknown>> {
    const document = this.document ?? this.document;
    const raw = await readDocumentText(document, context);
    const sourceId = documentSourceId(document);
    const chunkSize = Number((this as any).chunk_size ?? 1200);
    const overlap = Number((this as any).chunk_overlap ?? 100);
    const collected: Record<string, unknown>[] = [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Fallback to character-based splitting for invalid JSON
      let startIndex = 0;
      for (const chunk of splitByChunk(raw, chunkSize, overlap)) {
        const idx = raw.indexOf(chunk, startIndex);
        const resolvedIndex = idx >= 0 ? idx : startIndex;
        const item = textChunk(chunk, sourceId, resolvedIndex);
        collected.push(item);
        yield item;
        startIndex = resolvedIndex + Math.max(chunk.length - overlap, 1);
      }
      yield { chunks: collected };
      return;
    }

    // Split by JSON structure
    let elements: string[];
    if (Array.isArray(parsed)) {
      // Top-level array: split into individual elements
      elements = parsed.map((item) => JSON.stringify(item, null, 2));
    } else if (parsed && typeof parsed === "object") {
      // Top-level object: split by top-level keys
      elements = Object.entries(parsed as Record<string, unknown>).map(
        ([key, value]) => JSON.stringify({ [key]: value }, null, 2)
      );
    } else {
      elements = [JSON.stringify(parsed, null, 2)];
    }

    // Merge small elements and split large ones respecting chunk_size
    let chunkIdx = 0;
    let buffer = "";

    for (const element of elements) {
      if (element.length > chunkSize) {
        // Emit buffer first if any
        if (buffer) {
          const item = textChunk(buffer, `${sourceId}:${chunkIdx}`, chunkIdx);
          collected.push(item);
          yield item;
          chunkIdx++;
          buffer = "";
        }
        // Split large element by characters
        for (const chunk of splitByChunk(element, chunkSize, overlap)) {
          const item = textChunk(chunk, `${sourceId}:${chunkIdx}`, chunkIdx);
          collected.push(item);
          yield item;
          chunkIdx++;
        }
      } else if (buffer && (buffer.length + 2 + element.length) > chunkSize) {
        // Buffer would exceed chunk_size, emit it
        const item = textChunk(buffer, `${sourceId}:${chunkIdx}`, chunkIdx);
        collected.push(item);
        yield item;
        chunkIdx++;
        buffer = element;
      } else {
        buffer = buffer ? buffer + ",\n" + element : element;
      }
    }

    if (buffer) {
      const item = textChunk(buffer, `${sourceId}:${chunkIdx}`, chunkIdx);
      collected.push(item);
      yield item;
    }

    yield { chunks: collected };
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
    start_index: "int",
    chunks: "list"
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const collected: Record<string, unknown>[] = [];
    for await (const item of this.genProcess(context)) {
      if ("chunks" in item) continue;
      collected.push(item);
    }
    return {
      text: collected[0]?.text ?? "",
      source_id: collected[0]?.source_id ?? "",
      start_index: collected[0]?.start_index ?? 0,
      chunks: collected
    };
  }

  async *genProcess(context?: ProcessingContext): AsyncGenerator<Record<string, unknown>> {
    const document = this.document ?? this.document;
    const text = await readDocumentText(document, context);
    const sourceId = documentSourceId(document);
    const chunkSize = Number(
      (this as any).chunk_size ?? (this as any).chunk_size ?? 1000
    );
    const overlap = Number(
      (this as any).chunk_overlap ?? (this as any).chunk_overlap ?? 200
    );
    const separators = Array.isArray(this.separators ?? this.separators)
      ? ((this.separators ?? this.separators) as unknown[]).map((s) =>
          String(s)
        )
      : ["\n\n", "\n", "."];

    // Truly recursive splitting: for each separator in order,
    // split text and recursively split chunks that are too large
    // using the next separator.
    function recursiveSplit(
      input: string,
      sepIndex: number
    ): string[] {
      if (input.length <= chunkSize) return [input];
      if (sepIndex >= separators.length) {
        // No more separators — fall back to character splitting
        return splitByChunk(input, chunkSize, overlap);
      }

      const sep = separators[sepIndex];
      if (!input.includes(sep)) {
        // This separator doesn't exist in the text, try next
        return recursiveSplit(input, sepIndex + 1);
      }

      const rawParts = input.split(sep);
      const merged: string[] = [];
      let current = "";

      for (let i = 0; i < rawParts.length; i++) {
        const part = rawParts[i];
        const candidate = current ? current + sep + part : part;

        if (candidate.length <= chunkSize) {
          current = candidate;
        } else {
          if (current) merged.push(current);
          if (part.length <= chunkSize) {
            current = part;
          } else {
            // Part is still too large — recurse with next separator
            const subChunks = recursiveSplit(part, sepIndex + 1);
            for (let j = 0; j < subChunks.length - 1; j++) {
              merged.push(subChunks[j]);
            }
            current = subChunks[subChunks.length - 1];
          }
        }
      }
      if (current) merged.push(current);

      // Apply overlap by prepending end of previous chunk
      if (overlap > 0 && merged.length > 1) {
        const withOverlap: string[] = [merged[0]];
        for (let i = 1; i < merged.length; i++) {
          const prev = merged[i - 1];
          const overlapText = prev.slice(-overlap);
          withOverlap.push(overlapText + merged[i]);
        }
        return withOverlap;
      }

      return merged;
    }

    const chunks = recursiveSplit(text, 0);
    const collected: Record<string, unknown>[] = [];
    let chunkIndex = 0;
    let searchFrom = 0;
    for (const chunk of chunks) {
      // Find position accounting for overlap (search from where we expect)
      const idx = text.indexOf(chunk, searchFrom);
      const resolvedIndex = idx >= 0 ? idx : searchFrom;
      const item = textChunk(
        chunk,
        `${sourceId}:${chunkIndex}`,
        resolvedIndex
      );
      collected.push(item);
      yield item;
      // Move search forward, but not past the overlap region
      searchFrom = resolvedIndex + Math.max(chunk.length - overlap, 1);
      chunkIndex++;
    }
    yield { chunks: collected };
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
    start_index: "int",
    chunks: "list"
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const collected: Record<string, unknown>[] = [];
    for await (const item of this.genProcess(context)) {
      if ("chunks" in item) continue;
      collected.push(item);
    }
    return {
      text: collected[0]?.text ?? "",
      source_id: collected[0]?.source_id ?? "",
      start_index: collected[0]?.start_index ?? 0,
      chunks: collected
    };
  }

  async *genProcess(context?: ProcessingContext): AsyncGenerator<Record<string, unknown>> {
    const document = this.document ?? this.document;
    const markdown = await readDocumentText(document, context);
    const sourceId = documentSourceId(document);
    const stripHeaders = Boolean(
      this.strip_headers ?? this.strip_headers ?? true
    );
    const returnEachLine = Boolean(
      this.return_each_line ?? this.return_each_line ?? false
    );
    const chunkSize = Number(
      (this as any).chunk_size ?? (this as any).chunk_size ?? 1000
    );
    const overlap = Number(
      (this as any).chunk_overlap ?? (this as any).chunk_overlap ?? 30
    );

    // Parse headers_to_split_on config
    const headersConfig = Array.isArray(this.headers_to_split_on)
      ? (this.headers_to_split_on as Array<[string, string]>)
      : [["#", "Header 1"], ["##", "Header 2"], ["###", "Header 3"]];

    // Build header patterns sorted by level (longest first so ## matches before #)
    const headerPatterns = headersConfig
      .map(([symbol, name]) => ({ symbol, name, level: symbol.length }))
      .sort((a, b) => b.level - a.level);

    // Parse sections with header hierarchy tracking
    interface Section {
      content: string[];
      metadata: Record<string, string>;
    }

    const sections: Section[] = [];
    let currentContent: string[] = [];
    const activeHeaders: Record<string, string> = {};

    for (const line of markdown.split("\n")) {
      const trimmedLine = line.trim();

      // Check if this line is a header we care about
      let matchedHeader: { symbol: string; name: string; level: number } | null = null;
      for (const hp of headerPatterns) {
        if (trimmedLine.startsWith(hp.symbol + " ") && !trimmedLine.startsWith(hp.symbol + "#")) {
          matchedHeader = hp;
          break;
        }
      }

      if (matchedHeader) {
        // Emit previous section
        if (currentContent.length > 0) {
          sections.push({
            content: [...currentContent],
            metadata: { ...activeHeaders }
          });
          currentContent = [];
        }

        // Update header hierarchy: set this header and clear deeper levels
        const headerText = trimmedLine.slice(matchedHeader.symbol.length).trim();
        activeHeaders[matchedHeader.name] = headerText;
        // Clear any deeper headers
        for (const hp of headerPatterns) {
          if (hp.level > matchedHeader.level) {
            delete activeHeaders[hp.name];
          }
        }

        if (!stripHeaders) {
          currentContent.push(line);
        }
      } else {
        currentContent.push(line);
      }
    }

    // Emit final section
    if (currentContent.length > 0) {
      sections.push({
        content: [...currentContent],
        metadata: { ...activeHeaders }
      });
    }

    // Yield sections
    const collected: Record<string, unknown>[] = [];
    let chunkIdx = 0;
    for (const section of sections) {
      const sectionText = section.content.join("\n").trim();
      if (!sectionText) continue;

      if (returnEachLine) {
        for (const line of section.content) {
          const trimmed = line.trim();
          if (trimmed) {
            const result = textChunk(trimmed, sourceId, chunkIdx);
            result.metadata = section.metadata;
            collected.push(result);
            yield result;
            chunkIdx++;
          }
        }
      } else {
        const sectionChunks = splitByChunk(sectionText, chunkSize, overlap);
        for (const chunk of sectionChunks) {
          const result = textChunk(chunk, sourceId, chunkIdx);
          result.metadata = section.metadata;
          collected.push(result);
          yield result;
          chunkIdx++;
        }
      }
    }

    // Fallback if no sections were created
    if (sections.length === 0) {
      let startIndex = 0;
      for (const chunk of splitByChunk(markdown, chunkSize, overlap)) {
        const idx = markdown.indexOf(chunk, startIndex);
        const resolvedIndex = idx >= 0 ? idx : startIndex;
        const item = textChunk(chunk, sourceId, resolvedIndex);
        collected.push(item);
        yield item;
        startIndex = resolvedIndex + Math.max(chunk.length - overlap, 1);
      }
    }

    yield { chunks: collected };
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
