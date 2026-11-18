/**
 * Sketches as files in the project folder (PRD T5):
 * `Sketches/<name>.sketch.json`, with its layer images in the folder
 * `Sketches/<name>.sketch/` beside it.
 *
 * ```json
 * {
 *   "format": "nodetool.sketch",
 *   "version": 1,
 *   "id": "<image document id>",
 *   "width": 1024,
 *   "height": 1024,
 *   "background_color": "#ffffff",
 *   "workflow_id": null,
 *   "document": {
 *     "sketch": { "layers": [{ "id": "layer-1", "data": "Fox.sketch/layer-1.png" }] },
 *     "layerBindings": []
 *   }
 * }
 * ```
 *
 * The row keeps a raster layer's pixels as a base64 data URL in the layer's
 * `data`. In the file that `data` is the path of a PNG in the sketch's
 * folder, relative to the file. A vector layer keeps its SVG data URL inline,
 * since it is short text. Reading the file reads the images back into the
 * document, so the rest of NodeTool sees the document the row holds. The
 * hash covers the file and every image.
 *
 * The file name is the sketch's name and the file holds no `name` field.
 * Owner, the thumbnail and timestamps stay in the database. The sync itself
 * is `document-file-sync.ts`. This module is the sketch kind.
 *
 * Loading this module installs the sync on the `ImageDocument` model, so
 * every write of a sketch row writes the file. An import keeps the sketch as
 * it was as a version.
 */
import {
  ImageDocument,
  ImageDocumentVersion,
  setImageDocumentFileSync
} from "@nodetool-ai/models";
import {
  documentAssetFolder,
  documentFileSync,
  migrateDocumentFiles,
  type DocumentAssetFile,
  type DocumentFileAdapter,
  type DocumentFileAssets,
  type DocumentFileContent,
  type DocumentFileFailure
} from "./document-file-sync.js";

/** The directory sketch files are written in. */
export const SKETCH_FILE_DIRECTORY = "Sketches";
/** The end of every sketch file name. */
export const SKETCH_FILE_SUFFIX = ".sketch.json";
/** The end of the name of the folder that holds a sketch's layer images. */
export const SKETCH_ASSET_FOLDER_SUFFIX = ".sketch";
/** The `format` value of a sketch file. */
export const SKETCH_FILE_FORMAT = "nodetool.sketch";
/** The name of the version that keeps a sketch as it was before an import. */
export const SKETCH_FILE_EDIT_VERSION_NAME = "Before file edit";
/** The name of the version that keeps a file edit a save in NodeTool replaced. */
export const SKETCH_FILE_REPLACED_VERSION_NAME = "File edit replaced by a save";

/** The sketch fields a sketch file carries. */
export interface SketchFileFields {
  width: number;
  height: number;
  background_color: string;
  workflow_id: string | null;
  /** The document as an object. The row keeps it as JSON text. */
  document: Record<string, unknown>;
}

/** Image data URLs a layer image file is made from, by MIME type. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
};
const IMAGE_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(IMAGE_EXTENSIONS).map(([type, ext]) => [ext, type])
);
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,/;
const SAFE_FILE_STEM = /^[A-Za-z0-9_-]{1,100}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function directoryOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(0, slash) : "";
}

function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function joinPath(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name;
}

/** The layers of a file's document, or an empty list when it has none. */
function layersOf(file: Record<string, unknown>): Record<string, unknown>[] {
  const document = file["document"];
  if (!isRecord(document)) return [];
  const sketch = document["sketch"];
  if (!isRecord(sketch) || !Array.isArray(sketch["layers"])) return [];
  return sketch["layers"].filter(isRecord);
}

function fileText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Whether `data` names a layer image file: a relative path with no `..`
 * part and an image extension.
 */
function isImagePath(data: string): boolean {
  if (data.startsWith("data:") || data.startsWith("/")) return false;
  if (data.split("/").some((part) => part === ".." || part === "")) return false;
  const ext = data.slice(data.lastIndexOf(".") + 1).toLowerCase();
  return ext in IMAGE_TYPES;
}

/** The layer images of a sketch file, in the folder beside it. */
export const sketchFileAssets: DocumentFileAssets = {
  split(text, path) {
    let file: unknown;
    try {
      file = JSON.parse(text);
    } catch {
      return { text, files: [] };
    }
    if (!isRecord(file)) return { text, files: [] };
    const folder = documentAssetFolder(path);
    const folderName = fileNameOf(folder);
    const files: DocumentAssetFile[] = [];
    const used = new Set<string>();
    for (const [index, layer] of layersOf(file).entries()) {
      const data = layer["data"];
      if (typeof data !== "string") continue;
      const match = IMAGE_DATA_URL.exec(data);
      if (!match) continue;
      const contentType = match[1] as string;
      const id = layer["id"];
      let stem =
        typeof id === "string" && SAFE_FILE_STEM.test(id) ? id : `layer-${index + 1}`;
      while (used.has(stem.toLowerCase())) stem = `${stem}-${index + 1}`;
      used.add(stem.toLowerCase());
      const name = `${stem}.${IMAGE_EXTENSIONS[contentType]}`;
      files.push({
        path: joinPath(folder, name),
        data: Buffer.from(data.slice(match[0].length), "base64"),
        contentType
      });
      layer["data"] = `${folderName}/${name}`;
    }
    return files.length === 0 ? { text, files } : { text: fileText(file), files };
  },

  async inline(text, path, read) {
    let file: unknown;
    try {
      file = JSON.parse(text);
    } catch {
      return text;
    }
    if (!isRecord(file)) return text;
    const directory = directoryOf(path);
    const ownFolder = documentAssetFolder(path);
    let changed = false;
    for (const layer of layersOf(file)) {
      const data = layer["data"];
      if (typeof data !== "string" || !isImagePath(data)) continue;
      // A file renamed together with its folder still names the old folder.
      const bytes =
        (await read(joinPath(directory, data))) ??
        (await read(joinPath(ownFolder, fileNameOf(data))));
      if (bytes === null) continue;
      const ext = data.slice(data.lastIndexOf(".") + 1).toLowerCase();
      layer["data"] = `data:${IMAGE_TYPES[ext]};base64,${Buffer.from(bytes).toString("base64")}`;
      changed = true;
    }
    return changed ? fileText(file) : text;
  }
};

/**
 * Check the body of a sketch file with the rule every write of a sketch row
 * applies, and refuse a layer whose image file is gone.
 */
async function parseSketchFile(
  body: Record<string, unknown>
): Promise<DocumentFileContent<SketchFileFields>> {
  const document = body["document"];
  if (!isRecord(document)) {
    return { ok: false, error: '"document" must be an object' };
  }
  if (!isRecord(document["sketch"]) || !Array.isArray(document["layerBindings"])) {
    return {
      ok: false,
      error: '"document" must contain "sketch" and "layerBindings"'
    };
  }
  for (const layer of layersOf(body)) {
    const data = layer["data"];
    if (data !== null && data !== undefined && typeof data !== "string") {
      return {
        ok: false,
        error: `The "data" of layer "${String(layer["id"])}" must be a string or null`
      };
    }
    // A layer image path that is still a path names an image that is gone.
    if (typeof data === "string" && isImagePath(data)) {
      return {
        ok: false,
        error: `The image of layer "${String(layer["id"])}" is missing: ${String(data)}`
      };
    }
  }
  const { width, height } = body;
  for (const [key, value] of [["width", width], ["height", height]] as const) {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      return { ok: false, error: `"${key}" must be a positive integer` };
    }
  }
  const background = body["background_color"];
  if (typeof background !== "string") {
    return { ok: false, error: '"background_color" must be a string' };
  }
  const workflowId = body["workflow_id"] ?? null;
  if (workflowId !== null && typeof workflowId !== "string") {
    return { ok: false, error: '"workflow_id" must be a string or null' };
  }
  return {
    ok: true,
    fields: {
      width: width as number,
      height: height as number,
      background_color: background,
      workflow_id: workflowId,
      document
    }
  };
}

/** The sketch kind of {@link DocumentFileAdapter}. */
export const sketchFileAdapter: DocumentFileAdapter<
  ImageDocument,
  SketchFileFields
> = {
  kind: "sketch",
  directory: SKETCH_FILE_DIRECTORY,
  suffix: SKETCH_FILE_SUFFIX,
  format: SKETCH_FILE_FORMAT,
  untitled: "Untitled sketch",
  assets: sketchFileAssets,

  // SAFETY: the model refuses to store a document that is not an object.
  fieldsOf: (row) => ({
    width: row.width,
    height: row.height,
    background_color: row.background_color,
    workflow_id: row.workflow_id,
    document: JSON.parse(row.document) as Record<string, unknown>
  }),

  body: (fields) => ({
    width: fields.width,
    height: fields.height,
    background_color: fields.background_color,
    workflow_id: fields.workflow_id,
    document: fields.document
  }),

  parse: parseSketchFile,

  list: (userId, projectIds) =>
    ImageDocument.listForProjects(userId, projectIds),

  exists: (id) => ImageDocument.existsExactly(id),

  async snapshot(row, reason = "before-import") {
    // For a replaced file the row is a copy that carries the file's fields,
    // so its document is the object the file holds and not the stored text.
    const document: unknown = row.document;
    await ImageDocumentVersion.snapshot(
      {
        id: row.id,
        user_id: row.user_id,
        width: row.width,
        height: row.height,
        background_color: row.background_color,
        document:
          typeof document === "string" ? document : JSON.stringify(document)
      },
      {
        saveType: "manual",
        name:
          reason === "replaced-file"
            ? SKETCH_FILE_REPLACED_VERSION_NAME
            : SKETCH_FILE_EDIT_VERSION_NAME
      }
    );
  },

  update(row, fields, name) {
    const changes: Parameters<typeof ImageDocument.updateFieldsIfUnchanged>[2] = {};
    if (fields.document !== undefined) {
      changes.document = JSON.stringify(fields.document);
    }
    if (fields.width !== undefined) changes.width = fields.width;
    if (fields.height !== undefined) changes.height = fields.height;
    if (fields.background_color !== undefined) {
      changes.background_color = fields.background_color;
    }
    if (fields.workflow_id !== undefined) changes.workflow_id = fields.workflow_id;
    if (name !== undefined) changes.name = name;
    return ImageDocument.updateFieldsIfUnchanged(row.id, row.updated_at, changes);
  },

  create: ({ id, userId, projectId, name, fields }) =>
    ImageDocument.insertNew({
      id,
      user_id: userId,
      project_id: projectId,
      name,
      width: fields.width,
      height: fields.height,
      background_color: fields.background_color,
      workflow_id: fields.workflow_id,
      document: JSON.stringify(fields.document)
    }),

  setFileState: (id, state) => ImageDocument.setFileState(id, state)
};

setImageDocumentFileSync(documentFileSync(sketchFileAdapter));

/**
 * Write a file for every sketch that has none yet, of every user or of
 * `userId`: the sketches from before project folders. Returns how many files
 * were written.
 */
export function migrateSketchFiles(
  userId?: string,
  onFailure?: (failure: DocumentFileFailure) => void
): Promise<number> {
  return migrateDocumentFiles(
    sketchFileAdapter,
    () => ImageDocument.projectsWithUnwrittenFiles(userId),
    onFailure
  );
}
