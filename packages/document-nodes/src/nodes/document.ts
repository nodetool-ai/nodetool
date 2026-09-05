import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
  InputMode,
  OutputCorrelation,
  Platform
} from "@nodetool-ai/protocol";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import {
  loadNodeFsPromises,
  loadNodeOs,
  loadNodePath,
  writeSavedFile,
  VISIBLE_WHEN_NOT_SAVING_TO_WORKSPACE,
  SAVE_TO_WORKSPACE_DESCRIPTION,
  SAVE_TO_WORKSPACE_TITLE
} from "@nodetool-ai/nodes-utils";
import type { ProcessingContext } from "@nodetool-ai/runtime";

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

/**
 * Expand a leading `~` to the home directory. `ListDocuments` ships `"~"` as
 * its folder default, and without this `fs.readdir` scandir's a literal `~`
 * and the node throws ENOENT on its own defaults.
 */
async function expandUser(p: string): Promise<string> {
  if (p !== "~" && !p.startsWith("~/")) return p;
  const os = await loadNodeOs();
  if (p === "~") return os.homedir();
  const path = await loadNodePath();
  return path.join(os.homedir(), p.slice(2));
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
  declare path: string;

  async process(): Promise<LoadDocumentFileNodeOutputs> {
    const full = toFilePath(this.path);
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
  static readonly inlineFields = ["save_to_workspace", "folder", "filename"];
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
    type: "bool",
    default: true,
    title: SAVE_TO_WORKSPACE_TITLE,
    description: SAVE_TO_WORKSPACE_DESCRIPTION
  })
  declare save_to_workspace: boolean;

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder where the file will be saved",
    json_schema_extra: VISIBLE_WHEN_NOT_SAVING_TO_WORKSPACE
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

  async process(
    context?: ProcessingContext
  ): Promise<SaveDocumentFileNodeOutputs> {
    const document = this.document ?? {};
    const fs = await loadNodeFsPromises();
    const path = await loadNodePath();

    // The bytes first, so one write call covers every source shape and the
    // workspace path never needs a second branch.
    let bytes: Uint8Array | string;
    if (document.data) {
      bytes = asBytes(document.data);
    } else if (document.text != null) {
      bytes = document.text;
    } else if (document.uri) {
      bytes = new Uint8Array(await fs.readFile(toFilePath(document.uri)));
    } else {
      bytes = "";
    }

    // A caller (or an older graph) that pinned a full `path` keeps writing
    // exactly there; everything else goes through folder + filename.
    const pinned = toFilePath(this.path ?? "");
    if (pinned) {
      await fs.mkdir(path.dirname(pinned), { recursive: true });
      await fs.writeFile(pinned, bytes);
      return { output: pinned };
    }

    const full = await writeSavedFile({
      folder: this.folder,
      filename: this.filename || "document.txt",
      saveToWorkspace: this.save_to_workspace,
      workspace: context?.workspace,
      workspaceDir: context?.workspaceDir,
      bytes
    });
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
  declare folder: string;

  @prop({
    type: "str",
    default: "*",
    title: "Pattern",
    description: "File pattern to match (e.g. *.txt)"
  })
  declare pattern: string;

  @prop({
    type: "bool",
    default: false,
    title: "Recursive",
    description: "Search subdirectories"
  })
  declare recursive: boolean;

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
    const folder = await expandUser(this.folder);
    const recursive = this.recursive;
    const allowed = new Set([
      ".txt",
      ".md",
      ".markdown",
      ".json",
      ".html",
      ".pdf",
      ".docx"
    ]);
    const matches = wildcardToRegExp(this.pattern);
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
