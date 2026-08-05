import { describe, expect, it } from "vitest";

import {
  buildSketchDebugReport,
  renderSketchReportMarkdown,
  validateSketchDocument,
  type SketchDebugIssue,
  type SketchInteractionRecord
} from "../src/sketch-debug/index.js";

type Json = Record<string, unknown>;

const layer = (overrides: Json = {}): Json => ({
  id: "layer-1",
  name: "Background",
  type: "raster",
  visible: true,
  locked: false,
  opacity: 1,
  blendMode: "normal",
  data: null,
  ...overrides
});

const binding = (overrides: Json = {}): Json => ({
  layerId: "layer-1",
  kind: "workflow",
  workflowId: "wf-1",
  status: "generated",
  versions: [],
  ...overrides
});

const doc = (sketch: Json = {}, overrides: Json = {}): Json => ({
  sketch: {
    version: 3,
    canvas: { width: 1024, height: 768, backgroundColor: "#ffffff" },
    layers: [layer()],
    activeLayerId: "layer-1",
    maskLayerId: null,
    ...sketch
  },
  layerBindings: [],
  ...overrides
});

const codes = (issues: ReadonlyArray<SketchDebugIssue>): string[] =>
  issues.map((issue) => issue.code);

describe("validateSketchDocument — document shape", () => {
  it("accepts a minimal sound document", () => {
    const result = validateSketchDocument(doc());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects a non-object document", () => {
    const result = validateSketchDocument("not a sketch");
    expect(result.ok).toBe(false);
    expect(codes(result.errors)).toEqual(["document_invalid"]);
  });

  it("reports a document with no sketch and stops there", () => {
    const result = validateSketchDocument({ layerBindings: [] });
    expect(codes(result.errors)).toContain("sketch_missing");
  });

  it("reports layerBindings that is not an array", () => {
    const result = validateSketchDocument(doc({}, { layerBindings: {} }));
    expect(codes(result.errors)).toContain("bindings_missing");
  });

  it("reports schema_invalid but still checks the structure around it", () => {
    const result = validateSketchDocument(
      doc({ version: "three", layers: [layer({ opacity: 4 })] })
    );
    expect(codes(result.errors)).toContain("schema_invalid");
    expect(codes(result.errors)).toContain("layer_opacity_invalid");
  });
});

describe("validateSketchDocument — field_stripped", () => {
  it("flags a key the schema drops", () => {
    const result = validateSketchDocument(doc({ notes: "keep me" }));
    const stripped = result.warnings.filter((w) => w.code === "field_stripped");
    expect(stripped.map((w) => w.path)).toEqual(["sketch.notes"]);
    expect(result.ok).toBe(true);
  });

  it("says nothing about layer fields, which the schema keeps opaque", () => {
    const result = validateSketchDocument(
      doc({ layers: [layer({ segmentationMeta: { source: "sam" } })] })
    );
    expect(codes(result.warnings)).not.toContain("field_stripped");
  });
});

describe("validateSketchDocument — canvas", () => {
  it("reports a canvas with no positive size", () => {
    const result = validateSketchDocument(
      doc({ canvas: { width: 0, height: -10 } })
    );
    expect(codes(result.errors)).toEqual(["canvas_invalid", "canvas_invalid"]);
  });

  it("reports a missing canvas", () => {
    const result = validateSketchDocument(doc({ canvas: undefined }));
    expect(codes(result.errors)).toContain("canvas_missing");
  });

  it("reports a non-string backgroundColor", () => {
    const result = validateSketchDocument(
      doc({ canvas: { width: 8, height: 8, backgroundColor: 16777215 } })
    );
    expect(codes(result.errors)).toContain("canvas_invalid");
  });

  it("warns when the row's size disagrees with the canvas", () => {
    const result = validateSketchDocument(doc(), { width: 2048, height: 768 });
    const mismatch = result.warnings.filter(
      (w) => w.code === "canvas_size_mismatch"
    );
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]?.path).toBe("sketch.canvas.width");
  });
});

describe("validateSketchDocument — layers", () => {
  it("reports a duplicate layer id", () => {
    const result = validateSketchDocument(
      doc({ layers: [layer(), layer({ name: "Copy" })] })
    );
    expect(codes(result.errors)).toContain("duplicate_layer_id");
  });

  it("reports a layer missing its required fields", () => {
    const result = validateSketchDocument(
      doc({ layers: [{ id: "layer-1", name: "Background" }] })
    );
    expect(codes(result.errors)).toContain("layer_invalid");
  });

  it("reports an opacity outside [0, 1]", () => {
    const result = validateSketchDocument(
      doc({ layers: [layer({ opacity: -0.5 })] })
    );
    expect(codes(result.errors)).toContain("layer_opacity_invalid");
  });

  it("reports a blend mode no compositor ships", () => {
    const result = validateSketchDocument(
      doc({ layers: [layer({ blendMode: "vivid-light" })] })
    );
    const issue = result.errors.find((e) => e.code === "unknown_blend_mode");
    expect(issue?.layerId).toBe("layer-1");
  });

  it("reports negative content bounds", () => {
    const result = validateSketchDocument(
      doc({
        layers: [layer({ contentBounds: { x: 0, y: 0, width: -4, height: 10 } })]
      })
    );
    expect(codes(result.errors)).toEqual(["content_bounds_invalid"]);
  });

  it("warns about a parent the document does not contain", () => {
    const result = validateSketchDocument(
      doc({ layers: [layer({ parentId: "group-9" })] })
    );
    expect(codes(result.warnings)).toContain("layer_parent_missing");
  });
});

describe("validateSketchDocument — selection", () => {
  it("reports an activeLayerId naming a missing layer", () => {
    const result = validateSketchDocument(doc({ activeLayerId: "layer-9" }));
    const issue = result.errors.find((e) => e.code === "active_layer_missing");
    expect(issue?.layerId).toBe("layer-9");
  });

  it("warns about a maskLayerId naming a missing layer", () => {
    const result = validateSketchDocument(doc({ maskLayerId: "layer-9" }));
    expect(codes(result.warnings)).toContain("mask_layer_missing");
  });

  it("warns about a document with no layers at all", () => {
    const result = validateSketchDocument(
      doc({ layers: [], activeLayerId: "" })
    );
    expect(codes(result.warnings)).toContain("document_empty");
    expect(codes(result.errors)).not.toContain("active_layer_missing");
  });
});

describe("validateSketchDocument — bindings", () => {
  it("accepts a workflow binding on a layer the document has", () => {
    const result = validateSketchDocument(doc({}, { layerBindings: [binding()] }));
    expect(result.ok).toBe(true);
  });

  it("reports a binding on a layer the document lacks", () => {
    const result = validateSketchDocument(
      doc({}, { layerBindings: [binding({ layerId: "layer-9" })] })
    );
    expect(codes(result.errors)).toContain("binding_layer_missing");
  });

  it("reports two bindings for one layer", () => {
    const result = validateSketchDocument(
      doc({}, { layerBindings: [binding(), binding({ workflowId: "wf-2" })] })
    );
    expect(codes(result.errors)).toContain("duplicate_binding");
  });

  it("reports a workflow binding with no workflowId", () => {
    const result = validateSketchDocument(
      doc({}, { layerBindings: [binding({ workflowId: "" })] })
    );
    expect(codes(result.errors)).toContain("binding_workflow_missing");
  });

  it("reports a status outside the enum", () => {
    const result = validateSketchDocument(
      doc({}, { layerBindings: [binding({ status: "rendering" })] })
    );
    expect(codes(result.errors)).toContain("binding_status_invalid");
  });

  it("reports a version status outside the enum", () => {
    const result = validateSketchDocument(
      doc(
        {},
        {
          layerBindings: [
            binding({
              versions: [
                {
                  id: "v1",
                  createdAt: "2026-01-01T00:00:00.000Z",
                  jobId: "job-1",
                  assetId: "asset-1",
                  workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
                  dependencyHash: "abc",
                  paramOverridesSnapshot: {},
                  status: "done"
                }
              ]
            })
          ]
        }
      )
    );
    expect(codes(result.errors)).toContain("version_status_invalid");
  });

  it("reports an unknown binding kind", () => {
    const result = validateSketchDocument(
      doc({}, { layerBindings: [binding({ kind: "video" })] })
    );
    expect(codes(result.errors)).toContain("binding_kind_invalid");
  });

  it("warns about a direct-gen binding with no prompt", () => {
    const result = validateSketchDocument(
      doc(
        {},
        {
          layerBindings: [
            binding({ kind: "text-to-image", workflowId: undefined, prompt: "" })
          ]
        }
      )
    );
    expect(codes(result.warnings)).toContain("binding_incomplete");
  });

  it("warns about an image-to-image source layer that is gone", () => {
    const result = validateSketchDocument(
      doc(
        {},
        {
          layerBindings: [
            binding({
              kind: "image-to-image",
              workflowId: undefined,
              prompt: "restyle",
              sourceLayerId: "layer-9"
            })
          ]
        }
      )
    );
    expect(codes(result.warnings)).toContain("binding_source_layer_missing");
  });
});

const interaction = (
  overrides: Partial<SketchInteractionRecord> = {}
): SketchInteractionRecord => ({
  tool: "ui_sketch_add_layer",
  input: { name: "Glow" },
  ok: true,
  ...overrides
});

describe("buildSketchDebugReport", () => {
  it("describes a clean document and lists what is not simulated", () => {
    const report = buildSketchDebugReport({
      target: { kind: "file", ref: "sketch.json" },
      document: doc({}, { layerBindings: [binding()] })
    });

    expect(report.verdict.ok).toBe(true);
    expect(report.meta).toEqual({
      width: 1024,
      height: 768,
      backgroundColor: "#ffffff",
      layerCount: 1,
      bindingCount: 1
    });
    expect(report.notSimulated.join(" ")).toMatch(/Pixels/);
  });

  it("fails the verdict on a failed interaction", () => {
    const report = buildSketchDebugReport({
      target: { kind: "id", ref: "img-1" },
      document: doc(),
      interactions: [interaction({ ok: false, error: 'No layer found matching "nope".' })]
    });

    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.issues[0]).toMatch(/ui_sketch_add_layer` failed/);
  });

  it("validates the post-edit document and describes it, not the input", () => {
    const report = buildSketchDebugReport({
      target: { kind: "file", ref: "sketch.json" },
      document: doc(),
      interactions: [interaction()],
      finalState: { layers: [] },
      finalDocument: doc({
        layers: [layer(), layer({ id: "layer-2", name: "Glow", opacity: 9 })]
      })
    });

    expect(report.meta.layerCount).toBe(2);
    expect(codes(report.finalValidation?.errors ?? [])).toContain(
      "layer_opacity_invalid"
    );
    expect(report.verdict.issues.some((i) => i.startsWith("After edits"))).toBe(true);
  });

  it("keeps warnings out of the ok verdict", () => {
    const report = buildSketchDebugReport({
      target: { kind: "file", ref: "sketch.json" },
      document: doc({ maskLayerId: "layer-9" })
    });

    expect(report.verdict.ok).toBe(true);
    expect(report.verdict.warnings?.[0]).toMatch(/mask_layer_missing/);
  });
});

describe("renderSketchReportMarkdown", () => {
  it("renders the verdict, the issue table, the steps and the final stack", () => {
    const report = buildSketchDebugReport({
      target: { kind: "file", ref: "sketch.json", name: "Poster" },
      document: doc({ activeLayerId: "layer-9" }),
      interactions: [interaction()],
      finalState: {
        width: 1024,
        height: 768,
        activeLayerId: "layer-2",
        layers: [
          {
            id: "layer-1",
            name: "Background",
            type: "raster",
            visible: true,
            opacity: 1,
            blendMode: "normal"
          },
          {
            id: "layer-2",
            name: "Glow",
            type: "raster",
            visible: true,
            opacity: 0.5,
            blendMode: "multiply",
            hasBinding: true
          }
        ]
      }
    });

    const md = renderSketchReportMarkdown(report);
    expect(md).toContain("# Sketch debug: Poster");
    expect(md).toContain("❌");
    expect(md).toContain("`active_layer_missing`");
    expect(md).toContain("| `ui_sketch_add_layer` | ✅ |");
    expect(md).toContain('`layer-2` "Glow"');
    expect(md).toContain("## Not simulated");
  });
});
