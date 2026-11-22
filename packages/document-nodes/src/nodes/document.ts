import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
  InputMode,
  OutputCorrelation,
  Platform
} from "@nodetool-ai/protocol";
import {
  isProjectRelativePath,
  projectDocumentRef,
  tagAsServer
} from "@nodetool-ai/nodes-utils";
import {
  loadNodeFsPromises,
  loadNodeOs,
  loadNodePath,
  assertSaveTargetIsOwn,
  writeSaveTargetFile,
  writeSavedFile,
  workspaceFolderOf,
  type FolderValue,
  VISIBLE_WHEN_NOT_SAVING_TO_WORKSPACE,
  SAVE_TO_WORKSPACE_DESCRIPTION,
  SAVE_TO_WORKSPACE_TITLE
} from "@nodetool-ai/nodes-utils";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";

const NODE_ONLY: readonly Platform[] = ["node"];

type DocumentRefLike = {
  uri?: string;
  asset_id?: string | null;
  data?: Uint8Array | string;
  text?: string;
};

function asBytes(data: Uint8Array | string | undefined): Uint8Array {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  return Uint8Array.from(Buffer.from(data, "base64"));
}

/**
 * Bytes behind a document ref's `uri` or `asset_id`: `asset://`, storage and
 * http(s) refs through the shared media-ref resolver, then a relative or
 * `file://` path read from disk.
 */
async function documentRefBytes(
  document: DocumentRefLike,
  context?: ProcessingContext
): Promise<Uint8Array> {
  const resolved = await loadMediaRefBytes(
    { uri: document.uri, asset_id: document.asset_id, type: "document" },
    context
  );
  if (resolved !== null) return resolved;
  const uri = document.uri ?? "";
  if (!uri || uri.startsWith("asset://") || /^https?:/.test(uri)) {
    throw new Error(
      `SaveDocument: cannot read document '${uri || `asset://${document.asset_id}`}'`
    );
  }
  const fs = await loadNodeFsPromises();
  return new Uint8Array(await fs.readFile(toFilePath(uri)));
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
  output: { type?: "document"; uri: string; asset_id?: string; data: string };
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

  async process(
    context?: ProcessingContext
  ): Promise<LoadDocumentFileNodeOutputs> {
    // A path in the project reads the project's document through the
    // workspace, so cloud projects work too (PRD R23).
    const project = await projectDocumentRef(this.path, context);
    if (project && context?.workspace) {
      const bytes = await context.workspace.read(this.path);
      if (bytes) {
        return {
          output: { ...project, data: Buffer.from(bytes).toString("base64") }
        };
      }
    }
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

/** A saved document, as the `output` handle carries it. */
type SavedDocumentRef = { type: "document"; uri: string; asset_id: string | null };

/** Output handles SaveDocumentNode.process() emits. */
type SaveDocumentNodeOutputs = {
  output: SavedDocumentRef;
  path: string;
};

/** The saved document for a file written at `path`. */
function savedFileRef(path: string): SavedDocumentRef {
  return { type: "document", uri: `file://${path}`, asset_id: null };
}

export class SaveDocumentNode extends BaseNode {
  static readonly nodeType = "nodetool.document.SaveDocument";
  static readonly platforms = NODE_ONLY;
  static readonly title = "Save Document";
  static readonly metadataOutputTypes = {
    output: "document",
    path: "str"
  };
  static readonly description =
    "Write a document into the project folder, a project document or a folder on disk.\n    files, document, write, output, save, file, markdown\n\n    With a target document, the content replaces or is appended to that document, and each run keeps the content before it as a version. Without a target the node writes folder plus filename.\n\n    The filename can include time and date variables:\n    %Y - Year, %m - Month, %d - Day\n    %H - Hour, %M - Minute, %S - Second";
  static readonly inlineFields = [
    "target",
    "mode",
    "save_to_workspace",
    "folder",
    "filename"
  ];
  static readonly inputFields = ["document", "text"];

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
    title: "Text",
    description:
      "Markdown text to save. Used instead of the document input when it is not empty."
  })
  declare text: string;

  @prop({
    type: "document",
    default: {
      type: "document",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Target",
    description:
      "A project document to write into. Leave empty to write a new file to folder plus filename."
  })
  declare target: DocumentRefLike;

  @prop({
    type: "enum",
    default: "replace",
    title: "Mode",
    description: "Replace the target document's content, or append to it.",
    values: ["replace", "append"]
  })
  declare mode: "replace" | "append";

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
  declare folder: FolderValue;

  @prop({
    type: "str",
    default: "",
    title: "Filename",
    description: "Name of the file to save. Supports strftime format codes."
  })
  declare filename: string;

  @prop({
    type: "bool",
    default: false,
    title: "Overwrite",
    description:
      "Overwrite the file if it already exists, otherwise file will be renamed"
  })
  declare overwrite: boolean;

  /** Destination path — set on the instance, not declared as a `@prop`. */
  declare path?: string;

  async process(
    context?: ProcessingContext
  ): Promise<SaveDocumentNodeOutputs> {
    const document = this.document ?? {};
    const targetId = targetAssetId(this.target);
    if (targetId) {
      const written = await this.writeTarget(targetId, document, context);
      return {
        output: { type: "document", uri: `asset://${written.id}`, asset_id: written.id },
        path: written.workspace_path ?? `asset://${written.id}`
      };
    }
    const fs = await loadNodeFsPromises();
    const path = await loadNodePath();

    // The bytes first, so one write call covers every source shape and the
    // workspace path never needs a second branch.
    let bytes: Uint8Array | string;
    if (this.text) {
      bytes = this.text;
    } else if (document.data !== undefined && document.data.length > 0) {
      bytes = asBytes(document.data);
    } else if (document.text != null) {
      bytes = document.text;
    } else if (document.uri || document.asset_id) {
      bytes = await documentRefBytes(document, context);
    } else {
      bytes = "";
    }

    // A caller (or an older graph) that pinned a full `path` keeps writing
    // exactly there; everything else goes through folder + filename.
    const pinned = toFilePath(this.path ?? "");
    if (pinned) {
      await assertSaveTargetIsOwn(context, path.resolve(pinned));
      await fs.mkdir(path.dirname(pinned), { recursive: true });
      await writeSaveTargetFile(context, path.resolve(pinned), bytes);
      return { output: savedFileRef(pinned), path: pinned };
    }

    const full = await writeSavedFile({
      folder: this.folder,
      filename: this.filename || "document.txt",
      workspaceFolder: await workspaceFolderOf(this.folder, context),
      saveToWorkspace: this.save_to_workspace,
      workspace: context?.workspace,
      workspaceDir: context?.workspaceDir,
      context: context ?? null,
      overwrite: this.overwrite,
      bytes
    });
    return { output: savedFileRef(full), path: full };
  }

  /** Write into the target project document and return its asset. */
  private async writeTarget(
    assetId: string,
    document: DocumentRefLike,
    context: ProcessingContext | undefined
  ): Promise<{ id: string; workspace_path?: string | null }> {
    if (!context) {
      throw new Error("SaveDocument: writing to a target document needs a run context.");
    }
    let content: string;
    if (this.text) {
      content = this.text;
    } else if (document.data !== undefined && document.data.length > 0) {
      content = decodeText(asBytes(document.data));
    } else if (document.text != null) {
      content = document.text;
    } else if (document.uri || document.asset_id) {
      content = decodeText(await documentRefBytes(document, context));
    } else {
      content = "";
    }
    const written = await context.writeTextDocument({
      assetId,
      content,
      mode: this.mode === "append" ? "append" : "replace",
      causeId: context.jobId || null,
      provenance: {
        workflowId: context.workflowId,
        nodeId: this.__node_id || null,
        jobId: context.jobId || null
      }
    });
    if (!written) {
      throw new Error(`SaveDocument: target document ${assetId} was not found.`);
    }
    return written;
  }
}

/** The asset id a target document value names, or null when none is set. */
function targetAssetId(target: DocumentRefLike | null | undefined): string | null {
  if (!target) return null;
  if (target.asset_id) return target.asset_id;
  const uri = target.uri ?? "";
  return uri.startsWith("asset://") ? uri.slice("asset://".length) || null : null;
}

/** UTF-8 text, refusing a binary document such as a PDF. */
function decodeText(bytes: Uint8Array): string {
  const head = String.fromCharCode(...bytes.subarray(0, 4));
  if (head === "%PDF" || head === "PK\u0003\u0004" || bytes.subarray(0, 8192).includes(0)) {
    throw new Error(
      "SaveDocument: the content is a binary document. Extract its text first, for example with lib.pdf.ExtractMarkdown."
    );
  }
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * A document found by a listing: a host file by its `file://` URI, or a
 * project file by its asset or workspace URI.
 */
type ListedDocument = { type?: "document"; uri: string; asset_id?: string };

const LISTED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".html",
  ".pdf",
  ".docx"
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

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
    "List documents in a directory. A folder relative to the project lists the project's documents.\n    files, list, directory";
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
    description:
      "Directory to scan. A relative path, such as notes or ., is a folder in the project."
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

  async process(
    context?: ProcessingContext
  ): Promise<ListDocumentsNodeOutputs> {
    const collected: ListedDocument[] = [];
    for await (const item of this._listDocuments(context)) {
      collected.push(item.document);
    }
    return {
      document: collected[0] ?? { uri: "" },
      documents: collected
    };
  }

  /** Documents in a project folder, through the run's workspace (PRD R24). */
  private async *_listProjectDocuments(
    context: ProcessingContext
  ): AsyncGenerator<{ document: ListedDocument }> {
    const workspace = context.workspace;
    if (!workspace) return;
    const folder = this.folder === "." ? "" : this.folder;
    const matches = wildcardToRegExp(this.pattern);
    const entries = await workspace.list(folder, { recursive: this.recursive });
    for (const entry of entries) {
      if (
        entry.isDirectory ||
        !LISTED_EXTENSIONS.has(extensionOf(entry.name)) ||
        !matches.test(entry.name)
      ) {
        continue;
      }
      const document = await projectDocumentRef(entry.path, context);
      if (document) yield { document };
    }
  }

  private async *_listDocuments(
    context?: ProcessingContext
  ): AsyncGenerator<{ document: ListedDocument }> {
    if (context?.workspace && isProjectRelativePath(this.folder)) {
      yield* this._listProjectDocuments(context);
      return;
    }
    const folder = await expandUser(this.folder);
    const recursive = this.recursive;
    const allowed = LISTED_EXTENSIONS;
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

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Partial<ListDocumentsNodeOutputs>> {
    const collected: ListedDocument[] = [];
    for await (const item of this._listDocuments(context)) {
      collected.push(item.document);
      yield { document: item.document };
    }
    yield { documents: collected };
  }
}

export const DOCUMENT_NODES = tagAsServer([
  LoadDocumentFileNode,
  SaveDocumentNode,
  ListDocumentsNode
]);
