/**
 * The image flow, headless (PRD § 10.6, § 10.7 criterion 6).
 *
 * Whatever the editor's flow writes, `edit_sketch`'s `set_setup` op and
 * `refine_image_brief` have to write too — otherwise the flow is a UI feature
 * with an agent that cannot reach it. Criterion 3 is checked here as well: the
 * headless refinement adds no layer and no binding either.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { ImageDocument, ModelObserver, initTestDb } from "@nodetool-ai/models";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

const REFINED = {
  subject: "a ceramic pour-over dripper",
  composition: "centred on seamless white",
  lighting: "soft window light from the left",
  style_words: "product photography, 85mm",
  negative: "hands, text"
};

/** A context whose language model answers with one structured tool call. */
function ctx(answer?: Record<string, unknown>) {
  return {
    userId: "u1",
    getProvider: vi.fn(async () => ({
      generateMessage: vi.fn(async () => ({
        content: "",
        toolCalls: answer ? [{ name: "image_brief", args: answer }] : []
      }))
    }))
  } as unknown as ProcessingContext;
}

const run = (context: ProcessingContext) =>
  createCapabilityRun({ context, gate: UNGATED });

const documentData = () => ({
  sketch: {
    version: 3,
    canvas: { width: 1024, height: 768, backgroundColor: "#ffffff" },
    layers: [
      {
        id: "layer-1",
        name: "Background",
        type: "raster",
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: "normal",
        data: null
      }
    ],
    activeLayerId: "layer-1",
    maskLayerId: null
  },
  layerBindings: []
});

const makeSketch = async (): Promise<ImageDocument> =>
  ImageDocument.create<ImageDocument>({
    user_id: "u1",
    project_id: "default",
    name: "Poster",
    width: 1024,
    height: 768,
    background_color: "#ffffff",
    document: JSON.stringify(documentData())
  });

const reload = async (id: string) => {
  const row = await ImageDocument.findById(id);
  if (!row) throw new Error("sketch vanished");
  return row.toDocumentData();
};

beforeEach(() => initTestDb());
afterEach(() => ModelObserver.clear());

describe("edit_sketch set_setup", () => {
  it("writes the brief, the use case, the count and the stage", async () => {
    const sketch = await makeSketch();
    const result = (await run(ctx()).invoke("edit_sketch", {
      image_document_id: sketch.id,
      ops: [
        {
          op: "set_setup",
          brief: "a pour-over dripper on a sunlit counter",
          use_case: "product",
          variations: 4,
          stage: "look"
        }
      ]
    })) as { failed: number };
    expect(result.failed).toBe(0);

    const data = await reload(sketch.id);
    expect(data.sketch.setup).toMatchObject({
      brief: "a pour-over dripper on a sunlit counter",
      use_case: "product",
      variations: 4,
      stage: "look"
    });
  });

  it("applies the use case's default size and count", async () => {
    const sketch = await makeSketch();
    await run(ctx()).invoke("edit_sketch", {
      image_document_id: sketch.id,
      ops: [{ op: "set_setup", use_case: "key-art" }]
    });
    const data = await reload(sketch.id);
    expect(data.sketch.canvas).toMatchObject({ width: 683, height: 1024 });
    expect(data.sketch.setup?.variations).toBe(2);
  });

  it("refuses a use case and a stage the flow does not have", async () => {
    const sketch = await makeSketch();
    const result = (await run(ctx()).invoke("edit_sketch", {
      image_document_id: sketch.id,
      ops: [
        { op: "set_setup", use_case: "mural" },
        { op: "set_setup", stage: "rendering" }
      ]
    })) as { failed: number; ops: Array<{ ok: boolean; error?: string }> };
    expect(result.failed).toBe(2);
    expect(result.ops[0].error).toContain("use_case");
    expect(result.ops[1].error).toContain("stage");
    expect((await reload(sketch.id)).sketch.setup).toBeUndefined();
  });

  it("leaves a document that never entered the flow without a setup", async () => {
    const sketch = await makeSketch();
    await run(ctx()).invoke("edit_sketch", {
      image_document_id: sketch.id,
      ops: [{ op: "add_layer", name: "Shadow" }]
    });
    expect((await reload(sketch.id)).sketch.setup).toBeUndefined();
  });
});

describe("refine_image_brief (criterion 3)", () => {
  it("expands the brief and adds no layer and no binding", async () => {
    const sketch = await makeSketch();
    await run(ctx()).invoke("edit_sketch", {
      image_document_id: sketch.id,
      ops: [
        {
          op: "set_setup",
          brief: "a pour-over dripper",
          use_case: "product",
          stage: "useCase"
        }
      ]
    });
    const before = await reload(sketch.id);

    const result = (await run(ctx(REFINED)).invoke("refine_image_brief", {
      image_document_id: sketch.id,
      provider: "test",
      model: "test-model"
    })) as { stage?: string; refined?: Record<string, string>; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.stage).toBe("review");
    expect(result.refined).toEqual(REFINED);

    const after = await reload(sketch.id);
    expect(after.sketch.setup?.refined).toEqual(REFINED);
    expect(after.sketch.setup?.stage).toBe("review");
    // Nothing was rendered: the layer stack and the bindings are untouched.
    expect(after.sketch.layers).toHaveLength(before.sketch.layers.length);
    expect(after.layerBindings).toEqual([]);
  });

  it("refuses a sketch with no brief", async () => {
    const sketch = await makeSketch();
    const result = (await run(ctx(REFINED)).invoke("refine_image_brief", {
      image_document_id: sketch.id,
      provider: "test",
      model: "test-model"
    })) as { error?: string };
    expect(result.error).toContain("no brief");
  });

  it("reports a model that answered with nothing usable", async () => {
    const sketch = await makeSketch();
    await run(ctx()).invoke("edit_sketch", {
      image_document_id: sketch.id,
      ops: [{ op: "set_setup", brief: "a dripper" }]
    });
    const result = (await run(ctx()).invoke("refine_image_brief", {
      image_document_id: sketch.id,
      provider: "test",
      model: "test-model"
    })) as { error?: string };
    expect(result.error).toContain("no usable brief");
    expect((await reload(sketch.id)).sketch.setup?.refined).toBeUndefined();
  });
});
