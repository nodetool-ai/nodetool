import { describe, expect, it } from "vitest";
import type {
  ImageDocument,
  LayerStatus,
  LayerWorkflowBinding,
  SketchDocumentLike
} from "../src/types.js";

describe("image-editor shared types", () => {
  it("supports binding a sketch-compatible document without redefining full sketch types", () => {
    interface MinimalSketchDocument extends SketchDocumentLike {
      metadata: { createdAt: string; updatedAt: string };
    }

    const binding: LayerWorkflowBinding = {
      layerId: "layer-1",
      workflowId: "workflow-1",
      status: "draft",
      versions: []
    };

    const document: ImageDocument<MinimalSketchDocument> = {
      id: "doc-1",
      projectId: "project-1",
      name: "Image document",
      sketch: {
        version: 3,
        canvas: { width: 512, height: 512 },
        layers: [
          {
            id: "layer-1",
            name: "Layer 1",
            type: "raster",
            visible: true,
            locked: false
          }
        ],
        activeLayerId: "layer-1",
        metadata: {
          createdAt: "2026-05-09T00:00:00.000Z",
          updatedAt: "2026-05-09T00:00:00.000Z"
        }
      },
      layerBindings: [binding],
      createdAt: "2026-05-09T00:00:00.000Z",
      updatedAt: "2026-05-09T00:00:00.000Z"
    };

    expect(document.layerBindings[0].status).toBe("draft");
  });

  it("keeps layer status values constrained", () => {
    const statuses: LayerStatus[] = [
      "draft",
      "queued",
      "generating",
      "generated",
      "stale",
      "failed",
      "locked",
      "missing"
    ];

    expect(statuses).toHaveLength(8);
  });
});
