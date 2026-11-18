/**
 * Sketches as files in the project folder: `Sketches/<name>.sketch.ora`, an
 * OpenRaster zip with the layer rasters as PNGs. An import keeps the sketch
 * as it was as a version.
 */
import { createHash } from "node:crypto";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
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
import {
  SKETCH_THUMBNAIL_ENTRY,
  migrateSketchFiles,
  sketchFileAdapter,
  sketchFileThumbnail
} from "../src/sketch-file.js";

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
  suffix: ".sketch.ora",
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

// ── The zip ─────────────────────────────────────────────────────────────────

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

let pngs: { red: Uint8Array; blue: Uint8Array; mask: Uint8Array };

/** A real PNG of `width`×`height` in one color. */
async function solidPng(color: string, width = 8, height = 8): Promise<Uint8Array> {
  const { loadCanvas } = await import("@nodetool-ai/runtime");
  const { createCanvas } = await loadCanvas();
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return new Uint8Array(await canvas.encode("png"));
}

const dataUrl = (bytes: Uint8Array): string =>
  `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
const ntlayer = (image: string): string =>
  `ntlayer:${Buffer.from(
    JSON.stringify({ version: 1, image, bounds: { x: 2, y: 3, width: 8, height: 8 } })
  ).toString("base64")}`;
const SVG = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="green"/></svg>'
).toString("base64")}`;

const base = {
  visible: true,
  opacity: 1,
  locked: false,
  alphaLock: false,
  blendMode: "normal",
  transform: { x: 0, y: 0 },
  contentBounds: { x: 0, y: 0, width: 8, height: 8 },
  effects: []
};

const stackLayers = (): Array<Record<string, unknown>> => [
  { ...base, id: "group", name: "Group", type: "group", data: null },
  { ...base, id: "paint", name: "Paint", type: "raster", parentId: "group", blendMode: "multiply", data: ntlayer(dataUrl(pngs.red)) },
  { ...base, id: "shape", name: "Shape", type: "vector", data: SVG },
  { ...base, id: "mask", name: "Mask", type: "mask", visible: false, data: dataUrl(pngs.mask) }
];

const historyEntry = (): Record<string, unknown> => ({
  layerSnapshots: { paint: ntlayer(dataUrl(pngs.blue)), shape: null },
  layerStructure: [],
  documentCanvas: { width: 16, height: 16 },
  activeLayerId: "paint",
  maskLayerId: "mask",
  restoreMode: "full",
  action: "paint",
  timestamp: 1
});

function documentOf(layers: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    sketch: {
      version: 3,
      canvas: { width: 16, height: 16, backgroundColor: "#ffffff" },
      layers,
      activeLayerId: "paint",
      maskLayerId: "mask",
      history: [historyEntry()],
      historyIndex: 0
    },
    layerBindings: []
  };
}

describe("sketch zip", () => {
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
  const make = (name = "Fox"): Promise<ImageDocument> =>
    ImageDocument.create<ImageDocument>({
      user_id: USER,
      project_id: PROJECT,
      name,
      width: 16,
      height: 16,
      document: JSON.stringify(documentOf(stackLayers()))
    });
  const reload = async (id: string): Promise<ImageDocument> => {
    const row = await ImageDocument.findById(id);
    if (!row) throw new Error(`row ${id} is gone`);
    return row;
  };
  const zipAt = async (
    path: string,
    projectId = PROJECT
  ): Promise<Record<string, Uint8Array>> => {
    const bytes = await folder(projectId).read(path);
    if (bytes === null) throw new Error(`no file at ${path}`);
    return unzipSync(bytes);
  };
  const reconcile = () =>
    reconcileDocumentFiles([sketchFileAdapter], PROJECT, USER);

  beforeEach(async () => {
    initTestDb();
    pngs = {
      red: await solidPng("#ff0000"),
      blue: await solidPng("#0000ff"),
      mask: await solidPng("#ffffff")
    };
    root = await mkdtemp(join(tmpdir(), "nodetool-sketch-zip-"));
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

  it("writes one OpenRaster zip with PNGs and no base64 in the JSON", async () => {
    const row = await make();
    const bytes = (await folder().read("Sketches/Fox.sketch.ora")) as Uint8Array;
    const entries = unzipSync(bytes);

    // `mimetype` comes first and is stored, so the zip reads as OpenRaster.
    expect(strFromU8(bytes.subarray(30, 38))).toBe("mimetype");
    expect(strFromU8(entries["mimetype"] as Uint8Array)).toBe("image/openraster");
    expect(Buffer.from(entries["data/paint.png"] as Uint8Array)).toEqual(Buffer.from(pngs.red));
    expect(Buffer.from(entries["data/mask.png"] as Uint8Array)).toEqual(Buffer.from(pngs.mask));
    expect(Buffer.from(entries["nodetool/history/0/paint.png"] as Uint8Array)).toEqual(
      Buffer.from(pngs.blue)
    );
    expect(entries["data/shape.composite.png"]).toBeDefined();
    expect(entries["mergedimage.png"]).toBeDefined();
    expect(sketchFileThumbnail(bytes)).toEqual(entries[SKETCH_THUMBNAIL_ENTRY]);

    const json = strFromU8(entries["nodetool/sketch.json"] as Uint8Array);
    expect(json).not.toContain(";base64,iVBOR");
    expect(json).not.toContain("ntlayer:");
    const file = JSON.parse(json) as Record<string, unknown>;
    expect(file).toMatchObject({ format: "nodetool.sketch", id: row.id, width: 16 });
    const layers = ((file["document"] as Record<string, unknown>)["sketch"] as Record<string, unknown>)["layers"] as Array<Record<string, unknown>>;
    expect(layers.find((layer) => layer["id"] === "paint")?.["data"]).toEqual({
      ntlayer: { version: 1, image: "data/paint.png", bounds: { x: 2, y: 3, width: 8, height: 8 } }
    });
    expect(layers.find((layer) => layer["id"] === "mask")?.["data"]).toBe("data/mask.png");
    expect(layers.find((layer) => layer["id"] === "shape")?.["data"]).toBe(SVG);

    const stack = strFromU8(entries["stack.xml"] as Uint8Array);
    expect(stack).toContain('<image version="0.0.5" w="16" h="16">');
    expect(stack).toMatch(/<stack name="Group"[^>]*>\s*<layer name="Paint"[^>]*composite-op="svg:multiply" src="data\/paint.png" x="2" y="3"\/>/);
    expect(stack).toContain('src="data/shape.composite.png" x="0" y="0"');
    expect(stack).toMatch(/<layer name="Mask" [^>]*visibility="hidden"/);
    // The top of the stack comes first.
    expect(stack.indexOf('name="Mask"')).toBeLessThan(stack.indexOf('name="Group"'));

    // The hash is of the zip's bytes.
    expect((await reload(row.id)).file_hash).toBe(sha256(bytes));
  });

  it("reads the zip back as the document the row holds", async () => {
    const row = await make();
    const text = await sketchFileAdapter.codec?.decode(
      (await folder().read("Sketches/Fox.sketch.ora")) as Uint8Array
    );
    expect((JSON.parse(text ?? "{}") as Record<string, unknown>)["document"]).toEqual(
      JSON.parse(row.document)
    );
    const report = await reconcile();
    expect(report.unchanged).toBe(1);
    expect(report.imported).toEqual([]);
  });

  it("refuses a zip whose layer PNG is gone and keeps the row", async () => {
    const row = await make();
    const entries = await zipAt("Sketches/Fox.sketch.ora");
    delete entries["data/paint.png"];
    await folder().write("Sketches/Fox.sketch.ora", zipSync(entries));

    const report = await reconcile();

    expect(report.invalid).toEqual([row.id]);
    expect((await reload(row.id)).file_error).toContain("data/paint.png");
  });

  it("imports a zip another app saved, without nodetool/sketch.json, as raster layers", async () => {
    const row = await make();
    const before = (await ImageDocumentVersion.listForDocument(row.id)).length;
    await folder().write(
      "Sketches/Fox.sketch.ora",
      zipSync({
        mimetype: [strToU8("image/openraster"), { level: 0 }],
        "stack.xml": strToU8(
          '<?xml version="1.0"?><image w="16" h="16"><stack>' +
            '<layer name="Top" src="data/top.png" x="4" y="5" opacity="0.5" composite-op="svg:screen"/>' +
            '<stack name="G"><layer name="Bottom" src="data/bottom.png" visibility="hidden"/></stack>' +
            "</stack></image>"
        ),
        "data/top.png": pngs.red,
        "data/bottom.png": pngs.blue
      })
    );

    const report = await reconcile();

    expect(report.imported).toEqual([row.id]);
    const stored = await reload(row.id);
    const sketch = (JSON.parse(stored.document) as Record<string, unknown>)["sketch"] as Record<string, unknown>;
    const layers = sketch["layers"] as Array<Record<string, unknown>>;
    expect(layers.map((layer) => [layer["name"], layer["type"]])).toEqual([
      ["Bottom", "raster"],
      ["Top", "raster"]
    ]);
    expect(layers[1]).toMatchObject({
      opacity: 0.5,
      blendMode: "screen",
      transform: { x: 4, y: 5 },
      data: dataUrl(pngs.red)
    });
    expect(layers[0]?.["visible"]).toBe(false);
    // The sketch as it was is kept as "Before file edit".
    const versions = await ImageDocumentVersion.listForDocument(row.id);
    expect(versions.length).toBe(before + 1);
    expect(versions.map((version) => version.name)).toContain("Before file edit");
    // The file is written again in NodeTool's own form.
    expect((await zipAt("Sketches/Fox.sketch.ora"))["nodetool/sketch.json"]).toBeDefined();
  });

  it("renames, moves and deletes the single file", async () => {
    const row = await make();
    const renamed = await ImageDocument.updateFieldsIfUnchanged(row.id, row.updated_at, {
      name: "Wolf"
    });
    expect(await folder().exists("Sketches/Fox.sketch.ora")).toBe(false);
    expect((await reload(row.id)).file_path).toBe("Sketches/Wolf.sketch.ora");
    expect(renamed).not.toBeNull();

    expect(await moveDocumentToProject(USER, "sketch", row.id, OTHER_PROJECT)).toBe(true);
    expect(await folder().exists("Sketches/Wolf.sketch.ora")).toBe(false);
    expect(
      (await zipAt("Sketches/Wolf.sketch.ora", OTHER_PROJECT))["data/paint.png"]
    ).toBeDefined();

    await (await reload(row.id)).delete();
    expect(await folder(OTHER_PROJECT).exists("Sketches/Wolf.sketch.ora")).toBe(false);
    expect(await folder(OTHER_PROJECT).list("Sketches")).toEqual([]);
  });

  it("writes the files of sketches from before project folders", async () => {
    setImageDocumentFileSync(null);
    const legacy = await make("Old");
    setImageDocumentFileSync(documentFileSync(sketchFileAdapter));
    expect((await reload(legacy.id)).file_path).toBeNull();

    expect(await migrateSketchFiles()).toBe(1);

    const stored = await reload(legacy.id);
    expect(stored.file_path).toBe("Sketches/Old.sketch.ora");
    expect(stored.updated_at).toBe(legacy.updated_at);
    expect((await zipAt("Sketches/Old.sketch.ora"))["data/paint.png"]).toBeDefined();
    expect(await migrateSketchFiles()).toBe(0);
  });

  it("finds the sketch of a file, as projects.documentByFile does", async () => {
    const row = await make();
    const found = await findDocumentByFile(USER, [PROJECT], "Sketches/Fox.sketch.ora");
    expect(found).toMatchObject({ type: "sketch", id: row.id, name: "Fox" });
  });
});
