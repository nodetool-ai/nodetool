/** The workflows that reference a document (document editor PRD R15). */
import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "../src/db.js";
import {
  documentReferencesInGraph,
  workflowsReferencingDocument
} from "../src/document-index.js";
import { Workflow } from "../src/workflow.js";

const DOC = "0123456789abcdef0123456789abcdef";

describe("document references", () => {
  beforeEach(() => initTestDb());

  it("finds document values by asset id or asset URI, in data or properties", () => {
    expect(
      documentReferencesInGraph({
        nodes: [
          { id: "a", type: "nodetool.constant.Document", data: { value: { type: "document", asset_id: DOC } } },
          { id: "b", type: "nodetool.document.SaveDocumentFile", properties: { target: { type: "document", uri: `asset://${DOC}` } } },
          { id: "c", type: "nodetool.constant.Image", data: { value: { type: "image", asset_id: DOC } } }
        ]
      })
    ).toEqual([
      { nodeId: "a", nodeType: "nodetool.constant.Document", property: "value", assetId: DOC },
      { nodeId: "b", nodeType: "nodetool.document.SaveDocumentFile", property: "target", assetId: DOC }
    ]);
  });

  it("lists only the user's workflows that name the document", async () => {
    await Workflow.create<Workflow>({
      id: "uses",
      user_id: "u1",
      name: "Uses it",
      graph: {
        nodes: [{ id: "n1", type: "nodetool.constant.Document", data: { value: { type: "document", asset_id: DOC } } }],
        edges: []
      }
    });
    await Workflow.create<Workflow>({
      id: "other",
      user_id: "u1",
      name: "Other",
      graph: { nodes: [{ id: "n1", type: "nodetool.constant.String", data: { value: "x" } }], edges: [] }
    });
    await Workflow.create<Workflow>({
      id: "foreign",
      user_id: "u2",
      name: "Foreign",
      graph: {
        nodes: [{ id: "n1", type: "nodetool.constant.Document", data: { value: { type: "document", asset_id: DOC } } }],
        edges: []
      }
    });
    expect(await workflowsReferencingDocument("u1", DOC)).toEqual([
      {
        workflowId: "uses",
        name: "Uses it",
        nodes: [{ nodeId: "n1", nodeType: "nodetool.constant.Document", property: "value" }]
      }
    ]);
  });
});
