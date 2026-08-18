import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
  InputMode,
  OutputCorrelation,
  Platform
} from "@nodetool-ai/protocol";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import {
  loadNodeFsPromises,
  loadNodePath
} from "@nodetool-ai/nodes-utils";

const NODE_ONLY: readonly Platform[] = ["node"];

type DocumentRefLike = {
  uri?: string;
  data?: Uint8Array | string;
  text?: string;
};

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

/** Output handles LoadDocumentFileNode.process() emits. */
type LoadDocumentFileNodeOutputs = {
  output: { uri: string; data: string };
};

export class LoadDocumentFileNode extends BaseNode {
  static readonly nodeType = "nodetool.document.LoadDocumentFile";
  static readonly platforms = NODE_ONLY;
  static readonly title = "Load Document File";
  static readonly description =
    "Read a document from disk.\n    files, document, read, input, load, file";
  static readonly inlineFields = ["path"];
  static readonly inputFields = [];
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

  async process(): Promise<LoadDocumentFileNodeOutputs> {
    const p = String(this.path ?? this.path ?? "");
    const full = toFilePath(p);
    const fs = await loadNodeFsPromises();
    const bytes = new Uint8Array(await fs.readFile(full));
    return {
      output: {
        uri: `file://${full}`,
        data: Buffer.from(bytes).toString("base64")
      }
    };
  }
}

/** Output handles SaveDocumentFileNode.process() emits. */
type SaveDocumentFileNodeOutputs = {
  output: string;
};

export class SaveDocumentFileNode extends BaseNode {
  static readonly nodeType = "nodetool.document.SaveDocumentFile";
  static readonly platforms = NODE_ONLY;
  static readonly title = "Save Document File";
  static readonly description =
    "Write a document to disk.\n    files, document, write, output, save, file\n\n    The filename can include time and date variables:\n    %Y - Year, %m - Month, %d - Day\n    %H - Hour, %M - Minute, %S - Second";
  static readonly inlineFields = ["folder", "filename"];
  static readonly inputFields = ["document"];

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
  declare document: DocumentRefLike;

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder where the file will be saved"
  })
  declare folder: string;

  @prop({
    type: "str",
    default: "",
    title: "Filename",
    description: "Name of the file to save. Supports strftime format codes."
  })
  declare filename: string;

  /** Destination path — set on the instance, not declared as a `@prop`. */
  declare path?: string;

  async process(): Promise<SaveDocumentFileNodeOutputs> {
    const document = this.document ?? {};
    const full = toFilePath(this.path ?? "");
    const fs = await loadNodeFsPromises();
    const path = await loadNodePath();
    await fs.mkdir(path.dirname(full), { recursive: true });
    if (document.data) {
      await fs.writeFile(full, asBytes(document.data));
    } else if (document.text != null) {
      await fs.writeFile(full, document.text, "utf8");
    } else if (document.uri) {
      await fs.copyFile(toFilePath(document.uri), full);
    } else {
      await fs.writeFile(full, "", "utf8");
    }
    return { output: full };
  }
}

/** A document found on disk, addressed by its `file://` URI. */
type ListedDocument = { uri: string };

/** Output handles ListDocumentsNode emits. */
type ListDocumentsNodeOutputs = {
  document: ListedDocument;
  documents: ListedDocument[];
};

export class ListDocumentsNode extends BaseNode {
  static readonly nodeType = "nodetool.document.ListDocuments";
  static readonly platforms = NODE_ONLY;
  static readonly title = "List Documents";
  static readonly description =
    "List documents in a directory.\n    files, list, directory";
  static readonly inlineFields = ["folder", "pattern"];
  static readonly inputFields = [];
  static readonly metadataOutputTypes = {
    document: "document",
    documents: "list"
  };

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = {
    document: { kind: "iteration", source: "__execution__", group: "items" },
    documents: { kind: "single", source: "__execution__" }
  } satisfies Record<string, OutputCorrelation>;

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

  async process(): Promise<ListDocumentsNodeOutputs> {
    const collected: ListedDocument[] = [];
    for await (const item of this._listDocuments()) {
      collected.push(item.document);
    }
    return {
      document: collected[0] ?? { uri: "" },
      documents: collected
    };
  }

  private async *_listDocuments(): AsyncGenerator<{ document: ListedDocument }> {
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
    const fs = await loadNodeFsPromises();
    const path = await loadNodePath();
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

  async *genProcess(): AsyncGenerator<Partial<ListDocumentsNodeOutputs>> {
    const collected: ListedDocument[] = [];
    for await (const item of this._listDocuments()) {
      collected.push(item.document);
      yield { document: item.document };
    }
    yield { documents: collected };
  }
}

export const DOCUMENT_NODES = tagAsServer([
  LoadDocumentFileNode,
  SaveDocumentFileNode,
  ListDocumentsNode
]);
