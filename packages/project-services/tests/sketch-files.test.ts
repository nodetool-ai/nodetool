/**
 * Sketches as files in the project folder: `Sketches/<name>.sketch.json`,
 * with each raster layer's pixels a PNG in `Sketches/<name>.sketch/`. An
 * import keeps the sketch as it was as a version.
 */
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ImageDocument,
  ImageDocumentVersion,
  ModelObserver,
  findDocumentByFile,
  initTestDb,
  moveDocumentToProject,
  setImageDocumentFileSync,
  type DocumentFileSync
} from "@nodetool-ai/models";
import {
  createLocalWorkspace,
  setProjectFolderResolver,
  type ProjectFolderResolution,
  type Workspace
} from "@nodetool-ai/runtime";
import {
  OTHER_PROJECT,
  PROJECT,
  USER,
  describeDocumentFiles
} from "./_helpers/document-kind-files.js";
import {
  documentFileSync,
  reconcileDocumentFiles
} from "../src/document-file-sync.js";
import { migrateSketchFiles, sketchFileAdapter } from "../src/sketch-file.js";
import { isInSketchAssetFolder } from "../src/project-index.js";

function documentWith(
  marker: string,
  layers: Array<Record<string, unknown>> = []
): Record<string, unknown> {
  return {
    sketch: {
      version: 3,
      canvas: { width: 64, height: 64, backgroundColor: "#ffffff" },
      layers,
      activeLayerId: marker,
      maskLayerId: null
    },
    layerBindings: []
  };
}

function sketchOf(row: ImageDocument): Record<string, unknown> {
  return (JSON.parse(row.document) as Record<string, unknown>)[
    "sketch"
  ] as Record<string, unknown>;
}

describeDocumentFiles("sketch files", {
  memberType: "sketch",
  directory: "Sketches",
  suffix: ".sketch.json",
  format: "nodetool.sketch",
  adapter: sketchFileAdapter,
  install: (sync) =>
    setImageDocumentFileSync(sync as DocumentFileSync<ImageDocument> | null),
  make: (name, marker) =>
    ImageDocument.create<ImageDocument>({
      user_id: USER,
      project_id: PROJECT,
      name,
      document: JSON.stringify(documentWith(marker))
    }),
  reload: (id) => ImageDocument.findById(id),
  async rename(row, name) {
    await ImageDocument.updateFieldsIfUnchanged(row.id, row.updated_at, {
      name
    });
  },
  markerOf: (row) => sketchOf(row)["activeLayerId"] as string,
  setMarker: (file, marker) => {
    const document = file["document"] as Record<string, unknown>;
    (document["sketch"] as Record<string, unknown>)["activeLayerId"] = marker;
  },
  breakFile: (file) => {
    file["width"] = -1;
  },
  newBody: (marker) => ({
    width: 64,
    height: 64,
    background_color: "#ffffff",
    workflow_id: null,
    document: documentWith(marker)
  }),
  versionCount: async (id) =>
    (await ImageDocumentVersion.listForDocument(id)).length
});

// ── Layer images ────────────────────────────────────────────────────────────

/** Bytes that stand for a PNG: the sync never decodes them. */
const PIXELS = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const EDITED = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]);
const SVG = `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`;
const pngUrl = (bytes: Uint8Array): string =>
  `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
const bytesOf = (bytes: Uint8Array | null): Buffer | null =>
  bytes && Buffer.from(bytes);
const sha256 = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

const layers = (raster: Uint8Array): Array<Record<string, unknown>> => [
  { id: "paint", name: "Paint", type: "raster", data: pngUrl(raster) },
  { id: "shape", name: "Shape", type: "vector", data: SVG },
  { id: "empty", name: "Empty", type: "raster", data: null }
];

describe("sketch layer images", () => {
  let root: string;
  let folders: Map<string, Workspace>;

  const folder = (projectId = PROJECT): Workspace => {
    let workspace = folders.get(projectId);
    if (!workspace) {
      workspace = createLocalWorkspace(join(root, projectId));
      folders.set(projectId, workspace);
    }
    return workspace;
  };
  const make = (name = "Fox", raster = PIXELS): Promise<ImageDocument> =>
    ImageDocument.create<ImageDocument>({
      user_id: USER,
      project_id: PROJECT,
      name,
      document: JSON.stringify(documentWith("paint", layers(raster)))
    });
  const reload = async (id: string): Promise<ImageDocument> => {
    const row = await ImageDocument.findById(id);
    if (!row) throw new Error(`row ${id} is gone`);
    return row;
  };
  const fileLayers = async (
    path: string,
    projectId = PROJECT
  ): Promise<Array<Record<string, unknown>>> => {
    const text = await folder(projectId).readText(path);
    if (text === null) throw new Error(`no file at ${path}`);
    const file = JSON.parse(text) as Record<string, unknown>;
    const document = file["document"] as Record<string, unknown>;
    return (document["sketch"] as Record<string, unknown>)["layers"] as Array<
      Record<string, unknown>
    >;
  };
  const rowLayers = (row: ImageDocument): Array<Record<string, unknown>> =>
    sketchOf(row)["layers"] as Array<Record<string, unknown>>;

  beforeEach(async () => {
    initTestDb();
    root = await mkdtemp(join(tmpdir(), "nodetool-sketch-files-"));
    folders = new Map();
    setImageDocumentFileSync(documentFileSync(sketchFileAdapter));
    setProjectFolderResolver(
      async (projectId): Promise<ProjectFolderResolution> => {
        const id = projectId ?? "personal";
        return { ok: true, projectId: id, workspace: folder(id) };
      }
    );
  });

  afterEach(async () => {
    setImageDocumentFileSync(null);
    ModelObserver.clear();
    setProjectFolderResolver(null);
    await rm(root, { recursive: true, force: true });
  });

  it("writes a raster layer as a PNG beside the file and keeps a vector layer inline", async () => {
    const row = await make();

    const [paint, shape, empty] = await fileLayers("Sketches/Fox.sketch.json");
    expect(paint?.["data"]).toBe("Fox.sketch/paint.png");
    expect(shape?.["data"]).toBe(SVG);
    expect(empty?.["data"]).toBeNull();
    expect(bytesOf(await folder().read("Sketches/Fox.sketch/paint.png"))).toEqual(Buffer.from(PIXELS));
    expect((await folder().list("Sketches/Fox.sketch")).map((e) => e.name)).toEqual([
      "paint.png"
    ]);

    // The hash covers the file and its images: it is the inline document's.
    const stored = await reload(row.id);
    const inline = (await sketchFileAdapter.assets?.inline(
      (await folder().readText("Sketches/Fox.sketch.json")) ?? "",
      "Sketches/Fox.sketch.json",
      (path) => folder().read(path)
    )) as string;
    expect(stored.file_hash).toBe(sha256(inline));
    expect(JSON.parse(inline).document).toEqual(JSON.parse(stored.document));
  });

  it("reads the images back, so an untouched folder changes nothing", async () => {
    const row = await make();
    const report = await reconcileDocumentFiles([sketchFileAdapter], PROJECT, USER);
    expect(report.unchanged).toBe(1);
    expect(report.imported).toEqual([]);
    expect(rowLayers(await reload(row.id))[0]?.["data"]).toBe(pngUrl(PIXELS));
  });

  it("imports a PNG edited outside NodeTool", async () => {
    const row = await make();
    await folder().write("Sketches/Fox.sketch/paint.png", EDITED);

    const report = await reconcileDocumentFiles([sketchFileAdapter], PROJECT, USER, {
      paths: ["Sketches/Fox.sketch/paint.png"]
    });

    expect(report.imported).toEqual([row.id]);
    expect(rowLayers(await reload(row.id))[0]?.["data"]).toBe(pngUrl(EDITED));
  });

  it("refuses a file whose layer image is gone and keeps the row", async () => {
    const row = await make();
    await folder().delete("Sketches/Fox.sketch/paint.png");

    const report = await reconcileDocumentFiles([sketchFileAdapter], PROJECT, USER);

    expect(report.invalid).toEqual([row.id]);
    const stored = await reload(row.id);
    expect(stored.file_error).toContain("paint");
    expect(rowLayers(stored)[0]?.["data"]).toBe(pngUrl(PIXELS));
  });

  it("deletes an image the document no longer names", async () => {
    const row = await make();
    await ImageDocument.updateFieldsIfUnchanged(row.id, row.updated_at, {
      document: JSON.stringify(documentWith("shape", layers(PIXELS).slice(1)))
    });
    expect(await folder().exists("Sketches/Fox.sketch/paint.png")).toBe(false);
  });

  it("renames the image folder with the sketch", async () => {
    const row = await make();
    await ImageDocument.updateFieldsIfUnchanged(row.id, row.updated_at, {
      name: "Wolf"
    });

    expect(await folder().exists("Sketches/Fox.sketch.json")).toBe(false);
    expect(await folder().exists("Sketches/Fox.sketch/paint.png")).toBe(false);
    expect((await fileLayers("Sketches/Wolf.sketch.json"))[0]?.["data"]).toBe(
      "Wolf.sketch/paint.png"
    );
    expect(bytesOf(await folder().read("Sketches/Wolf.sketch/paint.png"))).toEqual(Buffer.from(PIXELS));
  });

  it("deletes the image folder with the sketch", async () => {
    const row = await make();
    await row.delete();
    expect(await folder().exists("Sketches/Fox.sketch.json")).toBe(false);
    expect(await folder().exists("Sketches/Fox.sketch/paint.png")).toBe(false);
  });

  it("moves the image folder with the sketch to another project", async () => {
    const row = await make();

    expect(await moveDocumentToProject(USER, "sketch", row.id, OTHER_PROJECT)).toBe(
      true
    );

    expect(await folder().exists("Sketches/Fox.sketch/paint.png")).toBe(false);
    expect(bytesOf(await folder(OTHER_PROJECT).read("Sketches/Fox.sketch/paint.png"))).toEqual(Buffer.from(PIXELS));
    expect((await reload(row.id)).project_id).toBe(OTHER_PROJECT);
  });

  it("writes the files of sketches from before project folders", async () => {
    setImageDocumentFileSync(null);
    const legacy = await make("Old");
    setImageDocumentFileSync(documentFileSync(sketchFileAdapter));
    expect((await reload(legacy.id)).file_path).toBeNull();

    expect(await migrateSketchFiles()).toBe(1);

    const stored = await reload(legacy.id);
    expect(stored.file_path).toBe("Sketches/Old.sketch.json");
    expect(stored.updated_at).toBe(legacy.updated_at);
    expect(bytesOf(await folder().read("Sketches/Old.sketch/paint.png"))).toEqual(Buffer.from(PIXELS));
    expect(await migrateSketchFiles()).toBe(0);
  });

  it("finds the sketch of a file, as projects.documentByFile does", async () => {
    const row = await make();
    const found = await findDocumentByFile(USER, [PROJECT], "Sketches/Fox.sketch.json");
    expect(found).toMatchObject({ type: "sketch", id: row.id, name: "Fox" });
  });

  it("keeps the layer images out of the asset index", () => {
    expect(isInSketchAssetFolder("Sketches/Fox.sketch/paint.png")).toBe(true);
    expect(isInSketchAssetFolder("Sketches/Fox.sketch.json")).toBe(false);
    expect(isInSketchAssetFolder("Generated/fox.png")).toBe(false);
  });
});
