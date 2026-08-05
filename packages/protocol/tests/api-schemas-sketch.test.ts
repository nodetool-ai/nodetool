import { describe, it, expect } from "vitest";
import {
  layerVersion,
  layerBindingKind,
  layerWorkflowBinding,
  sketchLayerLike,
  sketchDocumentLike,
  imageDocumentData,
  createImageDocumentInput,
  patchImageDocumentInput,
  createLayerInput,
  appendLayerVersionInput,
  sketchVersionListItem,
  sketchVersionResponse,
  listSketchVersionsInput,
  createSketchVersionInput,
  restoreSketchVersionInput
} from "../src/api-schemas/sketch.js";

const validVersionListItem = {
  id: "v1",
  version: 2,
  name: null,
  saveType: "manual",
  width: 1024,
  height: 768,
  backgroundColor: "#ffffff",
  createdAt: "2026-08-05T00:00:00.000Z"
};

const validBinding = {
  layerId: "l1",
  status: "draft",
  versions: []
};

describe("sketch.layerVersion", () => {
  it("accepts a valid success version", () => {
    const result = layerVersion.safeParse({
      id: "v1",
      createdAt: "2020",
      jobId: "j1",
      assetId: "a1",
      workflowUpdatedAt: "2020",
      dependencyHash: "h",
      paramOverridesSnapshot: {},
      status: "success"
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status enum", () => {
    const result = layerVersion.safeParse({
      id: "v1",
      createdAt: "2020",
      jobId: "j1",
      assetId: "a1",
      workflowUpdatedAt: "2020",
      dependencyHash: "h",
      paramOverridesSnapshot: {},
      status: "pending"
    });
    expect(result.success).toBe(false);
  });
});

describe("sketch.layerBindingKind", () => {
  it("accepts the four known kinds", () => {
    for (const k of ["workflow", "text-to-image", "image-to-image", "inpaint"]) {
      expect(layerBindingKind.safeParse(k).success).toBe(true);
    }
  });

  it("rejects an unknown kind", () => {
    expect(layerBindingKind.safeParse("outpaint").success).toBe(false);
  });
});

describe("sketch.layerWorkflowBinding", () => {
  it("accepts a minimal binding without kind (legacy)", () => {
    expect(layerWorkflowBinding.safeParse(validBinding).success).toBe(true);
  });

  it("accepts nullable source ids set to null", () => {
    const result = layerWorkflowBinding.safeParse({
      ...validBinding,
      sourceLayerId: null,
      sourceAssetId: null,
      maskAssetId: null
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    const result = layerWorkflowBinding.safeParse({
      ...validBinding,
      status: "unknown"
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing layerId", () => {
    const { layerId: _omit, ...rest } = validBinding;
    void _omit;
    expect(layerWorkflowBinding.safeParse(rest).success).toBe(false);
  });
});

describe("sketch.sketchLayerLike", () => {
  it("accepts a raster layer", () => {
    const result = sketchLayerLike.safeParse({
      id: "l",
      name: "n",
      type: "raster",
      visible: true,
      locked: false
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid layer type", () => {
    const result = sketchLayerLike.safeParse({
      id: "l",
      name: "n",
      type: "vector",
      visible: true,
      locked: false
    });
    expect(result.success).toBe(false);
  });
});

describe("sketch.sketchDocumentLike", () => {
  it("accepts a minimal document", () => {
    const result = sketchDocumentLike.safeParse({
      version: 1,
      canvas: { width: 100, height: 100 },
      layers: [],
      activeLayerId: "l1"
    });
    expect(result.success).toBe(true);
  });

  it("rejects when canvas dimensions are missing", () => {
    const result = sketchDocumentLike.safeParse({
      version: 1,
      canvas: { width: 100 },
      layers: [],
      activeLayerId: "l1"
    });
    expect(result.success).toBe(false);
  });
});

describe("sketch.imageDocumentData", () => {
  it("requires sketch and layerBindings", () => {
    const result = imageDocumentData.safeParse({
      sketch: {
        version: 1,
        canvas: { width: 10, height: 10 },
        layers: [],
        activeLayerId: "l1"
      },
      layerBindings: [validBinding]
    });
    expect(result.success).toBe(true);
  });
});

describe("sketch.createImageDocumentInput", () => {
  it("applies width/height/backgroundColor defaults", () => {
    const parsed = createImageDocumentInput.parse({
      name: "doc",
      projectId: "p1"
    });
    expect(parsed.width).toBe(1024);
    expect(parsed.height).toBe(1024);
    expect(parsed.backgroundColor).toBe("#ffffff");
  });

  it("rejects an empty name", () => {
    expect(
      createImageDocumentInput.safeParse({ name: "", projectId: "p" }).success
    ).toBe(false);
  });

  it("rejects a non-integer width", () => {
    expect(
      createImageDocumentInput.safeParse({
        name: "d",
        projectId: "p",
        width: 10.5
      }).success
    ).toBe(false);
  });

  it("rejects width below 1", () => {
    expect(
      createImageDocumentInput.safeParse({
        name: "d",
        projectId: "p",
        width: 0
      }).success
    ).toBe(false);
  });
});

describe("sketch.patchImageDocumentInput", () => {
  it("rejects an empty object (refine requires one field)", () => {
    expect(patchImageDocumentInput.safeParse({}).success).toBe(false);
  });

  it("accepts a single field", () => {
    expect(patchImageDocumentInput.safeParse({ name: "new" }).success).toBe(
      true
    );
  });

  it("rejects an empty name even with the field present", () => {
    expect(patchImageDocumentInput.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("sketch.createLayerInput", () => {
  it("accepts required fields with optional selectedOutputNodeId", () => {
    const result = createLayerInput.safeParse({
      id: "d1",
      layerId: "l1",
      sourceWorkflowId: "w1"
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing sourceWorkflowId", () => {
    expect(
      createLayerInput.safeParse({ id: "d1", layerId: "l1" }).success
    ).toBe(false);
  });
});

describe("sketch.appendLayerVersionInput", () => {
  it("defaults status to success", () => {
    const parsed = appendLayerVersionInput.parse({
      jobId: "j",
      assetId: "a",
      dependencyHash: "h",
      workflowUpdatedAt: "2020"
    });
    expect(parsed.status).toBe("success");
  });

  it("rejects an invalid status", () => {
    const result = appendLayerVersionInput.safeParse({
      jobId: "j",
      assetId: "a",
      dependencyHash: "h",
      workflowUpdatedAt: "2020",
      status: "bogus"
    });
    expect(result.success).toBe(false);
  });
});

describe("sketch document version schemas", () => {
  it("accepts a list item with a null name", () => {
    expect(sketchVersionListItem.safeParse(validVersionListItem).success).toBe(
      true
    );
  });

  it("rejects a saveType outside the enum", () => {
    const result = sketchVersionListItem.safeParse({
      ...validVersionListItem,
      saveType: "bogus"
    });
    expect(result.success).toBe(false);
  });

  it("response carries the captured document", () => {
    const parsed = sketchVersionResponse.parse({
      ...validVersionListItem,
      document: { sketch: { version: 3, layers: [] }, layerBindings: [] }
    });
    expect(parsed.version).toBe(2);
    expect(parsed.document).toBeDefined();
  });

  it("listSketchVersionsInput bounds the limit and enum-checks saveType", () => {
    expect(
      listSketchVersionsInput.safeParse({ id: "d1", limit: 10 }).success
    ).toBe(true);
    expect(
      listSketchVersionsInput.safeParse({ id: "d1", limit: 501 }).success
    ).toBe(false);
    expect(
      listSketchVersionsInput.safeParse({ id: "d1", saveType: "autosave" })
        .success
    ).toBe(true);
    expect(
      listSketchVersionsInput.safeParse({ id: "d1", saveType: "nope" }).success
    ).toBe(false);
  });

  it("createSketchVersionInput takes an optional name", () => {
    expect(createSketchVersionInput.safeParse({ id: "d1" }).success).toBe(true);
    expect(
      createSketchVersionInput.safeParse({ id: "d1", name: "x".repeat(201) })
        .success
    ).toBe(false);
  });

  it("restoreSketchVersionInput requires an integer version", () => {
    expect(
      restoreSketchVersionInput.safeParse({ id: "d1", version: 3 }).success
    ).toBe(true);
    expect(
      restoreSketchVersionInput.safeParse({ id: "d1", version: 1.5 }).success
    ).toBe(false);
  });
});
